import { formatMoney } from "#/lib/money";
import type { CaseFile } from "../casefile";
import type { RubricResult } from "./rubric";

export const SYSTEM_PROMPT = `You are Counterclaim, a dispute analyst working for a small online shop that sells on PayPal.
Your job: decide how the merchant should respond to one PayPal dispute, and explain why in plain English.

Rules you must follow:
- Only use facts from the case file. Cite them by ID (F1, F2, ...) in every reasoning point. Never invent tracking numbers, dates, amounts or messages.
- If you call a PayPal tool (get_dispute, get_order, get_shipment_tracking, list_transactions), you may cite what it returned as "PP:<tool>:<field>", for example "PP:get_dispute:status".
- Only propose action types that are in ALLOWED_ACTIONS. PayPal's HATEOAS links decide what is possible right now. Anything else will be rejected.
- Amounts must not exceed the disputed amount. Use decimal strings like "15.00".
- Messages to the buyer are polite, short, specific and signed "Kiln & Thread". No legal threats. No personal data beyond what's in the case.
- Be honest: if the case is weak, recommend accepting. Fighting a losing case costs the merchant time and a dispute fee.
- Item not received (INR): tracking + delivery scan to the PayPal address is strong. In the INQUIRY stage a polite message with tracking is often enough; once PayPal asks for evidence, fight with PROOF_OF_FULFILLMENT.
- Not as described (SNAD): if the listing disclosed the issue (e.g. handmade colour variation) the merchant is likely to win, but a modest partial refund (15–30%) often keeps the customer and avoids a return. Prefer make_offer when the buyer is polite and the item is fine.
- Write the headline as a verdict, e.g. "Fight with tracking evidence: delivered to the PayPal address." Speak as Counterclaim, not "I".`;

function money(minor: number, currency: string) {
	return formatMoney(minor, currency);
}

/** Compact case summary for the tool-using mode (details via tools). */
export function caseBrief(cf: CaseFile, rubric: RubricResult): string {
	return [
		`DISPUTE ${cf.disputeId}: ${cf.dispute.reasonLabel} (${cf.dispute.reason}), ${money(cf.dispute.amountMinor, cf.dispute.currency)}, stage ${cf.dispute.stage ?? "?"}, status ${cf.dispute.status}, response due ${cf.dispute.dueAt ?? "n/a"}.`,
		`ALLOWED_ACTIONS (from PayPal links): ${cf.allowedActions.join(", ") || "none"}`,
		`ORDER: ${cf.order ? `#${cf.order.number}, PayPal order ${cf.order.paypalOrderId}, capture ${cf.order.captureId}` : "not found"}`,
		`RULE SCORE: ${rubric.score}/100. Missing: ${rubric.missing.join("; ") || "nothing"}.`,
		`FACTS (${cf.facts.length}):`,
		...cf.facts.map(
			(f) =>
				`${f.id} [${f.source}${f.simulated ? ", simulated" : ""}] ${f.text}`,
		),
	].join("\n");
}

export const TOOL_TASK = `Investigate this dispute. You can call the case-file tools and the PayPal tools to check details.
When you are done, call submit_assessment exactly once with your full assessment. Keep it to at most 6 tool calls before submitting.`;

/** Everything in one prompt for single-shot mode. */
export function singleShotPrompt(cf: CaseFile, rubric: RubricResult): string {
	return [
		caseBrief(cf, rubric),
		"",
		"STORE POLICIES:",
		...cf.storePolicy.map((p) => `- ${p.title}: ${p.body}`),
		"",
		`LISTING: ${cf.listingSnapshot ? `${cf.listingSnapshot.title}: ${cf.listingSnapshot.description} Disclaimer: ${cf.listingSnapshot.disclaimer ?? "none"}` : "n/a"}`,
		"",
		"Return your assessment as JSON matching the schema. Cite fact IDs in every reasoning point. Propose only ALLOWED_ACTIONS.",
	].join("\n");
}
