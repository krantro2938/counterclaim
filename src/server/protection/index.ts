import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { type Address, disputes, orders, shipments } from "../db/schema";
import { publish } from "../events/bus";
import { getSettings } from "../settings";

export type ProtectionStatus = "protected" | "at_risk" | "not_eligible" | "awaiting" | "pending";

type OrderRow = typeof orders.$inferSelect;
type ShipmentRow = typeof shipments.$inferSelect;
type DisputeRow = typeof disputes.$inferSelect;

function norm(s?: string) {
	return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Shipping address on our order matches the PayPal-provided shipping address. */
export function addressesMatch(a?: Address | null, b?: Address | null): boolean {
	if (!a || !b) return true; // nothing to compare → no mismatch evidence
	return norm(a.line1) === norm(b.line1) && norm(a.postalCode) === norm(b.postalCode);
}

/**
 * Seller Protection eligibility, approximated from what PayPal requires for an INR claim:
 * tracking uploaded to PayPal, shipped to the PayPal-provided address, before any dispute.
 */
export function evaluateProtection(
	order: OrderRow,
	shipment: ShipmentRow | null,
	dispute: DisputeRow | null,
	opts: { atRiskAfterHours: number; now?: Date },
): { status: ProtectionStatus; reasons: string[] } {
	const now = opts.now ?? new Date();
	if (!order.capturedAt) return { status: "pending", reasons: ["Payment not captured yet"] };
	const reasons: string[] = [];
	const addrOk = addressesMatch(order.shippingAddress, order.paypalShippingAddress);
	if (!addrOk) reasons.push("Ship-to address differs from the PayPal address");

	const uploadedAt = shipment?.uploadedToPaypalAt ?? null;
	const disputeAt = dispute?.createTime ?? dispute?.firstSeenAt ?? null;
	if (dispute && (!uploadedAt || (disputeAt && uploadedAt > disputeAt))) {
		return {
			status: "not_eligible",
			reasons: ["Dispute opened before tracking was uploaded to PayPal", ...reasons],
		};
	}
	if (uploadedAt && addrOk) return { status: "protected", reasons: ["Tracking on file with PayPal"] };
	if (shipment && !uploadedAt) reasons.push("Tracking exists but was not uploaded to PayPal");
	if (!shipment) {
		const hours = (now.getTime() - order.capturedAt.getTime()) / 3_600_000;
		if (hours >= opts.atRiskAfterHours) {
			reasons.push(`No tracking ${Math.max(1, Math.floor(hours))} h after payment`);
		} else {
			return { status: "awaiting", reasons: ["Awaiting shipment"] };
		}
	}
	return { status: "at_risk", reasons };
}

/** Recompute protection for the given orders (or all captured orders). Returns changed order ids. */
export async function refreshProtection(orderIds?: string[]): Promise<string[]> {
	const settings = await getSettings();
	const rows = await db()
		.select()
		.from(orders)
		.where(orderIds ? inArray(orders.id, orderIds) : isNotNull(orders.capturedAt));
	if (!rows.length) return [];
	const ids = rows.map((r) => r.id);
	const ships = await db().select().from(shipments).where(inArray(shipments.orderId, ids)).orderBy(desc(shipments.shippedAt));
	const disps = await db().select().from(disputes).where(inArray(disputes.orderId, ids));
	const changed: string[] = [];
	for (const o of rows) {
		const s = ships.find((x) => x.orderId === o.id) ?? null;
		const d = disps.find((x) => x.orderId === o.id) ?? null;
		const r = evaluateProtection(o, s, d, { atRiskAfterHours: settings.atRiskAfterHours });
		if (r.status !== o.protectionStatus || JSON.stringify(r.reasons) !== JSON.stringify(o.protectionReasons)) {
			await db().update(orders).set({ protectionStatus: r.status, protectionReasons: r.reasons }).where(eq(orders.id, o.id));
			changed.push(o.id);
			await publish({ type: "order.updated", orderId: o.id, number: o.number });
		}
	}
	if (changed.length) await publish({ type: "kpi.updated" });
	return changed;
}
