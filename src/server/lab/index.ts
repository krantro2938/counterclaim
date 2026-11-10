import { randomUUID } from "node:crypto";
import { desc, sql as dsql, eq } from "drizzle-orm";
import { db } from "../db/client";
import { customerMessages, orders, shipments } from "../db/schema";
import { publish } from "../events/bus";
import { enqueue } from "../jobs/queue";
import { recordActivity } from "../kv";
import { adjudicate, escalate, requireEvidence } from "../paypal/rest";
import { syncDispute } from "../sync/disputes";

/** Sandbox-only controls. Every call here is either a sandbox-only PayPal endpoint or a simulator. */

export async function labEscalate(disputeId: string) {
	const r = await escalate(
		disputeId,
		"Escalating to PayPal for review (sandbox lab).",
		randomUUID(),
	);
	await recordActivity({
		actor: "simulated",
		kind: "lab",
		text: "Sandbox: escalated to a claim",
		disputeId,
		meta: { debugId: r.debugId },
	});
	await syncDispute(disputeId, { reason: "lab" });
	return { ok: true, debugId: r.debugId };
}

export async function labRequireEvidence(
	disputeId: string,
	who: "SELLER_EVIDENCE" | "BUYER_EVIDENCE" = "SELLER_EVIDENCE",
) {
	const r = await requireEvidence(disputeId, who, randomUUID());
	await recordActivity({
		actor: "simulated",
		kind: "lab",
		text: `Sandbox: PayPal requested ${who === "SELLER_EVIDENCE" ? "seller" : "buyer"} evidence`,
		disputeId,
		meta: { debugId: r.debugId },
	});
	await syncDispute(disputeId, { reason: "lab" });
	return { ok: true, debugId: r.debugId };
}

export async function labAdjudicate(
	disputeId: string,
	outcome: "SELLER_FAVOR" | "BUYER_FAVOR",
) {
	const r = await adjudicate(disputeId, outcome, randomUUID());
	await recordActivity({
		actor: "simulated",
		kind: "lab",
		text: `Sandbox: adjudicated in ${outcome === "SELLER_FAVOR" ? "seller" : "buyer"}'s favour`,
		disputeId,
		meta: { debugId: r.debugId },
	});
	await syncDispute(disputeId, { reason: "lab" });
	return { ok: true, debugId: r.debugId };
}

export async function labSync() {
	const id = await enqueue("poll_disputes", { payload: { manual: true } });
	return { queued: true, jobId: id };
}

/**
 * Demo storylines: seed the merchant's support-inbox messages for an order (our own data, not PayPal's).
 * - delivered: buyer asked about delivery, merchant replied with tracking.
 * - glaze: buyer says the colour differs from the photo, politely.
 * - silent: no prior contact.
 */
export const STORIES = ["delivered", "glaze", "silent"] as const;
export type Story = (typeof STORIES)[number];

export async function labAttachStory(orderId: string, story: Story) {
	const [o] = await db()
		.select()
		.from(orders)
		.where(eq(orders.id, orderId))
		.limit(1);
	if (!o) throw Object.assign(new Error("Order not found"), { status: 404 });
	await db()
		.delete(customerMessages)
		.where(eq(customerMessages.orderId, orderId));
	const base = o.capturedAt ?? new Date();
	const at = (mins: number) => new Date(base.getTime() + mins * 60_000);
	const first = (o.buyerName ?? "there").split(" ")[0];
	const item = o.items[0]?.title ?? "your order";
	const msgs: { direction: "in" | "out"; body: string; sentAt: Date }[] = [];
	if (story === "delivered") {
		msgs.push(
			{
				direction: "in",
				body: `Hi! Just checking when my ${item} will arrive?`,
				sentAt: at(20),
			},
			{
				direction: "out",
				body: `Hi ${first}, it shipped with USPS today. Tracking is on your PayPal receipt and should arrive in 3–5 days.`,
				sentAt: at(32),
			},
		);
	} else if (story === "glaze") {
		msgs.push(
			{
				direction: "in",
				body: `Hello, the ${item} arrived safely, thank you. The glaze is a lot greener than in the photo though. Is that normal?`,
				sentAt: at(25),
			},
			{
				direction: "out",
				body: `Hi ${first}, thanks for letting us know. Each piece is hand-glazed so the colour shifts in the kiln, which is mentioned on the listing. Happy to help if you're unhappy with it.`,
				sentAt: at(40),
			},
			{
				direction: "in",
				body: "Thanks. I like the shape but I was hoping for the paler colour. I'll think about it.",
				sentAt: at(55),
			},
		);
	}
	if (msgs.length) {
		await db()
			.insert(customerMessages)
			.values(msgs.map((m) => ({ orderId, channel: "email", ...m })));
	}
	await recordActivity({
		actor: "simulated",
		kind: "lab",
		text: `Demo inbox seeded for order #${o.number} (${story})`,
		orderId,
	});
	await publish({ type: "order.updated", orderId, number: o.number });
	return { ok: true, messages: msgs.length };
}

export async function latestShipment(orderId: string) {
	const [s] = await db()
		.select()
		.from(shipments)
		.where(eq(shipments.orderId, orderId))
		.orderBy(desc(shipments.shippedAt))
		.limit(1);
	return s ?? null;
}

/** Wipe demo-generated data (disputes, assessments, actions, activity, jobs). Keeps products, policies, orders. */
export async function labReset(
	opts: { keepOrders?: boolean } = { keepOrders: true },
) {
	await db().execute(
		dsql`truncate table agent_steps, evidence_files, actions, assessments, activity, webhook_events, jobs restart identity cascade`,
	);
	await db().execute(dsql`delete from disputes`);
	await db().execute(dsql`delete from kv where key like 'poller.%'`);
	if (!opts.keepOrders) {
		await db().execute(
			dsql`truncate table carrier_events, shipments, customer_messages, orders cascade`,
		);
	}
	await enqueue("poll_disputes");
	await enqueue("protection_scan");
	await publish({ type: "kpi.updated" });
	return { ok: true };
}
