import { createFileRoute } from "@tanstack/react-router";
import { handle, json } from "#/server/http";
import { getOverview } from "#/server/queries";

export const Route = createFileRoute("/api/overview")({
	server: { handlers: { GET: handle(async () => json(await getOverview())) } },
});
