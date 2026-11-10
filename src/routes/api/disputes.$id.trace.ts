import { createFileRoute } from "@tanstack/react-router";
import { apiError, handle, json } from "#/server/http";
import { getTrace } from "#/server/queries";

export const Route = createFileRoute("/api/disputes/$id/trace")({
	server: {
		handlers: {
			GET: handle(async ({ request }: { request: Request }) => {
				const n = Number(new URL(request.url).searchParams.get("assessment"));
				if (!Number.isInteger(n) || n <= 0) return apiError("BAD_REQUEST", "assessment query param required", 400);
				return json({ steps: await getTrace(n) });
			}),
		},
	},
});
