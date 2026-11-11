export type EvidenceType = "PROOF_OF_FULFILLMENT" | "PROOF_OF_REFUND" | "OTHER";

/**
 * PayPal only accepts the evidence types it asked the seller for (`evidences[]` with
 * `source: REQUESTED_FROM_SELLER`); anything else fails with EVIDENCE_TYPE_IS_NOT_ALLOWED.
 * Seen in the sandbox: an SNAD claim requested PROOF_OF_REFUND + OTHER, not PROOF_OF_FULFILLMENT.
 */
export function pickEvidenceType(
	evidences: unknown,
	hasShipment: boolean,
	sandbox = false,
): EvidenceType {
	// Observed in the sandbox (Nov 12): PROOF_OF_FULFILLMENT was rejected with
	// EVIDENCE_TYPE_IS_NOT_ALLOWED on both an SNAD claim and an INR claim that listed it as
	// requested (debug f165553e3aa33, f787823344e9d); OTHER (notes + PDF) was accepted on both.
	// So in the sandbox we send OTHER and cite the tracking in the notes and the PDF.
	if (sandbox) return "OTHER";
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
