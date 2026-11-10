import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handle, json, readJson } from "#/server/http";
import { shipOrder } from "#/server/shop";

const Body = z.object({ carrier: z.enum(["USPS", "UPS", "FEDEX"]).optional(), notifyPayer: z.boolean().optional() });

export const Route = createFileRoute("/api/orders/$id/ship")({
	server: {
		handlers: {
			POST: handle(async ({ params, request }: { params: { id: string }; request: Request }) => {
				const body = await readJson(request, Body);
				return json(await shipOrder(params.id, body));
			}),
		},
	},
});
