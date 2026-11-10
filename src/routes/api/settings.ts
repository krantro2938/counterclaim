import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db/client";
import { merchantSettings, storePolicies } from "#/server/db/schema";
import { handle, json, readJson } from "#/server/http";
import { getSettingsDto } from "#/server/queries";
import { getSettings } from "#/server/settings";

const Body = z.object({
	autopilot: z
		.object({
			autoAcknowledgeInquiry: z.boolean(),
			autoSubmitFulfillment: z.boolean(),
			autoSubmitMinScore: z.number().int().min(50).max(100),
			autoAcceptSmallClaims: z.boolean(),
			autoAcceptMaxMinor: z.number().int().min(0).max(100_000),
			autoAcceptMaxLikelihood: z.number().int().min(0).max(60),
			undoWindowSeconds: z.number().int().min(30).max(600),
		})
		.partial()
		.optional(),
	atRiskAfterHours: z.number().int().min(0).max(240).optional(),
	policies: z.array(z.object({ section: z.string(), body: z.string().min(1).max(4000) })).optional(),
});

export const Route = createFileRoute("/api/settings")({
	server: {
		handlers: {
			GET: handle(async () => json(await getSettingsDto())),
			PUT: handle(async ({ request }: { request: Request }) => {
				const body = await readJson(request, Body);
				const cur = await getSettings();
				await db()
					.update(merchantSettings)
					.set({
						autopilot: { ...cur.autopilot, ...(body.autopilot ?? {}) },
						atRiskAfterHours: body.atRiskAfterHours ?? cur.atRiskAfterHours,
						updatedAt: new Date(),
					})
					.where(eq(merchantSettings.id, 1));
				for (const p of body.policies ?? []) {
					await db().update(storePolicies).set({ body: p.body }).where(eq(storePolicies.section, p.section));
				}
				if (body.atRiskAfterHours !== undefined) {
					const { refreshProtection } = await import("#/server/protection");
					await refreshProtection();
				}
				return json(await getSettingsDto());
			}),
		},
	},
});
