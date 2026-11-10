import { createFileRoute } from "@tanstack/react-router";
import { handle, json } from "#/server/http";
import { enqueue } from "#/server/jobs/queue";

export const Route = createFileRoute("/api/disputes/$id/assess")({
	server: {
		handlers: {
			POST: handle(async ({ params }: { params: { id: string } }) => {
				const jobId = await enqueue("assess", {
					refId: params.id,
					payload: { force: true },
					dedupe: true,
				});
				return json({ queued: true, jobId }, 202);
			}),
		},
	},
});
