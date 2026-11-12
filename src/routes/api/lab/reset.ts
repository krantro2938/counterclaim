import { createFileRoute } from "@tanstack/react-router";
import { env } from "#/server/env";
import { apiError, handle, json, labGuard } from "#/server/http";
import { labReset } from "#/server/lab";

export const Route = createFileRoute("/api/lab/reset")({
	server: {
		handlers: {
			POST: handle(async () => {
				const g = labGuard();
				if (g) return g;
				if (!env().LAB_RESET_ENABLED)
					return apiError(
						"RESET_DISABLED",
						"Reset is disabled on the shared demo",
						403,
					);
				return json(await labReset({ keepOrders: true }));
			}),
		},
	},
});
