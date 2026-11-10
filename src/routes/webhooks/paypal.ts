import { createFileRoute } from "@tanstack/react-router";
import { handle, json } from "#/server/http";
import { ingestWebhook } from "#/server/paypal/webhooks";

/** PayPal webhooks: verify, store once by event.id, enqueue, return 200 fast. */
export const Route = createFileRoute("/webhooks/paypal")({
	server: {
		handlers: {
			POST: handle(async ({ request }: { request: Request }) => {
				const raw = await request.text();
				const r = await ingestWebhook(raw, request.headers);
				return json({
					received: true,
					duplicate: !r.stored,
					verified: r.verified,
				});
			}),
		},
	},
});
