import { and, desc, eq, inArray } from "drizzle-orm";
import { ACTION_TO_REL, actionLabel, hasRel } from "#/lib/labels";
import { formatMoney, minorToPaypalMoney } from "#/lib/money";
import { buildCaseFile } from "../casefile";
import { db } from "../db/client";
import { actions, assessments, disputes, evidenceFiles } from "../db/schema";
import { isSandbox } from "../env";
import { publish } from "../events/bus";
import { pickEvidenceType } from "../evidence/type";
import { enqueue } from "../jobs/queue";
import { recordActivity } from "../kv";
import { log } from "../log";
import {
	acceptClaim,
	escalate,
	makeOffer,
	PayPalError,
	provideEvidence,
	sendMessage,
} from "../paypal/rest";
import { actionToolkit, runToolkitTool } from "../paypal/toolkit";
import { getSettings } from "../settings";
import { syncDispute } from "../sync/disputes";

type ActionRow = typeof actions.$inferSelect;
type Result = {
	response: unknown;
	debugId: string | null;
	via: string;
	/** What was actually sent (rendered on executed cards). */
	sent?: Record<string, unknown>;
};

/** Executes approved actions against PayPal (SPEC §7.5). PayPal-Request-Id = action UUID. Never auto-retries. */
export async function executeAction(actionId: string): Promise<void> {
	const [a] = await db()
		.select()
		.from(actions)
		.where(eq(actions.id, actionId))
		.limit(1);
	if (!a) return;
	if (
		a.status === "auto_scheduled" &&
		a.executeAfter &&
		a.executeAfter > new Date()
	) {
		await enqueue("execute_action", { refId: a.id, runAfter: a.executeAfter });
		return;
	}
	// Atomic claim: only one executor wins, and an undo/cancel racing us loses cleanly.
	const claimed = await db()
		.update(actions)
		.set({ status: "executing" })
		.where(
			and(
				eq(actions.id, a.id),
				inArray(actions.status, ["approved", "auto_scheduled"]),
			),
		)
		.returning({ id: actions.id });
	if (!claimed.length) {
		log.info({ actionId, status: a.status }, "action not executable; skipping");
		return;
	}
	await publish({
		type: "action.updated",
		disputeId: a.disputeId,
		actionId: a.id,
		status: "executing",
	});

	try {
		// HATEOAS gate against the latest PayPal snapshot.
		await syncDispute(a.disputeId, { reason: "pre-execute" });
		const [d] = await db()
			.select()
			.from(disputes)
			.where(eq(disputes.id, a.disputeId))
			.limit(1);
		const rel = ACTION_TO_REL[a.type];
		if (!d || !hasRel(d.links, rel)) {
			throw Object.assign(
				new Error(
					`PayPal no longer allows "${rel}" on this dispute (status ${d?.status ?? "?"})`,
				),
				{ code: "NOT_ALLOWED" },
			);
		}
		const r = await perform(a, d);
		await db()
			.update(actions)
			.set({
				status: "succeeded",
				response: { via: r.via, body: r.response, sent: r.sent },
				paypalDebugId: r.debugId,
				executedAt: new Date(),
				error: null,
			})
			.where(eq(actions.id, a.id));
		const amt =
			typeof a.params.amountMinor === "number"
				? ` (${formatMoney(a.params.amountMinor, d.currency)})`
				: "";
		await recordActivity({
			actor: a.source === "autopilot" ? "agent" : "merchant",
			kind: "action_succeeded",
			text: `${a.source === "autopilot" ? "Autopilot sent" : "Sent to PayPal"}: ${actionLabel(a.type)}${amt}`,
			disputeId: a.disputeId,
			orderId: d.orderId,
			meta: { actionId: a.id, debugId: r.debugId, via: r.via },
		});
		await publish({
			type: "action.updated",
			disputeId: a.disputeId,
			actionId: a.id,
			status: "succeeded",
		});
		await enqueue("sync_dispute", {
			refId: a.disputeId,
			payload: { reason: "post-execute" },
			runAfter: new Date(Date.now() + 3000),
			dedupe: true,
		});
	} catch (err) {
		const error =
			err instanceof PayPalError
				? err.toJSON()
				: {
						name: (err as { code?: string }).code ?? "EXECUTION_FAILED",
						message: err instanceof Error ? err.message : String(err),
					};
		log.warn({ actionId, error }, "action failed");
		await db()
			.update(actions)
			.set({
				status: "failed",
				error,
				paypalDebugId: (error as { debugId?: string }).debugId ?? null,
				executedAt: new Date(),
			})
			.where(eq(actions.id, a.id));
		await recordActivity({
			actor: "paypal",
			kind: "action_failed",
			text: `PayPal rejected ${actionLabel(a.type)}: ${error.message}`,
			disputeId: a.disputeId,
			meta: { actionId: a.id, error },
		});
		await publish({
			type: "action.updated",
			disputeId: a.disputeId,
			actionId: a.id,
			status: "failed",
		});
		// PayPal's allowed actions or requested evidence changed: get a fresh recommendation.
		const issue = JSON.stringify(error);
		if (
			/NOT_ALLOWED|EVIDENCE_TYPE_CHANGED|EVIDENCE_TYPE_IS_NOT_ALLOWED|ACTION_NOT_ALLOWED/.test(
				issue,
			)
		)
			await enqueue("assess", { refId: a.disputeId, dedupe: true });
		// No rethrow: mutating calls are never retried automatically.
	}
}

async function perform(
	a: ActionRow,
	d: typeof disputes.$inferSelect,
): Promise<Result> {
	const p = a.params as Record<string, unknown>;
	const reqId = a.paypalRequestId;
	switch (a.type) {
		case "send_message": {
			const r = await sendMessage(d.id, String(p.message), reqId);
			return { response: r.data, debugId: r.debugId, via: "rest:send-message" };
		}
		case "make_offer": {
			const r = await makeOffer(
				d.id,
				{
					note: String(p.note),
					offer_type: String(p.offerType ?? "REFUND"),
					...(typeof p.amountMinor === "number"
						? { offer_amount: minorToPaypalMoney(p.amountMinor, d.currency) }
						: {}),
				},
				reqId,
			);
			return { response: r.data, debugId: r.debugId, via: "rest:make-offer" };
		}
		case "escalate": {
			const r = await escalate(d.id, String(p.note), reqId);
			return { response: r.data, debugId: r.debugId, via: "rest:escalate" };
		}
		case "accept_claim": {
			const partial =
				p.acceptClaimType === "PARTIAL_REFUND" ||
				p.acceptClaimType === "REFUND_WITH_RETURN";
			if (!partial) {
				// Full refund: PayPal Agent Toolkit accept_dispute_claim, called programmatically (never by the model).
				const tk = await runToolkitTool(
					actionToolkit(reqId),
					"accept_dispute_claim",
					{ dispute_id: d.id, note: String(p.note) },
				);
				if (tk.ok)
					return {
						response: tk.data,
						debugId: null,
						via: "toolkit:accept_dispute_claim",
					};
				log.warn(
					{ toolkit: tk.data },
					"toolkit accept_dispute_claim failed; using REST",
				);
			}
			const r = await acceptClaim(
				d.id,
				{
					note: String(p.note),
					accept_claim_type: String(p.acceptClaimType ?? "REFUND"),
					...(typeof p.amountMinor === "number"
						? { refund_amount: minorToPaypalMoney(p.amountMinor, d.currency) }
						: {}),
				},
				reqId,
			);
			return { response: r.data, debugId: r.debugId, via: "rest:accept-claim" };
		}
		case "provide_evidence":
			return provideEvidenceAction(a, d);
		default:
			throw new Error(`Unknown action type ${a.type}`);
	}
}

async function provideEvidenceAction(
	a: ActionRow,
	d: typeof disputes.$inferSelect,
): Promise<Result> {
	const p = a.params as {
		evidenceType?: string;
		notes?: string;
		includeTracking?: boolean;
		includePdf?: boolean;
	};
	const cf = await buildCaseFile(d.id);
	// PayPal only accepts evidence types it requested. What the merchant approved is what gets sent:
	// if PayPal now wants a different type, fail closed and re-assess (like the HATEOAS gate).
	const evidenceType = pickEvidenceType(
		cf.dispute.evidencesRequested,
		Boolean(cf.shipment),
		isSandbox(),
	);
	if (p.evidenceType && p.evidenceType !== evidenceType) {
		throw Object.assign(
			new Error(
				`PayPal now asks for ${evidenceType} evidence, but this action was approved as ${p.evidenceType}. Re-assessing.`,
			),
			{ code: "EVIDENCE_TYPE_CHANGED" },
		);
	}
	const settings = await getSettings();
	const [assess] = await db()
		.select()
		.from(assessments)
		.where(eq(assessments.disputeId, d.id))
		.orderBy(desc(assessments.version))
		.limit(1);
	let file:
		| { name: string; bytes: Uint8Array; contentType: string }
		| undefined;
	if (p.includePdf !== false) {
		const { renderEvidencePdf } = await import("../evidence/pdf");
		const pdf = await renderEvidencePdf({
			cf,
			merchantName: settings.storeName,
			summary: p.notes ?? assess?.headline ?? "",
			points: (assess?.reasoning ?? []).map((r) => r.point),
			generatedAt: new Date(),
		});
		await db().insert(evidenceFiles).values({
			disputeId: d.id,
			actionId: a.id,
			filename: pdf.filename,
			bytes: pdf.bytes,
			sizeBytes: pdf.bytes.length,
			sha256: pdf.sha256,
		});
		file = {
			name: pdf.filename,
			bytes: pdf.bytes,
			contentType: "application/pdf",
		};
	}
	const trackingInfo =
		p.includeTracking !== false &&
		cf.shipment &&
		evidenceType === "PROOF_OF_FULFILLMENT"
			? [
					{
						carrier_name: cf.shipment.carrier,
						tracking_number: cf.shipment.trackingNumber,
					},
				]
			: undefined;
	const ev = {
		evidenceType,
		trackingInfo,
		notes: withTracking(
			p.notes ?? "Evidence packet attached.",
			evidenceType,
			cf.shipment,
		),
		file,
	};
	try {
		const r = await provideEvidence(d.id, ev, a.paypalRequestId);
		return {
			response: r.data,
			debugId: r.debugId,
			via: "rest:provide-evidence (multipart: input + evidence-file)",
			sent: {
				evidenceType,
				trackingNumber: trackingInfo?.[0]?.tracking_number ?? null,
				pdf: file?.name ?? null,
			},
		};
	} catch (err) {
		// The file part name is documented inconsistently; retry once with the alternative, with a new request id.
		if (
			err instanceof PayPalError &&
			err.status === 400 &&
			file &&
			/file|document|media|multipart/i.test(JSON.stringify(err.toJSON()))
		) {
			log.warn(
				{ err: err.toJSON() },
				"provide-evidence rejected the file part; retrying with evidence_file",
			);
			const r = await provideEvidence(
				d.id,
				ev,
				`${a.paypalRequestId}-b`,
				"evidence_file",
			);
			return {
				response: r.data,
				debugId: r.debugId,
				via: "rest:provide-evidence (multipart: input + evidence_file)",
				sent: {
					evidenceType,
					trackingNumber: trackingInfo?.[0]?.tracking_number ?? null,
					pdf: file?.name ?? null,
				},
			};
		}
		throw err;
	}
}

/** OTHER evidence carries no tracking_info field, so the tracking goes into the notes. */
function withTracking(
	notes: string,
	evidenceType: string,
	shipment: { carrier: string; trackingNumber: string } | null,
): string {
	if (evidenceType === "PROOF_OF_FULFILLMENT" || !shipment) return notes;
	if (notes.includes(shipment.trackingNumber)) return notes;
	return `${notes}\n\nTracking: ${shipment.carrier} ${shipment.trackingNumber} (uploaded to PayPal; full delivery timeline in the attached PDF).`;
}
