import { createFileRoute } from "@tanstack/react-router";
import { desc, eq } from "drizzle-orm";
import { buildCaseFile } from "#/server/casefile";
import { db } from "#/server/db/client";
import { actions, assessments } from "#/server/db/schema";
import { apiError, handle } from "#/server/http";
import { getSettings } from "#/server/settings";

/** Draft evidence packet, rendered on demand so the merchant can read it before approving. */
export const Route = createFileRoute("/api/disputes/$id/evidence-preview")({
	server: {
		handlers: {
			GET: handle(async ({ params }: { params: { id: string } }) => {
				const cf = await buildCaseFile(params.id).catch(() => null);
				if (!cf) return apiError("NOT_FOUND", "Dispute not found", 404);
				const [a] = await db()
					.select()
					.from(assessments)
					.where(eq(assessments.disputeId, params.id))
					.orderBy(desc(assessments.version))
					.limit(1);
				const [ev] = await db()
					.select()
					.from(actions)
					.where(eq(actions.disputeId, params.id))
					.orderBy(desc(actions.createdAt))
					.limit(1);
				const notes =
					ev?.type === "provide_evidence"
						? String((ev.params as { notes?: string }).notes ?? "")
						: "";
				const { renderEvidencePdf } = await import("#/server/evidence/pdf");
				const pdf = await renderEvidencePdf({
					cf,
					merchantName: (await getSettings()).storeName,
					summary: notes || a?.headline || "",
					points: (a?.reasoning ?? []).map((r) => r.point),
					generatedAt: new Date(),
				});
				return new Response(new Uint8Array(pdf.bytes), {
					headers: {
						"Content-Type": "application/pdf",
						"Content-Disposition": `inline; filename="draft-${pdf.filename}"`,
						"Cache-Control": "no-store",
					},
				});
			}),
		},
	},
});
