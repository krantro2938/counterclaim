import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handle, json, readJson } from "#/server/http";

const Body = z.object({
	message: z.string().trim().min(1).max(1000),
	history: z
		.array(
			z.object({
				role: z.enum(["user", "assistant"]),
				content: z.string().max(4000),
			}),
		)
		.max(20)
		.default([]),
});

export const Route = createFileRoute("/api/disputes/$id/chat")({
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
					const { chatAboutDispute } = await import("#/server/agent/chat");
					return json(
						await chatAboutDispute(params.id, body.message, body.history),
					);
				},
			),
		},
	},
});
