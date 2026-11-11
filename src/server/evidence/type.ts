export type EvidenceType = "PROOF_OF_FULFILLMENT" | "PROOF_OF_REFUND" | "OTHER";

/**
 * PayPal only accepts the evidence types it asked the seller for (`evidences[]` with
 * `source: REQUESTED_FROM_SELLER`); anything else fails with EVIDENCE_TYPE_IS_NOT_ALLOWED.
 * Seen in the sandbox: an SNAD claim requested PROOF_OF_REFUND + OTHER, not PROOF_OF_FULFILLMENT.
 */
export function pickEvidenceType(
	evidences: unknown,
	hasShipment: boolean,
): EvidenceType {
	const requested = Array.isArray(evidences)
		? evidences
				.filter(
					(e): e is { evidence_type: string } =>
						e?.source === "REQUESTED_FROM_SELLER" &&
						typeof e?.evidence_type === "string",
				)
				.map((e) => e.evidence_type)
		: [];
	const preferred: EvidenceType = hasShipment
		? "PROOF_OF_FULFILLMENT"
		: "OTHER";
	if (requested.length === 0 || requested.includes(preferred)) return preferred;
	if (requested.includes("OTHER")) return "OTHER";
	if (hasShipment && requested.includes("PROOF_OF_FULFILLMENT"))
		return "PROOF_OF_FULFILLMENT";
	return preferred;
}
