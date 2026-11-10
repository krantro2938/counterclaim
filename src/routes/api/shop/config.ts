import { createFileRoute } from "@tanstack/react-router";
import { env } from "#/server/env";
import { json } from "#/server/http";

/** Public checkout config: the PayPal client ID is the only PayPal value exposed to browsers. */
export const Route = createFileRoute("/api/shop/config")({
	server: {
		handlers: {
			GET: async () =>
				json({
					paypalClientId: env().PAYPAL_CLIENT_ID ?? null,
					environment: env().PAYPAL_API_BASE.includes("sandbox") ? "sandbox" : "production",
				}),
		},
	},
});
