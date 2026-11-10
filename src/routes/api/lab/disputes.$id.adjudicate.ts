import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handle, json, labGuard, readJson } from "#/server/http";
import { labAdjudicate } from "#/server/lab";

const Body = z.object({ outcome: z.enum(["SELLER_FAVOR", "BUYER_FAVOR"]) });

export const Route = createFileRoute("/api/lab/disputes/$id/adjudicate")({
	server: {
		handlers: {
			POST: handle(async ({ params, request }: { params: { id: string }; request: Request }) => {
				const g = labGuard();
				if (g) return g;
				const body = await readJson(request, Body);
				return json(await labAdjudicate(params.id, body.outcome));
			}),
		},
	},
});
