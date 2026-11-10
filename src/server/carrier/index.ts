import { randomInt } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { carrierEvents, orders, shipments } from "../db/schema";
import { publish } from "../events/bus";
import { recordActivity } from "../kv";

/**
 * CarrierSim — simulated parcel tracking. There is no real carrier integration in the sandbox,
 * so tracking numbers and scan events are generated here and always flagged `simulated`.
 */

export const CARRIERS = ["USPS", "UPS", "FEDEX"] as const;

export function simulatedTrackingNumber(carrier: string): string {
	const digits = (n: number) =>
		Array.from({ length: n }, () => randomInt(0, 10)).join("");
	if (carrier === "UPS") return `1Z${digits(16)}`;
	if (carrier === "FEDEX") return digits(12);
	return `9400${digits(18)}`; // USPS-style 22 digits
}

const STEPS = [
	{
		code: "label_created",
		description: "Shipping label created",
		location: "San Francisco, CA 94107",
	},
	{
		code: "in_transit",
		description: "Accepted at USPS origin facility",
		location: "San Francisco, CA 94107",
	},
	{
		code: "in_transit",
		description: "In transit to next facility",
		location: "Oakland, CA 94621",
	},
	{
		code: "out_for_delivery",
		description: "Out for delivery",
		location: "DEST",
	},
	{
		code: "delivered",
		description: "Delivered, front door/porch",
		location: "DEST",
	},
] as const;

function destLabel(order: typeof orders.$inferSelect): string {
	const a = order.paypalShippingAddress ?? order.shippingAddress;
	if (!a) return "Destination";
	return (
		[a.city, [a.state, a.postalCode].filter(Boolean).join(" ")]
			.filter(Boolean)
			.join(", ") || "Destination"
	);
}

/** Add the next simulated scan event to a shipment. Returns the new event or null if delivered. */
export async function advanceCarrier(shipmentId: string) {
	const [ship] = await db()
		.select()
		.from(shipments)
		.where(eq(shipments.id, shipmentId))
		.limit(1);
	if (!ship) throw new Error("Shipment not found");
	const [order] = await db()
		.select()
		.from(orders)
		.where(eq(orders.id, ship.orderId))
		.limit(1);
	const existing = await db()
		.select()
		.from(carrierEvents)
		.where(eq(carrierEvents.shipmentId, shipmentId))
		.orderBy(asc(carrierEvents.occurredAt));
	if (existing.length >= STEPS.length) return null;
	const step = STEPS[existing.length];
	const [ev] = await db()
		.insert(carrierEvents)
		.values({
			shipmentId,
			code: step.code,
			description: step.description,
			location:
				step.location === "DEST" && order ? destLabel(order) : step.location,
			occurredAt: new Date(),
			simulated: true,
		})
		.returning();
	await recordActivity({
		actor: "simulated",
		kind: "carrier_event",
		text: `${step.description} (simulated)`,
		orderId: ship.orderId,
		meta: { trackingNumber: ship.trackingNumber, code: step.code },
	});
	await publish({
		type: "order.updated",
		orderId: ship.orderId,
		number: order?.number,
	});
	return ev;
}

/** Advance a shipment all the way to delivered. */
export async function deliverNow(shipmentId: string) {
	for (let i = 0; i < STEPS.length; i++) {
		const ev = await advanceCarrier(shipmentId);
		if (!ev) break;
	}
}
