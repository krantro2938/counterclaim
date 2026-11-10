import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "#/server/db/client";
import { evidenceFiles } from "#/server/db/schema";
import { apiError, handle } from "#/server/http";

/** GET /api/evidence/{id}.pdf */
export const Route = createFileRoute("/api/evidence/$id")({
	server: {
		handlers: {
			GET: handle(async ({ params, request }: { params: { id: string }; request: Request }) => {
				const id = params.id.replace(/\.pdf$/, "");
				if (!/^[0-9a-f-]{36}$/.test(id)) return apiError("NOT_FOUND", "Evidence not found", 404);
				const [f] = await db().select().from(evidenceFiles).where(eq(evidenceFiles.id, id)).limit(1);
				if (!f) return apiError("NOT_FOUND", "Evidence not found", 404);
				const download = new URL(request.url).searchParams.has("download");
				return new Response(new Uint8Array(f.bytes), {
					headers: {
						"Content-Type": "application/pdf",
						"Content-Disposition": `${download ? "attachment" : "inline"}; filename="${f.filename}"`,
						"Cache-Control": "private, max-age=300",
					},
				});
			}),
		},
	},
});
