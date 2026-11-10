import { generateText, type ModelMessage, Output, stepCountIs } from "ai";
import { and, desc, sql as dsql, eq, inArray } from "drizzle-orm";
import { actionLabel } from "#/lib/labels";
import { buildCaseFile, type CaseFile } from "../casefile";
import { db } from "../db/client";
import { actions, agentSteps, assessments, disputes } from "../db/schema";
import { publish } from "../events/bus";
import { enqueue } from "../jobs/queue";
import { recordActivity } from "../kv";
import { log } from "../log";
import { decidePolicy } from "../policy";
import { getSettings } from "../settings";
import { agentMode, getModel, type ModelInfo } from "./model";
import {
	caseBrief,
	SYSTEM_PROMPT,
	singleShotPrompt,
	TOOL_TASK,
} from "./prompts";
import {
	hybridScore,
	type RubricResult,
	rubricRecommendation,
	scoreRubric,
} from "./rubric";
import { type Assessment, AssessmentSchema } from "./schema";
import { buildAgentTools, truncate } from "./tools";
import { validateAssessment } from "./validate";

type Step = {
	kind: "model" | "tool_call" | "tool_result" | "validation" | "info";
	payload: Record<string, unknown>;
};

const MAX_STEPS = 8;

/** Tool-using mode: investigation loop with read tools, ending in submit_assessment. */
async function runToolMode(
	info: ModelInfo,
	cf: CaseFile,
	rubric: RubricResult,
	steps: Step[],
	calledPayPal: Set<string>,
) {
	const settings = await getSettings();
	const timing = new Map<string, number>();
	const tools = buildAgentTools(
		cf,
		settings.feeConstants,
		() => {},
		calledPayPal,
	);
	const res = await generateText({
		model: info.model,
		instructions: SYSTEM_PROMPT,
		prompt: `${caseBrief(cf, rubric)}\n\n${TOOL_TASK}`,
		tools,
		temperature: info.temperature,
		maxOutputTokens: 4000,
		stopWhen: [
			stepCountIs(MAX_STEPS),
			({ steps: s }) =>
				s.some((st) =>
					st.toolCalls.some((c) => c.toolName === "submit_assessment"),
				),
		],
		onToolExecutionStart: (e: { toolCall?: { toolCallId?: string } }) => {
			if (e.toolCall?.toolCallId) timing.set(e.toolCall.toolCallId, Date.now());
		},
	} as Parameters<typeof generateText>[0]);

	let submitted: Assessment | null = null;
	for (const st of res.steps) {
		const calls = st.toolCalls.filter(
			(c) => c.toolName !== "submit_assessment",
		);
		steps.push({
			kind: "model",
			payload: {
				text: truncate(st.text ?? "", 1200),
				reasoning: st.reasoningText
					? truncate(st.reasoningText, 800)
					: undefined,
				calls: st.toolCalls.map((c) => c.toolName),
				finishReason: st.finishReason,
				usage: { input: st.usage?.inputTokens, output: st.usage?.outputTokens },
			},
		});
		for (const c of calls) {
			const source = [
				"get_dispute",
				"get_order",
				"get_shipment_tracking",
				"list_transactions",
			].includes(c.toolName)
				? "paypal_agent_toolkit"
				: "case_file";
			steps.push({
				kind: "tool_call",
				payload: { tool: c.toolName, source, input: c.input },
			});
			const r = st.toolResults.find((t) => t.toolCallId === c.toolCallId);
			const output = r ? (r as { output?: unknown }).output : undefined;
			const isErr = Boolean(
				output &&
					typeof output === "object" &&
					"error" in (output as Record<string, unknown>),
			);
			steps.push({
				kind: "tool_result",
				payload: {
					tool: c.toolName,
					source,
					ok: Boolean(r) && !isErr,
					result: truncate(output ?? "(no result)", 1500),
				},
			});
		}
		const sub = st.toolCalls.find((c) => c.toolName === "submit_assessment");
		if (sub) {
			const parsed = AssessmentSchema.safeParse(sub.input);
			if (parsed.success) submitted = parsed.data;
			else
				steps.push({
					kind: "validation",
					payload: {
						ok: false,
						what: "submit_assessment",
						detail: `Schema errors: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
					},
				});
		}
	}
	if (submitted) return { output: submitted, usage: res.usage };

	// The model investigated but never submitted: ask once more for the structured result.
	steps.push({
		kind: "info",
		payload: {
			detail:
				"Model did not call submit_assessment; requesting structured output",
		},
	});
	const messages: ModelMessage[] = [
		...(res.response.messages as ModelMessage[]),
		{
			role: "user",
			content: "Now submit your final assessment as JSON matching the schema.",
		},
	];
	const res2 = await generateText({
		model: info.model,
		instructions: SYSTEM_PROMPT,
		messages: [
			{ role: "user", content: `${caseBrief(cf, rubric)}\n\n${TOOL_TASK}` },
			...messages,
		],
		output: Output.object({ schema: AssessmentSchema }),
		temperature: info.temperature,
		maxOutputTokens: 3000,
	});
	steps.push({
		kind: "model",
		payload: {
			text: "Structured assessment returned",
			usage: {
				input: res2.usage?.inputTokens,
				output: res2.usage?.outputTokens,
			},
		},
	});
	return { output: res2.output as Assessment, usage: res.usage };
}

/** Single-shot mode: all facts in the prompt, JSON output validated by Zod, one repair attempt. */
async function runSingleShot(
	info: ModelInfo,
	cf: CaseFile,
	rubric: RubricResult,
	steps: Step[],
) {
	const prompt = singleShotPrompt(cf, rubric);
	try {
		const res = await generateText({
			model: info.model,
			instructions: SYSTEM_PROMPT,
			prompt,
			output: Output.object({ schema: AssessmentSchema }),
			temperature: info.temperature,
			maxOutputTokens: 3000,
		});
		steps.push({
			kind: "model",
			payload: {
				text: "Single-shot assessment (all facts in prompt)",
				usage: {
					input: res.usage?.inputTokens,
					output: res.usage?.outputTokens,
				},
			},
		});
		return { output: res.output as Assessment, usage: res.usage };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		steps.push({
			kind: "validation",
			payload: {
				ok: false,
				what: "model output",
				detail: `Invalid JSON, repairing once: ${truncate(message, 300)}`,
			},
		});
		const res = await generateText({
			model: info.model,
			instructions: SYSTEM_PROMPT,
			prompt: `${prompt}\n\nYour previous answer was invalid: ${truncate(message, 500)}\nReturn ONLY valid JSON for the schema.`,
			output: Output.object({ schema: AssessmentSchema }),
			temperature: info.temperature,
			maxOutputTokens: 3000,
		});
		steps.push({
			kind: "model",
			payload: {
				text: "Repair attempt succeeded",
				usage: {
					input: res.usage?.inputTokens,
					output: res.usage?.outputTokens,
				},
			},
		});
		return { output: res.output as Assessment, usage: res.usage };
	}
}

export async function runAssessment(
	disputeId: string,
	opts: { provider?: "openai_compat" | "anthropic" } = {},
): Promise<number | null> {
	const [d] = await db()
		.select()
		.from(disputes)
		.where(eq(disputes.id, disputeId))
		.limit(1);
	if (!d) throw new Error(`Dispute ${disputeId} not found`);
	if (d.status === "RESOLVED") return null;

	const [{ v }] = await db()
		.select({ v: dsql<number>`coalesce(max(${assessments.version}), 0)` })
		.from(assessments)
		.where(eq(assessments.disputeId, disputeId));
	const [row] = await db()
		.insert(assessments)
		.values({
			disputeId,
			version: Number(v) + 1,
			state: "running",
			statusAtAssessment: d.status,
		})
		.returning({ id: assessments.id });
	const assessmentId = row.id;
	await publish({ type: "assessment.started", disputeId });
	const started = Date.now();
	const steps: Step[] = [];
	const calledPayPal = new Set<string>();

	try {
		const cf = await buildCaseFile(disputeId);
		const rubric = scoreRubric(cf);
		steps.push({
			kind: "info",
			payload: {
				detail: `Case file built: ${cf.facts.length} facts. PayPal allows: ${cf.allowedRels.filter((r) => r !== "self").join(", ") || "nothing"}`,
				allowedActions: cf.allowedActions,
			},
		});
		steps.push({
			kind: "info",
			payload: {
				detail: `Rule score ${rubric.score}/100`,
				rubric: rubric.items.map((i) => ({
					label: i.label,
					earned: i.earned,
					points: i.points,
					met: i.met,
				})),
			},
		});

		let output: Assessment | null = null;
		let mode = "rubric_only";
		let modelId: string | null = null;
		let usage: { inputTokens?: number; outputTokens?: number } | undefined;
		let llmError: string | null = null;
		try {
			const info = getModel("assess", opts.provider);
			modelId = `${info.provider}:${info.id}`;
			mode = agentMode(info);
			if (mode === "tools") {
				try {
					const r = await runToolMode(info, cf, rubric, steps, calledPayPal);
					output = r.output;
					usage = r.usage;
				} catch (err) {
					llmError = err instanceof Error ? err.message : String(err);
					steps.push({
						kind: "info",
						payload: {
							detail: `Tool mode failed (${truncate(llmError, 200)}); falling back to single-shot`,
						},
					});
					mode = "single_shot";
				}
			}
			if (!output) {
				mode = "single_shot";
				const r = await runSingleShot(info, cf, rubric, steps);
				output = r.output;
				usage = r.usage;
			}
		} catch (err) {
			llmError = err instanceof Error ? err.message : String(err);
			steps.push({
				kind: "info",
				payload: {
					detail: `AI assessment unavailable: ${truncate(llmError, 300)}`,
				},
			});
			output = null;
		}

		let degraded = false;
		let headline: string;
		let recommended: string;
		let reasoning: { point: string; factIds: string[] }[] = [];
		let risks: string[] = [];
		let missing: string[] = [...rubric.missing];
		let proposals: {
			type: string;
			params: Record<string, unknown>;
			rationale: string;
		}[] = [];
		let llmScore: number | null = null;
		let confidence: string | null = null;

		if (output) {
			const v = validateAssessment(output, cf, calledPayPal);
			for (const l of v.log) steps.push({ kind: "validation", payload: l });
			llmScore = output.likelihood_llm;
			confidence = output.confidence;
			reasoning = v.reasoning;
			risks = v.risks;
			missing = [...new Set([...v.missing, ...rubric.missing])].slice(0, 6);
			proposals = v.actions;
			headline = v.headline;
			recommended = v.recommended;
			if (!v.reasoning.length && !v.actions.length && cf.allowedActions.length)
				degraded = true;
		} else {
			degraded = true;
			headline = "";
			recommended = "wait";
		}
		if (degraded) {
			const rec = rubricRecommendation(cf, rubric);
			headline = rec.headline;
			recommended = rec.recommended;
			proposals = rec.actions;
			llmScore = null;
			reasoning = rubric.items
				.filter((i) => i.met && i.factIds.length)
				.map((i) => ({
					point: `${i.label} (${i.earned > 0 ? "+" : ""}${i.earned})`,
					factIds: i.factIds,
				}));
			steps.push({
				kind: "validation",
				payload: {
					ok: false,
					what: "assessment",
					detail: "Degraded to rule-based recommendation",
				},
			});
		}

		const finalScore = hybridScore(rubric.score, llmScore);
		const settings = await getSettings();

		await db().transaction(async (tx) => {
			await tx
				.update(assessments)
				.set({
					state: "ready",
					rubricScore: rubric.score,
					llmScore,
					finalScore,
					recommendedAction: recommended,
					confidence,
					headline,
					reasoning,
					risks,
					missing,
					facts: cf.facts,
					rubric: rubric.items,
					degraded,
					mode: degraded
						? output
							? `${mode}+rubric_fallback`
							: "rubric_only"
						: mode,
					model: modelId,
					latencyMs: Date.now() - started,
					tokensIn: usage?.inputTokens ?? null,
					tokensOut: usage?.outputTokens ?? null,
					error: llmError,
				})
				.where(eq(assessments.id, assessmentId));
			await tx
				.update(actions)
				.set({ status: "superseded" })
				.where(
					and(
						eq(actions.disputeId, disputeId),
						inArray(actions.status, ["proposed", "needs_approval"]),
					),
				);
			if (steps.length) {
				await tx.insert(agentSteps).values(
					steps.map((s, i) => ({
						assessmentId,
						seq: i + 1,
						kind: s.kind,
						payload: s.payload,
					})),
				);
			}
		});

		for (const p of proposals) {
			const pol = decidePolicy(p, {
				rubricScore: rubric.score,
				finalScore,
				cf,
				autopilot: settings.autopilot,
			});
			const auto = pol.decision === "auto_approved";
			const executeAfter = auto
				? new Date(Date.now() + settings.autopilot.undoWindowSeconds * 1000)
				: null;
			const [a] = await db()
				.insert(actions)
				.values({
					disputeId,
					assessmentId,
					type: p.type,
					params: p.params,
					status: auto ? "auto_scheduled" : "needs_approval",
					source: auto ? "autopilot" : "agent",
					rationale: auto
						? `${p.rationale} (Autopilot: ${pol.rule})`
						: p.rationale,
					rel: p.type.replace(/_/g, "-"),
					executeAfter,
				})
				.returning({ id: actions.id });
			if (auto && executeAfter)
				await enqueue("execute_action", {
					refId: a.id,
					runAfter: executeAfter,
				});
		}

		await recordActivity({
			actor: "agent",
			kind: "assessed",
			text: `Counterclaim assessed the case: ${finalScore}% win likelihood · ${actionLabel(recommended)}${degraded ? " (rule-based)" : ""}`,
			disputeId,
			orderId: d.orderId,
			meta: { assessmentId, latencyMs: Date.now() - started },
		});
		await publish({ type: "assessment.ready", disputeId, assessmentId });
		log.info(
			{
				disputeId,
				assessmentId,
				finalScore,
				rubric: rubric.score,
				llm: llmScore,
				mode,
				degraded,
				ms: Date.now() - started,
			},
			"assessment ready",
		);
		return assessmentId;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await db()
			.update(assessments)
			.set({ state: "failed", error: message, latencyMs: Date.now() - started })
			.where(eq(assessments.id, assessmentId));
		if (steps.length)
			await db()
				.insert(agentSteps)
				.values(
					steps.map((s, i) => ({
						assessmentId,
						seq: i + 1,
						kind: s.kind,
						payload: s.payload,
					})),
				);
		await publish({ type: "dispute.updated", disputeId });
		throw err;
	}
}

export async function latestAssessmentId(
	disputeId: string,
): Promise<number | null> {
	const [a] = await db()
		.select({ id: assessments.id })
		.from(assessments)
		.where(
			and(eq(assessments.disputeId, disputeId), eq(assessments.state, "ready")),
		)
		.orderBy(desc(assessments.version))
		.limit(1);
	return a?.id ?? null;
}
