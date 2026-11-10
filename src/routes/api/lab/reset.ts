import { createFileRoute } from "@tanstack/react-router";
import { handle, json, labGuard } from "#/server/http";
import { labReset } from "#/server/lab";

export const Route = createFileRoute("/api/lab/reset")({
	server: { handlers: { POST: handle(async () => labGuard() ?? json(await labReset({ keepOrders: true }))) } },
});
