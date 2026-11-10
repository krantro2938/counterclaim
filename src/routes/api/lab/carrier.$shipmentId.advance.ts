import { createFileRoute } from "@tanstack/react-router";
import { advanceCarrier, deliverNow } from "#/server/carrier";
import { handle, json, labGuard } from "#/server/http";

export const Route = createFileRoute("/api/lab/carrier/$shipmentId/advance")({
	server: {
		handlers: {
			POST: handle(async ({ params, request }: { params: { shipmentId: string }; request: Request }) => {
				const g = labGuard();
				if (g) return g;
				if (new URL(request.url).searchParams.get("to") === "delivered") {
					await deliverNow(params.shipmentId);
					return json({ ok: true, delivered: true });
				}
				return json({ ok: true, event: await advanceCarrier(params.shipmentId) });
			}),
		},
	},
});
