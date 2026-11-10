import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { orders, webhookEvents } from "../db/schema";
import { env, paypalConfigured } from "../env";
import { enqueue } from "../jobs/queue";
import { kvSet, recordActivity } from "../kv";
import { log } from "../log";
import { refreshProtection } from "../protection";
import { verifyWebhookSignature } from "./rest";

export const WEBHOOK_EVENT_TYPES = [
	"CUSTOMER.DISPUTE.CREATED",
	"CUSTOMER.DISPUTE.UPDATED",
	"CUSTOMER.DISPUTE.RESOLVED",
	"PAYMENT.CAPTURE.COMPLETED",
	"PAYMENT.CAPTURE.REFUNDED",
];

type WebhookEvent = {
	id: string;
	event_type: string;
	resource_type?: string;
	resource?: Record<string, unknown>;
	create_time?: string;
};

/** Verify the PayPal signature via POST /v1/notifications/verify-webhook-signature. */
export async function verifyWebhook(
	headers: Headers,
	event: unknown,
): Promise<{ verified: boolean; detail: string }> {
	const webhookId = env().PAYPAL_WEBHOOK_ID;
	if (!webhookId) return { verified: false, detail: "PAYPAL_WEBHOOK_ID not set" };
	if (!paypalConfigured()) return { verified: false, detail: "PayPal not configured" };
	const h = (k: string) => headers.get(k) ?? "";
	try {
		const r = await verifyWebhookSignature({
			auth_algo: h("paypal-auth-algo"),
			cert_url: h("paypal-cert-url"),
			transmission_id: h("paypal-transmission-id"),
			transmission_sig: h("paypal-transmission-sig"),
			transmission_time: h("paypal-transmission-time"),
			webhook_id: webhookId,
			webhook_event: event,
		});
		return { verified: r.data.verification_status === "SUCCESS", detail: `${r.data.verification_status} (debug ${r.debugId})` };
	} catch (err) {
		return { verified: false, detail: err instanceof Error ? err.message : String(err) };
	}
}

/** Store a webhook once (unique event.id) and enqueue processing. Returns false if duplicate. */
export async function ingestWebhook(rawBody: string, headers: Headers): Promise<{ stored: boolean; verified: boolean; id?: string }> {
	let event: WebhookEvent;
	try {
		event = JSON.parse(rawBody) as WebhookEvent;
	} catch {
		throw Object.assign(new Error("Invalid JSON"), { status: 400 });
	}
	if (!event?.id || !event.event_type) throw Object.assign(new Error("Not a PayPal webhook event"), { status: 400 });
	const v = await verifyWebhook(headers, event);
	const inserted = await db()
		.insert(webhookEvents)
		.values({ id: event.id, type: event.event_type, verified: v.verified, verifyDetail: v.detail, payload: event })
		.onConflictDoNothing()
		.returning({ id: webhookEvents.id });
	await kvSet("webhook.last", { at: new Date().toISOString(), type: event.event_type, verified: v.verified });
	if (!inserted.length) return { stored: false, verified: v.verified, id: event.id };
	log.info({ webhook: { id: event.id, type: event.event_type, verified: v.verified, detail: v.detail } }, "webhook stored");
	if (v.verified) await enqueue("process_webhook", { refId: event.id });
	return { stored: true, verified: v.verified, id: event.id };
}

export async function processWebhook(eventId: string): Promise<void> {
	const [row] = await db().select().from(webhookEvents).where(eq(webhookEvents.id, eventId)).limit(1);
	if (!row || row.processedAt) return;
	const event = row.payload as WebhookEvent;
	const res = event.resource ?? {};
	try {
		if (event.event_type.startsWith("CUSTOMER.DISPUTE.")) {
			const disputeId = (res.dispute_id as string) ?? (res.id as string);
			if (disputeId) await enqueue("sync_dispute", { refId: disputeId, payload: { reason: event.event_type }, dedupe: true });
		} else if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
			const captureId = res.id as string;
			const [o] = await db().select().from(orders).where(eq(orders.captureId, captureId)).limit(1);
			if (o) await refreshProtection([o.id]);
		} else if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
			const links = (res.links as { rel: string; href: string }[] | undefined) ?? [];
			const up = links.find((l) => l.rel === "up")?.href ?? "";
			const captureId = up.split("/").pop();
			if (captureId) {
				const [o] = await db().select().from(orders).where(eq(orders.captureId, captureId)).limit(1);
				if (o) {
					await db().update(orders).set({ status: "refunded" }).where(eq(orders.id, o.id));
					await recordActivity({ actor: "paypal", kind: "refund", text: `Refund issued for order #${o.number}`, orderId: o.id });
				}
			}
		}
		await db().update(webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(webhookEvents.id, eventId));
	} catch (err) {
		await db()
			.update(webhookEvents)
			.set({ error: err instanceof Error ? err.message : String(err) })
			.where(eq(webhookEvents.id, eventId));
		throw err;
	}
}
