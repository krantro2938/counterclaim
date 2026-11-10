import { createFileRoute } from "@tanstack/react-router";
import { handle, json } from "#/server/http";
import { listOrderRows } from "#/server/queries";

export const Route = createFileRoute("/api/orders")({
	server: { handlers: { GET: handle(async () => json({ rows: await listOrderRows() })) } },
});
