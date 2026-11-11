import type { CaseFile, Fact } from "../casefile";
import { pickEvidenceType } from "../evidence/type";

/** Deterministic rubric (SPEC §7.2). Anchors the LLM: final = 0.6 × rubric + 0.4 × llm. */

export type RubricItem = {
	label: string;
	points: number;
	earned: number;
	met: boolean;
	factIds: string[];
};
export type RubricResult = {
	score: number;
	items: RubricItem[];
	missing: string[];
	reasonGroup: "INR" | "SNAD" | "OTHER";
};

const has = (facts: Fact[], tag: string) =>
	facts.filter((f) => f.tag === tag).map((f) => f.id);

export function reasonGroup(reason: string): RubricResult["reasonGroup"] {
	if (reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED") return "INR";
	if (reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED") return "SNAD";
	return "OTHER";
}

export function scoreRubric(cf: CaseFile): RubricResult {
	const f = cf.facts;
	const group = reasonGroup(cf.dispute.reason);
	const items: RubricItem[] = [];
	const item = (
		label: string,
		points: number,
		ids: string[],
		met = ids.length > 0,
	) =>
		items.push({
			label,
			points,
			earned: met ? points : 0,
			met,
			factIds: met ? ids : [],
		});

	if (group === "INR") {
		item("Tracking number exists", 35, has(f, "tracking_exists"));
		item(
			"Tracking uploaded to PayPal before the dispute",
			15,
			has(f, "tracking_uploaded_before"),
		);
		item("Carrier shows delivered", 30, has(f, "delivered"));
		item(
			"Delivered to the PayPal-confirmed address",
			15,
			has(f, "address_match"),
			has(f, "address_match").length > 0 &&
				has(f, "tracking_exists").length > 0,
		);
		item("Signature or photo on delivery", 5, [], false);
	} else if (group === "SNAD") {
		const disclaimer = has(f, "listing_disclaimer");
		item(
			"Listing disclaimer covers the complaint",
			30,
			disclaimer,
			disclaimer.length > 0 && cf.signals.complaintMentionsColour,
		);
		item("Product photos shown at purchase", 15, has(f, "listing_photos"));
		item(
			"Returns or a remedy offered",
			15,
			[...has(f, "policy_returns"), ...has(f, "merchant_message")],
			has(f, "policy_returns").length > 0 || cf.signals.merchantOfferedHelp,
		);
		item("Item delivered", 10, has(f, "delivered"));
		item(
			"Base: buyer's claim is about variation, not damage",
			20,
			[],
			cf.signals.complaintMentionsColour,
		);
		if (!cf.signals.buyerContactedFirst) {
			items.push({
				label: "Buyer did not contact the store first",
				points: -10,
				earned: -10,
				met: true,
				factIds: has(f, "no_buyer_contact"),
			});
		}
	} else {
		item("Base for this reason", 20, [], true);
		item(
			"Delivered to the PayPal-confirmed address",
			20,
			[...has(f, "delivered"), ...has(f, "address_match")],
			has(f, "delivered").length > 0 && has(f, "address_match").length > 0,
		);
		item("Tracking uploaded to PayPal", 15, has(f, "tracking_uploaded_before"));
	}

	const score = Math.max(
		0,
		Math.min(
			100,
			items.reduce((s, i) => s + i.earned, 0),
		),
	);
	const missing = items
		.filter((i) => !i.met && i.points > 0)
		.map((i) => i.label);
	return { score, items, missing, reasonGroup: group };
}

export function hybridScore(rubric: number, llm: number | null): number {
	if (llm == null) return rubric;
	return Math.round(Math.max(0, Math.min(100, 0.6 * rubric + 0.4 * llm)));
}

/** Rubric-only recommendation (used when the LLM is unavailable or everything it proposed was invalid). */
export function rubricRecommendation(
	cf: CaseFile,
	r: RubricResult,
): {
	recommended:
		| "fight_with_evidence"
		| "make_offer"
		| "accept_claim"
		| "send_message"
		| "wait";
	headline: string;
	actions: {
		type: string;
		params: Record<string, unknown>;
		rationale: string;
	}[];
} {
	const allow = new Set(cf.allowedActions);
	const amount = cf.dispute.amountMinor;
	const tracking = cf.shipment
		? `${cf.shipment.carrier} ${cf.shipment.trackingNumber}`
		: null;
	if (cf.dispute.status === "RESOLVED" || !allow.size) {
		return {
			recommended: "wait",
			headline: "No action available right now; PayPal has the case.",
			actions: [],
		};
	}
	if (r.reasonGroup === "INR" && r.score >= 70) {
		if (allow.has("provide_evidence")) {
			return {
				recommended: "fight_with_evidence",
				headline: "Fight with tracking evidence: delivery is confirmed.",
				actions: [
					{
						type: "provide_evidence",
						params: {
							evidenceType: pickEvidenceType(
								cf.dispute.evidencesRequested,
								true,
							),
							notes: `Order shipped with tracking ${tracking} and the carrier confirms delivery to the PayPal-confirmed address. Evidence packet attached.`,
							includeTracking: true,
							includePdf: true,
						},
						rationale:
							"Tracking and a delivery scan are the evidence PayPal needs for an item-not-received claim.",
					},
				],
			};
		}
		if (allow.has("send_message")) {
			return {
				recommended: "send_message",
				headline: "Reply with tracking: delivery is confirmed.",
				actions: [
					{
						type: "send_message",
						params: {
							message: `Hello, your order shipped with ${tracking} and the carrier shows it as delivered to your PayPal address. Could you check around the delivery spot or with neighbours? We're happy to help if it still hasn't turned up.`,
						},
						rationale:
							"In the inquiry stage, sharing tracking politely often closes the case.",
					},
				],
			};
		}
	}
	if (r.reasonGroup === "SNAD" && r.score >= 50 && allow.has("make_offer")) {
		const offer = Math.max(100, Math.round((amount * 0.25) / 100) * 100);
		return {
			recommended: "make_offer",
			headline: `Offer a partial refund to keep the customer.`,
			actions: [
				{
					type: "make_offer",
					params: {
						offerType: "REFUND",
						amountMinor: Math.min(offer, amount),
						note: "Each piece is hand-glazed, so colour varies as the listing explains. We'd like you to keep it with a partial refund.",
					},
					rationale:
						"The listing disclosed colour variation, but a goodwill partial refund is cheaper than a fight.",
				},
			],
		};
	}
	if (allow.has("accept_claim")) {
		return {
			recommended: "accept_claim",
			headline: "Accept and refund: this case is unlikely to be won.",
			actions: [
				{
					type: "accept_claim",
					params: {
						note: "We're sorry about this order. We've accepted the claim and refunded you.",
						acceptClaimType: "REFUND",
					},
					rationale:
						"Key evidence is missing; fighting costs time and likely fails.",
				},
			],
		};
	}
	return {
		recommended: "wait",
		headline: "Waiting on PayPal; no seller action available.",
		actions: [],
	};
}
