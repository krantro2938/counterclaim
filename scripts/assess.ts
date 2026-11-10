/**
 * Run one assessment from the CLI (used for the Mercury vs Claude comparison at G2):
 *   pnpm tsx --env-file=.env scripts/assess.ts <disputeId> [--provider anthropic|openai_compat]
 */
import { desc, eq } from "drizzle-orm";
import { runAssessment } from "../src/server/agent/assess";
import { db, sql } from "../src/server/db/client";
import { actions, assessments } from "../src/server/db/schema";

const id = process.argv[2];
const pi = process.argv.indexOf("--provider");
const provider =
	pi > 0 ? (process.argv[pi + 1] as "anthropic" | "openai_compat") : undefined;
if (!id)
	throw new Error(
		"usage: scripts/assess.ts <disputeId> [--provider anthropic|openai_compat]",
	);
const t = Date.now();
const aid = await runAssessment(id, { provider });
const [a] = await db()
	.select()
	.from(assessments)
	.where(eq(assessments.disputeId, id))
	.orderBy(desc(assessments.version))
	.limit(1);
const acts = aid
	? await db().select().from(actions).where(eq(actions.assessmentId, aid))
	: [];
console.log(
	JSON.stringify(
		{
			ms: Date.now() - t,
			model: a?.model,
			mode: a?.mode,
			degraded: a?.degraded,
			rubric: a?.rubricScore,
			llm: a?.llmScore,
			final: a?.finalScore,
			recommended: a?.recommendedAction,
			headline: a?.headline,
			reasoning: a?.reasoning,
			actions: acts.map((x) => ({ type: x.type, params: x.params })),
			error: a?.error,
		},
		null,
		2,
	),
);
await sql().end();
process.exit(0);
