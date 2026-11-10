import { createFileRoute } from "@tanstack/react-router";
import { handle, json } from "#/server/http";
import { cancelAction } from "#/server/policy/decisions";

export const Route = createFileRoute("/api/actions/$id/cancel")({
	server: {
		handlers: {
			POST: handle(async ({ params }: { params: { id: string } }) =>
				json(await cancelAction(params.id)),
			),
		},
	},
});
