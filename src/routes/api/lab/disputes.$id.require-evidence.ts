import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handle, json, labGuard, readJson } from "#/server/http";
import { labRequireEvidence } from "#/server/lab";

const Body = z.object({
	action: z
		.enum(["SELLER_EVIDENCE", "BUYER_EVIDENCE"])
		.default("SELLER_EVIDENCE"),
});

export const Route = createFileRoute("/api/lab/disputes/$id/require-evidence")({
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
					const g = labGuard();
					if (g) return g;
					const body = await readJson(request, Body);
					return json(await labRequireEvidence(params.id, body.action));
				},
			),
		},
	},
});
