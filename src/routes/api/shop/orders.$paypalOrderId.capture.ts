import { createFileRoute } from "@tanstack/react-router";
import { handle, json } from "#/server/http";
import { captureShopOrder } from "#/server/shop";

export const Route = createFileRoute("/api/shop/orders/$paypalOrderId/capture")(
	{
		server: {
			handlers: {
				POST: handle(
					async ({ params }: { params: { paypalOrderId: string } }) =>
						json(await captureShopOrder(params.paypalOrderId)),
				),
			},
		},
	},
);
