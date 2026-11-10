import { eq } from "drizzle-orm";
import { ACTION_TO_REL, actionLabel } from "#/lib/labels";
import { formatMoney } from "#/lib/money";
import { db } from "../db/client";
import { actions, disputes } from "../db/schema";
import { publish } from "../events/bus";
import { enqueue } from "../jobs/queue";
import { recordActivity } from "../kv";
import { validateActionParams } from "./params";

function httpError(status: number, message: string) {
	return Object.assign(new Error(message), { status });
}

/** Merchant approves a proposed action (optionally with edited params) → executor job. */
export async function approveAction(
	actionId: string,
	edits?: Record<string, unknown>,
) {
	const [a] = await db()
		.select()
		.from(actions)
		.where(eq(actions.id, actionId))
		.limit(1);
	if (!a) throw httpError(404, "Action not found");
	if (!["needs_approval", "proposed", "failed"].includes(a.status)) {
		throw httpError(409, `Action is ${a.status}; it can no longer be approved`);
	}
	const [d] = await db()
		.select()
		.from(disputes)
		.where(eq(disputes.id, a.disputeId))
		.limit(1);
	if (!d) throw httpError(404, "Dispute not found");
	const rel = ACTION_TO_REL[a.type];
	// HATEOAS gate, checked again at approval time against the latest snapshot.
	if (!d.links.some((l) => l.rel === rel)) {
		throw httpError(
			409,
			`PayPal no longer allows "${rel}" on this dispute (status ${d.status}). Re-assess to get a valid proposal.`,
		);
	}
	const params = validateActionParams(
		a.type,
		{ ...a.params, ...(edits ?? {}) },
		{ amountMinor: d.amountMinor, currency: d.currency },
	);
	// A failed action is retried as a NEW action (new PayPal-Request-Id), never re-sent.
	let id = a.id;
	if (a.status === "failed") {
		const [copy] = await db()
			.insert(actions)
			.values({
				disputeId: a.disputeId,
				assessmentId: a.assessmentId,
				type: a.type,
				params,
				status: "approved",
				source: "merchant",
				rationale: a.rationale,
				rel,
				decidedAt: new Date(),
			})
			.returning({ id: actions.id });
		id = copy.id;
	} else {
		await db()
			.update(actions)
			.set({
				status: "approved",
				params,
				decidedAt: new Date(),
				source: edits && Object.keys(edits).length ? "merchant" : a.source,
			})
			.where(eq(actions.id, a.id));
	}
	if (!d.firstResponseAt)
		await db()
			.update(disputes)
			.set({ firstResponseAt: new Date() })
			.where(eq(disputes.id, d.id));
	const amount =
		typeof params.amountMinor === "number"
			? ` (${formatMoney(params.amountMinor, d.currency)})`
			: "";
	await recordActivity({
		actor: "merchant",
		kind: "action_approved",
		text: `Approved: ${actionLabel(a.type)}${amount}`,
		disputeId: d.id,
		orderId: d.orderId,
		meta: { actionId: id },
	});
	await enqueue("execute_action", { refId: id });
	await publish({
		type: "action.updated",
		disputeId: d.id,
		actionId: id,
		status: "approved",
	});
	return { id, status: "approved" };
}

export async function rejectAction(actionId: string, reason?: string) {
	const [a] = await db()
		.select()
		.from(actions)
		.where(eq(actions.id, actionId))
		.limit(1);
	if (!a) throw httpError(404, "Action not found");
	if (!["needs_approval", "proposed", "auto_scheduled"].includes(a.status))
		throw httpError(409, `Action is ${a.status}`);
	await db()
		.update(actions)
		.set({
			status: "rejected",
			decidedAt: new Date(),
			error: reason ? { reason } : null,
		})
		.where(eq(actions.id, a.id));
	await recordActivity({
		actor: "merchant",
		kind: "action_rejected",
		text: `Rejected: ${actionLabel(a.type)}${reason ? ` — ${reason}` : ""}`,
		disputeId: a.disputeId,
	});
	await publish({
		type: "action.updated",
		disputeId: a.disputeId,
		actionId: a.id,
		status: "rejected",
	});
	return { id: a.id, status: "rejected" };
}

/** Undo an autopilot action inside its window. */
export async function cancelAction(actionId: string) {
	const [a] = await db()
		.select()
		.from(actions)
		.where(eq(actions.id, actionId))
		.limit(1);
	if (!a) throw httpError(404, "Action not found");
	if (a.status !== "auto_scheduled")
		throw httpError(
			409,
			`Only scheduled autopilot actions can be undone (this one is ${a.status})`,
		);
	await db()
		.update(actions)
		.set({ status: "cancelled", decidedAt: new Date() })
		.where(eq(actions.id, a.id));
	await recordActivity({
		actor: "merchant",
		kind: "action_cancelled",
		text: `Undid autopilot: ${actionLabel(a.type)}`,
		disputeId: a.disputeId,
	});
	await publish({
		type: "action.updated",
		disputeId: a.disputeId,
		actionId: a.id,
		status: "cancelled",
	});
	return { id: a.id, status: "cancelled" };
}
