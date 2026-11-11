import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handle, json, labGuard, readJson } from "#/server/http";
import { importPayPalOrder } from "#/server/shop";

const Body = z.object({ paypalOrderId: z.string().regex(/^[A-Z0-9]{8,32}$/) });

export const Route = createFileRoute("/api/lab/orders/import")({
	server: {
		handlers: {
			POST: handle(async ({ request }: { request: Request }) => {
				const guard = labGuard();
				if (guard) return guard;
				const { paypalOrderId } = await readJson(request, Body);
				return json(await importPayPalOrder(paypalOrderId));
			}),
		},
	},
});
