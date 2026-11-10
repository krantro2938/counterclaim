import { createFileRoute } from "@tanstack/react-router";
import { handle, json, labGuard } from "#/server/http";
import { recentWebhooks } from "#/server/queries";

export const Route = createFileRoute("/api/debug/webhooks")({
	server: { handlers: { GET: handle(async () => labGuard() ?? json({ events: await recentWebhooks() })) } },
});
