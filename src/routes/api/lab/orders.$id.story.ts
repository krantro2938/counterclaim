import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handle, json, labGuard, readJson } from "#/server/http";
import { labAttachStory, STORIES } from "#/server/lab";

const Body = z.object({ story: z.enum(STORIES) });

export const Route = createFileRoute("/api/lab/orders/$id/story")({
	server: {
		handlers: {
			POST: handle(async ({ params, request }: { params: { id: string }; request: Request }) => {
				const g = labGuard();
				if (g) return g;
				const body = await readJson(request, Body);
				return json(await labAttachStory(params.id, body.story));
			}),
		},
	},
});
