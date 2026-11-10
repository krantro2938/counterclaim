/** Human labels for PayPal enums (DESIGN §12). One map, used everywhere. */

export const REASON_LABELS: Record<string, string> = {
	MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Item not received",
	MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described",
	UNAUTHORISED: "Unauthorised",
	CREDIT_NOT_PROCESSED: "Credit not processed",
	DUPLICATE_TRANSACTION: "Duplicate charge",
	INCORRECT_AMOUNT: "Incorrect amount",
	PAYMENT_BY_OTHER_MEANS: "Paid another way",
	CANCELED_RECURRING_BILLING: "Cancelled subscription",
	PROBLEM_WITH_REMITTANCE: "Remittance problem",
	OTHER: "Other",
};

export function reasonLabel(reason?: string | null): string {
	if (!reason) return "Unknown reason";
	return REASON_LABELS[reason] ?? titleCase(reason);
}

export const REASON_SHORT: Record<string, string> = {
	MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "INR",
	MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "SNAD",
};

export const STAGE_LABELS: Record<string, string> = {
	INQUIRY: "Inquiry",
	CHARGEBACK: "Claim",
	PRE_ARBITRATION: "Pre-arbitration",
	ARBITRATION: "Arbitration",
};

export function stageLabel(stage?: string | null): string {
	if (!stage) return "—";
	return STAGE_LABELS[stage] ?? titleCase(stage);
}

export type StatusTone = "review" | "deadline" | "won" | "lost" | "muted";

/** Status label + tone. `outcome` wins for resolved disputes. */
export function statusInfo(status?: string | null, outcome?: string | null): { label: string; tone: StatusTone } {
	switch (status) {
		case "WAITING_FOR_SELLER_RESPONSE":
			return { label: "Your move", tone: "deadline" };
		case "UNDER_REVIEW":
			return { label: "With PayPal", tone: "review" };
		case "WAITING_FOR_BUYER_RESPONSE":
			return { label: "Waiting on buyer", tone: "review" };
		case "OPEN":
			return { label: "Open", tone: "review" };
		case "RESOLVED":
			if (outcome === "won") return { label: "Won", tone: "won" };
			if (outcome === "lost") return { label: "Lost", tone: "lost" };
			if (outcome === "settled") return { label: "Settled", tone: "muted" };
			return { label: "Resolved", tone: "muted" };
		default:
			return { label: status ? titleCase(status) : "Unknown", tone: "muted" };
	}
}

export const ACTION_LABELS: Record<string, string> = {
	fight_with_evidence: "Fight with evidence",
	provide_evidence: "Submit evidence",
	make_offer: "Offer a partial refund",
	accept_claim: "Accept and refund",
	send_message: "Message the buyer",
	escalate: "Escalate to PayPal",
	wait: "Wait",
};

export function actionLabel(a?: string | null): string {
	if (!a) return "—";
	return ACTION_LABELS[a] ?? titleCase(a);
}

/** HATEOAS rel → our action type */
export const REL_TO_ACTION: Record<string, string> = {
	"send-message": "send_message",
	"provide-evidence": "provide_evidence",
	"make-offer": "make_offer",
	"accept-claim": "accept_claim",
	escalate: "escalate",
};

export const ACTION_TO_REL: Record<string, string> = Object.fromEntries(
	Object.entries(REL_TO_ACTION).map(([rel, a]) => [a, rel]),
);

export const ACTION_ENDPOINT: Record<string, string> = {
	send_message: "POST /v1/customer/disputes/{id}/send-message",
	provide_evidence: "POST /v1/customer/disputes/{id}/provide-evidence",
	make_offer: "POST /v1/customer/disputes/{id}/make-offer",
	accept_claim: "POST /v1/customer/disputes/{id}/accept-claim",
	escalate: "POST /v1/customer/disputes/{id}/escalate",
};

export const PROTECTION_LABELS: Record<string, string> = {
	protected: "Protected",
	at_risk: "At risk",
	not_eligible: "Not eligible",
	awaiting: "Awaiting shipment",
	pending: "Pending",
	not_applicable: "Not applicable",
};

export const OUTCOME_CODE_LABELS: Record<string, string> = {
	RESOLVED_SELLER_FAVOUR: "Resolved in your favour",
	RESOLVED_BUYER_FAVOUR: "Resolved in the buyer's favour",
	CANCELED_BY_BUYER: "Cancelled by the buyer",
	ACCEPTED: "Claim accepted",
	DENIED: "Claim denied",
	RESOLVED_WITH_PAYOUT: "Resolved with payout",
	NONE: "No outcome",
};

export function titleCase(s: string): string {
	return s
		.toLowerCase()
		.split(/[_\s-]+/)
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(" ");
}
