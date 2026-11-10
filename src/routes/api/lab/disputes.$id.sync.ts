import { createFileRoute } from "@tanstack/react-router";
import { handle, json, labGuard } from "#/server/http";
import { syncDispute } from "#/server/sync/disputes";

export const Route = createFileRoute("/api/lab/disputes/$id/sync")({
	server: {
		handlers: {
			POST: handle(async ({ params }: { params: { id: string } }) => labGuard() ?? json(await syncDispute(params.id, { reason: "lab" }))),
		},
	},
});
