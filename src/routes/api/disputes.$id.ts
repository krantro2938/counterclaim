import { createFileRoute } from "@tanstack/react-router";
import { apiError, handle, json } from "#/server/http";
import { getDisputeDetail } from "#/server/queries";

export const Route = createFileRoute("/api/disputes/$id")({
	server: {
		handlers: {
			GET: handle(async ({ params }: { params: { id: string } }) => {
				const detail = await getDisputeDetail(params.id);
				if (!detail) return apiError("NOT_FOUND", "Dispute not found", 404);
				return json(detail);
			}),
		},
	},
});
