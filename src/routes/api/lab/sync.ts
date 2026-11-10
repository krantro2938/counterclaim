import { createFileRoute } from "@tanstack/react-router";
import { handle, json, labGuard } from "#/server/http";
import { labSync } from "#/server/lab";

export const Route = createFileRoute("/api/lab/sync")({
	server: {
		handlers: { POST: handle(async () => labGuard() ?? json(await labSync())) },
	},
});
