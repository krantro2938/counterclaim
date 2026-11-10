import { z } from "zod";

/** Normalised params per action type. Money is always amountMinor (integer cents). */
export const SendMessageParams = z.object({ message: z.string().trim().min(1).max(2000) });
export const ProvideEvidenceParams = z.object({
	evidenceType: z.enum(["PROOF_OF_FULFILLMENT", "PROOF_OF_REFUND", "OTHER"]).default("PROOF_OF_FULFILLMENT"),
	notes: z.string().trim().min(1).max(2000),
	includeTracking: z.boolean().default(true),
	includePdf: z.boolean().default(true),
});
export const MakeOfferParams = z.object({
	offerType: z.enum(["REFUND", "REFUND_WITH_RETURN", "REFUND_WITH_REPLACEMENT", "REPLACEMENT_WITHOUT_REFUND"]).default("REFUND"),
	amountMinor: z.number().int().positive(),
	note: z.string().trim().min(1).max(2000),
});
export const AcceptClaimParams = z.object({
	note: z.string().trim().min(1).max(2000),
	acceptClaimType: z.enum(["REFUND", "PARTIAL_REFUND", "REFUND_WITH_RETURN"]).default("REFUND"),
	amountMinor: z.number().int().positive().optional(),
});
export const EscalateParams = z.object({ note: z.string().trim().min(1).max(2000) });

export const PARAM_SCHEMAS = {
	send_message: SendMessageParams,
	provide_evidence: ProvideEvidenceParams,
	make_offer: MakeOfferParams,
	accept_claim: AcceptClaimParams,
	escalate: EscalateParams,
} as const;

export type ActionType = keyof typeof PARAM_SCHEMAS;

function err(message: string) {
	return Object.assign(new Error(message), { status: 400 });
}

/** Validate + normalise params; enforces amount ≤ disputed amount (SPEC §7.3). */
export function validateActionParams(
	type: string,
	raw: Record<string, unknown>,
	dispute: { amountMinor: number; currency: string },
): Record<string, unknown> {
	const schema = PARAM_SCHEMAS[type as ActionType];
	if (!schema) throw err(`Unknown action type ${type}`);
	const r = schema.safeParse(raw);
	if (!r.success) throw err(`Invalid ${type} params: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
	const p = r.data as Record<string, unknown>;
	if (typeof p.amountMinor === "number" && p.amountMinor > dispute.amountMinor) {
		throw err(`Amount exceeds the disputed amount (${dispute.amountMinor} ${dispute.currency} minor units)`);
	}
	if (type === "accept_claim" && p.acceptClaimType === "PARTIAL_REFUND" && typeof p.amountMinor !== "number") {
		throw err("A partial refund needs an amount");
	}
	return p;
}
