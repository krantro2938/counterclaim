import { z } from "zod";

/**
 * submit_assessment output (SPEC §7.3). Every key is required and nullable where optional, so the
 * same schema works as a strict JSON schema (Mercury json_schema strict, OpenAI-style) and for Anthropic.
 */
export const ProposedActionSchema = z.object({
	type: z.enum([
		"send_message",
		"provide_evidence",
		"make_offer",
		"accept_claim",
		"escalate",
	]),
	params: z.object({
		message: z
			.string()
			.nullable()
			.describe("send_message: the message to the buyer"),
		note: z
			.string()
			.nullable()
			.describe(
				"make_offer / accept_claim / escalate: note to the buyer or PayPal",
			),
		amount: z
			.string()
			.nullable()
			.describe(
				'make_offer / partial accept_claim: decimal amount, e.g. "15.00"',
			),
		offer_type: z
			.enum([
				"REFUND",
				"REFUND_WITH_RETURN",
				"REFUND_WITH_REPLACEMENT",
				"REPLACEMENT_WITHOUT_REFUND",
			])
			.nullable(),
		accept_claim_type: z
			.enum(["REFUND", "PARTIAL_REFUND", "REFUND_WITH_RETURN"])
			.nullable(),
		evidence_notes: z
			.string()
			.nullable()
			.describe("provide_evidence: summary for PayPal's reviewer"),
	}),
	rationale: z.string(),
});

export const AssessmentSchema = z.object({
	likelihood_llm: z
		.number()
		.int()
		.min(0)
		.max(100)
		.describe("Probability (0-100) that the merchant wins if they fight"),
	recommended_action: z.enum([
		"fight_with_evidence",
		"make_offer",
		"accept_claim",
		"send_message",
		"wait",
	]),
	confidence: z.enum(["low", "medium", "high"]),
	headline: z
		.string()
		.describe("Plain-English verdict, at most 90 characters, no hedging"),
	reasoning: z
		.array(z.object({ point: z.string(), fact_ids: z.array(z.string()) }))
		.describe("Each point must cite fact IDs like F3"),
	risks: z.array(z.string()),
	missing_evidence: z.array(z.string()),
	proposed_actions: z.array(ProposedActionSchema),
});

export type Assessment = z.infer<typeof AssessmentSchema>;
export type ProposedAction = z.infer<typeof ProposedActionSchema>;
