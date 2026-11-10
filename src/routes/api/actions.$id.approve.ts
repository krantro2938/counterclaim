import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { approveAction } from "#/server/policy/decisions";
import { handle, json, readJson } from "#/server/http";

const Body = z.object({ params: z.record(z.string(), z.unknown()).optional() });

export const Route = createFileRoute("/api/actions/$id/approve")({
	server: {
		handlers: {
			POST: handle(async ({ params, request }: { params: { id: string }; request: Request }) => {
				const body = await readJson(request, Body);
				return json(await approveAction(params.id, body.params), 202);
			}),
		},
	},
});
