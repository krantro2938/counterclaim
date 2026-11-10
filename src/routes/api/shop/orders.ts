import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handle, json, readJson } from "#/server/http";
import { createShopOrder } from "#/server/shop";

const Body = z.object({ slug: z.string().min(1).max(80), quantity: z.number().int().min(1).max(5).default(1) });

export const Route = createFileRoute("/api/shop/orders")({
	server: {
		handlers: {
			POST: handle(async ({ request }: { request: Request }) => {
				const body = await readJson(request, Body);
				return json(await createShopOrder(body));
			}),
		},
	},
});
