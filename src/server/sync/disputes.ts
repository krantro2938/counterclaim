import { and, eq, inArray, or } from "drizzle-orm";
import { normRel, reasonLabel } from "#/lib/labels";
import { formatMoney, paypalMoneyToMinor } from "#/lib/money";
import { db } from "../db/client";
import { actions, disputes, orders } from "../db/schema";
import { publish } from "../events/bus";
import { enqueue } from "../jobs/queue";
import { kvGet, kvSet, recordActivity } from "../kv";
import { log } from "../log";
import { getDispute, listDisputes } from "../paypal/rest";
import { DisputeSchema, type PayPalDispute } from "../paypal/types";
import { refreshProtection } from "../protection";

export function outcomeFromCode(
	code?: string,
): "won" | "lost" | "settled" | "other" | null {
	if (!code) return null;
	if (
		code === "RESOLVED_SELLER_FAVOUR" ||
		code === "CANCELED_BY_BUYER" ||
		code === "DENIED"
	)
		return "won";
	if (code === "RESOLVED_BUYER_FAVOUR") return "lost";
	if (code === "ACCEPTED" || code === "RESOLVED_WITH_PAYOUT") return "settled";
	return "other";
}

// Stored links are normalised (`provide-supporting-info`); PayPal may send `provide_supporting_info`.
const relsOf = (links: { rel: string }[]) =>
	links
		.map((l) => normRel(l.rel))
		.sort()
		.join(",");

/** Fetch one dispute from PayPal and upsert it. Idempotent; shared by webhooks and the poller. */
export async function syncDispute(
	disputeId: string,
	opts: { reason?: string } = {},
) {
	const res = await getDispute(disputeId);
	const d: PayPalDispute = DisputeSchema.parse(res.data);
	const [prev] = await db()
		.select()
		.from(disputes)
		.where(eq(disputes.id, d.dispute_id))
		.limit(1);

	const { amountMinor, currency } = paypalMoneyToMinor(d.dispute_amount);
	const tx = d.disputed_transactions?.[0];
	const sellerTx = tx?.seller_transaction_id;
	let orderId: string | null = prev?.orderId ?? null;
	if (!orderId && (sellerTx || tx?.invoice_number || tx?.custom)) {
		const conds = [];
		if (sellerTx) conds.push(eq(orders.captureId, sellerTx));
		const inv = /^KT-(\d+)-/.exec(tx?.invoice_number ?? "");
		if (inv) conds.push(eq(orders.number, Number(inv[1])));
		if (tx?.custom) conds.push(eq(orders.id, tx.custom));
		const [o] = conds.length
			? await db()
					.select({ id: orders.id })
					.from(orders)
					.where(or(...conds))
					.limit(1)
			: [];
		orderId = o?.id ?? null;
	}
	const outcomeCode = d.dispute_outcome?.outcome_code;
	let outcome =
		d.status === "RESOLVED" ? (outcomeFromCode(outcomeCode) ?? "other") : null;
	if (outcome === "lost") {
		// Resolved for the buyer because the merchant accepted or offered: settled by choice, not lost.
		const [chosen] = await db()
			.select({ id: actions.id })
			.from(actions)
			.where(
				and(
					eq(actions.disputeId, d.dispute_id),
					eq(actions.status, "succeeded"),
					inArray(actions.type, ["accept_claim", "make_offer"]),
				),
			)
			.limit(1);
		if (chosen) outcome = "settled";
	}
	const row = {
		id: d.dispute_id,
		orderId,
		reason: d.reason,
		stage: d.dispute_life_cycle_stage ?? null,
		status: d.status,
		amountMinor,
		currency,
		sellerResponseDueAt: d.seller_response_due_date
			? new Date(d.seller_response_due_date)
			: null,
		links: d.links.map((l) => ({ ...l, rel: normRel(l.rel) })),
		raw: res.data as Record<string, unknown>,
		outcome,
		outcomeCode: outcomeCode ?? null,
		buyerName: (tx?.buyer?.name as string | undefined) ?? null,
		buyerTransactionId: tx?.buyer_transaction_id ?? null,
		sellerTransactionId: sellerTx ?? null,
		createTime: d.create_time ? new Date(d.create_time) : null,
		resolvedAt:
			d.status === "RESOLVED" ? (prev?.resolvedAt ?? new Date()) : null,
		updatedAt: new Date(),
		paypalUpdateTime: d.update_time ? new Date(d.update_time) : null,
	};
	await db()
		.insert(disputes)
		.values(row)
		.onConflictDoUpdate({
			target: disputes.id,
			set: { ...row, firstSeenAt: undefined },
		});

	const isNew = !prev;
	const statusChanged =
		!prev || prev.status !== d.status || prev.stage !== row.stage;
	const linksChanged = !prev || relsOf(prev.links) !== relsOf(d.links);

	if (isNew) {
		await recordActivity({
			actor: "buyer",
			kind: "dispute_opened",
			text: `Buyer opened a dispute: ${reasonLabel(d.reason)}, ${formatMoney(amountMinor, currency)}`,
			disputeId: d.dispute_id,
			orderId,
			at: row.createTime ?? new Date(),
		});
	} else if (statusChanged) {
		await recordActivity({
			actor: "paypal",
			kind: "dispute_status",
			text: `PayPal moved the case to ${d.dispute_life_cycle_stage ?? ""} · ${d.status}`.replace(
				" · ",
				d.dispute_life_cycle_stage ? " · " : "",
			),
			disputeId: d.dispute_id,
			orderId,
			meta: { from: prev?.status, to: d.status, stage: row.stage },
		});
	}
	if (outcome && prev?.outcome !== outcome) {
		const amt = formatMoney(amountMinor, currency);
		const text =
			outcome === "won"
				? `Case won · ${amt} kept`
				: outcome === "lost"
					? `Case lost · ${amt} refunded to buyer`
					: outcome === "settled"
						? `Case settled (${outcomeCode})`
						: `Case closed (${outcomeCode ?? "no outcome"})`;
		await recordActivity({
			actor: "paypal",
			kind: "dispute_resolved",
			text,
			disputeId: d.dispute_id,
			orderId,
			meta: { outcomeCode },
		});
	}

	if (orderId && isNew) await refreshProtection([orderId]);

	// When PayPal changes what is allowed, older proposals may no longer be valid.
	if (linksChanged && prev) {
		await db()
			.update(actions)
			.set({ status: "superseded" })
			.where(
				and(
					eq(actions.disputeId, d.dispute_id),
					inArray(actions.status, ["proposed", "needs_approval"]),
				),
			);
	}
	const shouldAssess =
		d.status !== "RESOLVED" && (isNew || statusChanged || linksChanged);
	if (shouldAssess)
		await enqueue("assess", { refId: d.dispute_id, dedupe: true });

	await publish({
		type: "dispute.updated",
		disputeId: d.dispute_id,
		status: d.status,
		isNew,
	});
	if (statusChanged || isNew) await publish({ type: "kpi.updated" });
	log.info(
		{
			disputeId: d.dispute_id,
			status: d.status,
			rels: relsOf(d.links),
			isNew,
			reason: opts.reason,
		},
		"dispute synced",
	);
	return {
		isNew,
		statusChanged,
		linksChanged,
		status: d.status,
		rels: d.links.map((l) => l.rel),
	};
}

/** Poller: list disputes updated since the last run (minus 5 min overlap) and sync each. */
export async function pollDisputes(): Promise<number> {
	const cursor = await kvGet<string>("poller.cursor");
	const startedAt = new Date();
	const since = cursor
		? new Date(new Date(cursor).getTime() - 5 * 60_000)
		: new Date(Date.now() - 170 * 24 * 3_600_000);
	const items = await listDisputes({ updateTimeAfter: since.toISOString() });
	for (const it of items) {
		await enqueue("sync_dispute", {
			refId: it.dispute_id,
			payload: { reason: "poll" },
			dedupe: true,
		});
	}
	await kvSet("poller.cursor", startedAt.toISOString());
	await kvSet("poller.lastRun", {
		at: startedAt.toISOString(),
		found: items.length,
	});
	return items.length;
}
