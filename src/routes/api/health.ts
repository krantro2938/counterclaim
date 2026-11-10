import { createFileRoute } from "@tanstack/react-router";
import { json } from "#/server/http";

export const Route = createFileRoute("/api/health")({
	server: { handlers: { GET: async () => json({ ok: true, at: new Date().toISOString() }) } },
});
