import { createFileRoute } from "@tanstack/react-router";
import { desc } from "drizzle-orm";
import { db } from "#/server/db/client";
import { carrierEvents, disputes, shipments } from "#/server/db/schema";
import { env } from "#/server/env";
import { handle, json, labGuard } from "#/server/http";
import { listOrderRows, recentWebhooks } from "#/server/queries";

/** Everything the Lab page needs in one call. */
export const Route = createFileRoute("/api/lab/overview")({
	server: {
		handlers: {
			GET: handle(async () => {
				const g = labGuard();
				if (g) return g;
				const ds = await db()
					.select({
						id: disputes.id,
						status: disputes.status,
						stage: disputes.stage,
						reason: disputes.reason,
						amountMinor: disputes.amountMinor,
						currency: disputes.currency,
						links: disputes.links,
						outcome: disputes.outcome,
						orderId: disputes.orderId,
					})
					.from(disputes)
					.orderBy(desc(disputes.updatedAt));
				const ships = await db()
					.select()
					.from(shipments)
					.orderBy(desc(shipments.shippedAt));
				const evs = await db()
					.select({
						shipmentId: carrierEvents.shipmentId,
						code: carrierEvents.code,
					})
					.from(carrierEvents);
				return json({
					disputes: ds,
					shipments: ships.map((s) => ({
						...s,
						events: evs.filter((e) => e.shipmentId === s.id).map((e) => e.code),
					})),
					orders: await listOrderRows(),
					webhooks: await recentWebhooks(),
					resetEnabled: env().LAB_RESET_ENABLED,
				});
			}),
		},
	},
});
