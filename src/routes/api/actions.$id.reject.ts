import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handle, json, readJson } from "#/server/http";
import { rejectAction } from "#/server/policy/decisions";

const Body = z.object({ reason: z.string().max(500).optional() });

export const Route = createFileRoute("/api/actions/$id/reject")({
	server: {
		handlers: {
			POST: handle(
				async ({
					params,
					request,
				}: {
					params: { id: string };
					request: Request;
				}) => {
					const body = await readJson(request, Body);
					return json(await rejectAction(params.id, body.reason));
				},
			),
		},
	},
});
