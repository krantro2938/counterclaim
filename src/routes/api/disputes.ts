import { createFileRoute } from "@tanstack/react-router";
import { handle, json } from "#/server/http";
import { listDisputeRows } from "#/server/queries";

export const Route = createFileRoute("/api/disputes")({
	server: { handlers: { GET: handle(async () => json({ rows: await listDisputeRows() })) } },
});
