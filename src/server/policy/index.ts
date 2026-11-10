import type { CaseFile } from "../casefile";
import type { AutopilotSettings } from "../db/schema";

/** decidePolicy (SPEC §7.4). Default: everything needs the merchant's approval. */
export function decidePolicy(
	action: { type: string; params: Record<string, unknown> },
	ctx: {
		rubricScore: number;
		finalScore: number;
		cf: CaseFile;
		autopilot: AutopilotSettings;
	},
): { decision: "needs_approval" | "auto_approved"; rule?: string } {
	const a = ctx.autopilot;
	if (
		a.autoAcknowledgeInquiry &&
		action.type === "send_message" &&
		ctx.cf.dispute.stage === "INQUIRY"
	) {
		return { decision: "auto_approved", rule: "Acknowledge new inquiries" };
	}
	if (
		a.autoSubmitFulfillment &&
		action.type === "provide_evidence" &&
		ctx.rubricScore >= a.autoSubmitMinScore &&
		ctx.cf.facts.some((f) => f.tag === "delivered")
	) {
		return {
			decision: "auto_approved",
			rule: `Proof of delivery, rule score ≥ ${a.autoSubmitMinScore}`,
		};
	}
	if (
		a.autoAcceptSmallClaims &&
		action.type === "accept_claim" &&
		ctx.cf.dispute.amountMinor <= a.autoAcceptMaxMinor &&
		ctx.finalScore < a.autoAcceptMaxLikelihood
	) {
		return {
			decision: "auto_approved",
			rule: `Small claim under the limit, likelihood < ${a.autoAcceptMaxLikelihood}%`,
		};
	}
	return { decision: "needs_approval" };
}
