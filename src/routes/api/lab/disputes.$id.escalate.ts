import { createFileRoute } from "@tanstack/react-router";
import { handle, json, labGuard } from "#/server/http";
import { labEscalate } from "#/server/lab";

export const Route = createFileRoute("/api/lab/disputes/$id/escalate")({
	server: {
		handlers: {
			POST: handle(
				async ({ params }: { params: { id: string } }) =>
					labGuard() ?? json(await labEscalate(params.id)),
			),
		},
	},
});
