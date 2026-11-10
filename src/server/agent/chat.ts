import { generateText, stepCountIs, tool } from "ai";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { buildCaseFile } from "../casefile";
import { db } from "../db/client";
import { actions, assessments } from "../db/schema";
import { publish } from "../events/bus";
import { recordActivity } from "../kv";
import { validateActionParams } from "../policy/params";
import { getSettings } from "../settings";
import { getModel } from "./model";
import { caseBrief } from "./prompts";
import { scoreRubric } from "./rubric";
import { buildAgentTools } from "./tools";

/**
 * Agent chat on a dispute (SPEC §7.6). Same read-only case-file + toolkit tools, plus
 * revise_proposed_action, which only creates a NEW proposal (needs approval). Nothing executes from chat.
 */
export async function chatAboutDispute(
	disputeId: string,
	message: string,
	history: { role: "user" | "assistant"; content: string }[],
): Promise<{ reply: string; revisedActionId: string | null }> {
	const cf = await buildCaseFile(disputeId);
	const rubric = scoreRubric(cf);
	const settings = await getSettings();
	const [a] = await db()
		.select()
		.from(assessments)
		.where(
			and(eq(assessments.disputeId, disputeId), eq(assessments.state, "ready")),
		)
		.orderBy(desc(assessments.version))
		.limit(1);
	const open = await db()
		.select()
		.from(actions)
		.where(
			and(
				eq(actions.disputeId, disputeId),
				inArray(actions.status, ["needs_approval", "proposed"]),
			),
		);
	const info = getModel("cheap");
	let revisedActionId: string | null = null;

	const base = buildAgentTools(cf, settings.feeConstants, () => {}, new Map());
	const { submit_assessment: _drop, ...readTools } = base;
	const tools = {
		...readTools,
		revise_proposed_action: tool({
			description:
				"Create a revised version of one of the open proposed actions (e.g. a softer message or a different amount). The merchant still has to approve it.",
			inputSchema: z.object({
				action_id: z.string(),
				message: z.string().nullable().describe("new buyer message or note"),
				amount: z
					.string()
					.nullable()
					.describe('new amount as a decimal string, e.g. "15.00"'),
			}),
			execute: async ({ action_id, message: text, amount }) => {
				const prev = open.find((x) => x.id === action_id);
				if (!prev) return { error: "No open proposal with that id" };
				const key =
					prev.type === "send_message"
						? "message"
						: prev.type === "provide_evidence"
							? "notes"
							: "note";
				const params: Record<string, unknown> = { ...prev.params };
				if (text) params[key] = text;
				if (amount)
					params.amountMinor = Math.round(
						Number(amount.replace(/[$,\s]/g, "")) * 100,
					);
				let valid: Record<string, unknown>;
				try {
					valid = validateActionParams(prev.type, params, {
						amountMinor: cf.dispute.amountMinor,
						currency: cf.dispute.currency,
					});
				} catch (err) {
					return { error: (err as Error).message };
				}
				await db()
					.update(actions)
					.set({ status: "superseded" })
					.where(eq(actions.id, prev.id));
				const [row] = await db()
					.insert(actions)
					.values({
						disputeId,
						assessmentId: prev.assessmentId,
						type: prev.type,
						params: valid,
						status: "needs_approval",
						source: "agent",
						rationale: `${prev.rationale ?? ""} (revised in chat)`.trim(),
						rel: prev.rel,
					})
					.returning({ id: actions.id });
				revisedActionId = row.id;
				await recordActivity({
					actor: "agent",
					kind: "proposal_revised",
					text: "Counterclaim revised a proposal from chat",
					disputeId,
				});
				await publish({
					type: "action.updated",
					disputeId,
					actionId: row.id,
					status: "needs_approval",
				});
				return {
					ok: true,
					newActionId: row.id,
					note: "Revised proposal created; the merchant must approve it.",
				};
			},
		}),
	};

	const res = await generateText({
		model: info.model,
		instructions: `You are Counterclaim, answering the merchant's questions about one PayPal dispute. Speak as "Counterclaim", be brief (≤ 120 words), plain and specific. Cite fact IDs like (F3) when you rely on evidence. You cannot send anything to PayPal; to change a proposal use revise_proposed_action, and remind the merchant to approve it.

${caseBrief(cf, rubric)}

CURRENT ASSESSMENT: ${a ? `${a.finalScore}% · ${a.recommendedAction} · "${a.headline}"` : "none yet"}
OPEN PROPOSALS: ${open.map((x) => `${x.id} ${x.type} ${JSON.stringify(x.params)}`).join("\n") || "none"}`,
		messages: [...history.slice(-8), { role: "user", content: message }],
		tools,
		stopWhen: stepCountIs(4),
		temperature: info.temperature,
		maxOutputTokens: 800,
	});
	return { reply: res.text.trim() || "Done.", revisedActionId };
}
