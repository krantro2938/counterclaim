import { describe, expect, it } from "vitest";
import {
	hybridScore,
	rubricRecommendation,
	scoreRubric,
} from "../src/server/agent/rubric";
import type { Assessment } from "../src/server/agent/schema";
import { validateAssessment } from "../src/server/agent/validate";
import { assembleCaseFile } from "../src/server/casefile";
import { decidePolicy } from "../src/server/policy";
import { validateActionParams } from "../src/server/policy/params";
import { evaluateProtection } from "../src/server/protection";
import { DEFAULT_AUTOPILOT } from "../src/server/settings";

const t = (h: number) => new Date(Date.UTC(2026, 10, 10, 12) - h * 3_600_000);
const addr = {
	name: "Jordan Lee",
	line1: "1 Main St",
	city: "San Jose",
	state: "CA",
	postalCode: "95131",
	countryCode: "US",
};

// biome-ignore lint/suspicious/noExplicitAny: test fixtures mirror DB rows loosely
function rows(opts: {
	reason: string;
	ship?: boolean;
	deliver?: boolean;
	uploadBefore?: boolean;
	glaze?: boolean;
	links?: string[];
}): any {
	const order = {
		id: "o1",
		number: 1042,
		paypalOrderId: "PO1",
		captureId: "CAP1",
		buyerEmail: "b@example.com",
		buyerName: "Jordan Lee",
		payerId: null,
		amountMinor: 6400,
		currency: "USD",
		items: [
			{
				slug: "vase",
				title: "Speckled Stoneware Vase",
				quantity: 1,
				unitMinor: 6400,
			},
		],
		shippingAddress: addr,
		paypalShippingAddress: addr,
		status: "captured",
		capturedAt: t(100),
		protectionStatus: "protected",
		protectionReasons: [],
		origin: "paypal",
		raw: null,
		createdAt: t(100),
	};
	const shipment = opts.ship
		? {
				id: "s1",
				orderId: "o1",
				carrier: "USPS",
				trackingNumber: "9400111899223100000",
				shippedAt: t(90),
				uploadedToPaypalAt: opts.uploadBefore ? t(89) : null,
				paypalResponse: null,
				simulated: true,
			}
		: null;
	const events = opts.deliver
		? [
				{
					id: 1,
					shipmentId: "s1",
					code: "delivered",
					description: "Delivered",
					location: "San Jose, CA 95131",
					occurredAt: t(40),
					simulated: true,
				},
			]
		: [];
	const messages = opts.glaze
		? [
				{
					id: 1,
					orderId: "o1",
					disputeId: null,
					direction: "in",
					channel: "email",
					body: "The glaze is greener than the photo.",
					sentAt: t(30),
				},
				{
					id: 2,
					orderId: "o1",
					disputeId: null,
					direction: "out",
					channel: "email",
					body: "Happy to help, we can offer a partial refund.",
					sentAt: t(29),
				},
			]
		: [];
	const dispute = {
		id: "PP-D-1",
		orderId: "o1",
		reason: opts.reason,
		stage: "CHARGEBACK",
		status: "WAITING_FOR_SELLER_RESPONSE",
		amountMinor: 6400,
		currency: "USD",
		sellerResponseDueAt: t(-72),
		links: [
			{ rel: "self", href: "x" },
			...(opts.links ?? ["provide-evidence", "accept-claim"]).map((rel) => ({
				rel,
				href: rel,
			})),
		],
		raw: {},
		outcome: null,
		outcomeCode: null,
		buyerName: "Jordan Lee",
		buyerTransactionId: null,
		sellerTransactionId: "CAP1",
		createTime: t(10),
		resolvedAt: null,
		firstSeenAt: t(10),
		firstResponseAt: null,
		updatedAt: t(10),
		paypalUpdateTime: null,
	};
	const policies = [
		{ id: 1, section: "shipping", title: "Shipping", body: "Ships in 2 days." },
		{ id: 2, section: "returns", title: "Returns", body: "30-day returns." },
		{
			id: 3,
			section: "handmade_variation",
			title: "Handmade variation",
			body: "Glaze colour varies.",
		},
	];
	const product = {
		id: 1,
		slug: "vase",
		title: "Speckled Stoneware Vase",
		description: "A vase.",
		priceMinor: 6400,
		currency: "USD",
		imageUrl: "/v.svg",
		disclaimer: "Glaze colour varies.",
		sortOrder: 1,
	};
	return { dispute, order, shipment, events, messages, policies, product };
}

const INR = "MERCHANDISE_OR_SERVICE_NOT_RECEIVED";
const SNAD = "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED";

describe("case file", () => {
	it("derives the action space from HATEOAS links only", () => {
		const cf = assembleCaseFile(
			rows({
				reason: INR,
				ship: true,
				deliver: true,
				uploadBefore: true,
				links: ["provide-evidence", "accept-claim", "adjudicate"],
			}),
		);
		expect(cf.allowedActions.sort()).toEqual([
			"accept_claim",
			"provide_evidence",
		]);
	});
	it("creates stable, sourced facts with simulated flags", () => {
		const cf = assembleCaseFile(
			rows({ reason: INR, ship: true, deliver: true, uploadBefore: true }),
		);
		const delivered = cf.facts.find((f) => f.tag === "delivered");
		expect(delivered?.source).toBe("carrier_sim");
		expect(delivered?.simulated).toBe(true);
		expect(cf.facts.map((f) => f.id)).toEqual(
			cf.facts.map((_, i) => `F${i + 1}`),
		);
		expect(cf.facts.some((f) => f.tag === "tracking_uploaded_before")).toBe(
			true,
		);
	});
	it("flags missing tracking", () => {
		const cf = assembleCaseFile(rows({ reason: INR }));
		expect(cf.facts.some((f) => f.tag === "no_tracking")).toBe(true);
	});
});

describe("rubric", () => {
	it("scores a strong INR case high and a no-tracking case at zero", () => {
		expect(
			scoreRubric(
				assembleCaseFile(
					rows({ reason: INR, ship: true, deliver: true, uploadBefore: true }),
				),
			).score,
		).toBe(95);
		expect(scoreRubric(assembleCaseFile(rows({ reason: INR }))).score).toBe(0);
	});
	it("rewards a disclosed colour variation in SNAD", () => {
		const r = scoreRubric(
			assembleCaseFile(
				rows({
					reason: SNAD,
					ship: true,
					deliver: true,
					uploadBefore: true,
					glaze: true,
					links: ["make-offer", "accept-claim"],
				}),
			),
		);
		expect(r.score).toBeGreaterThanOrEqual(80);
	});
	it("blends 60/40", () => {
		expect(hybridScore(95, 80)).toBe(89);
		expect(hybridScore(40, null)).toBe(40);
	});
	it("falls back to accept when the case is weak", () => {
		const cf = assembleCaseFile(rows({ reason: INR }));
		expect(rubricRecommendation(cf, scoreRubric(cf)).recommended).toBe(
			"accept_claim",
		);
	});
});

const baseOut = (over: Partial<Assessment>): Assessment => ({
	likelihood_llm: 80,
	recommended_action: "fight_with_evidence",
	confidence: "high",
	headline: "Fight with tracking evidence",
	reasoning: [{ point: "Delivered", fact_ids: ["F1"] }],
	risks: [],
	missing_evidence: [],
	proposed_actions: [],
	...over,
});
const nullParams = {
	message: null,
	note: null,
	amount: null,
	offer_type: null,
	accept_claim_type: null,
	evidence_notes: null,
};

describe("validator", () => {
	const cf = assembleCaseFile(
		rows({ reason: INR, ship: true, deliver: true, uploadBefore: true }),
	);
	it("drops citations that aren't in the case file", () => {
		const v = validateAssessment(
			baseOut({
				reasoning: [
					{ point: "made up", fact_ids: ["F99"] },
					{ point: "ok", fact_ids: ["F1", "F77"] },
				],
			}),
			cf,
			new Map(),
		);
		expect(v.reasoning).toEqual([{ point: "ok", factIds: ["F1"] }]);
		expect(v.log.some((l) => !l.ok)).toBe(true);
	});
	it("accepts PayPal tool citations only if that tool ran", () => {
		const out = baseOut({
			reasoning: [{ point: "status", fact_ids: ["PP:get_dispute:status"] }],
		});
		expect(validateAssessment(out, cf, new Map()).reasoning).toHaveLength(0);
		expect(
			validateAssessment(
				out,
				cf,
				new Map([["get_dispute", { status: "UNDER_REVIEW" }]]),
			).reasoning,
		).toHaveLength(1);
	});
	it("rejects actions PayPal does not allow (HATEOAS)", () => {
		const v = validateAssessment(
			baseOut({
				proposed_actions: [
					{
						type: "make_offer",
						params: { ...nullParams, amount: "10.00", note: "hi" },
						rationale: "x",
					},
				],
			}),
			cf,
			new Map(),
		);
		expect(v.actions).toHaveLength(0);
		expect(v.recommended).toBe("wait");
	});
	it("rejects amounts above the disputed amount", () => {
		const snad = assembleCaseFile(
			rows({
				reason: SNAD,
				ship: true,
				deliver: true,
				glaze: true,
				links: ["make-offer"],
			}),
		);
		const v = validateAssessment(
			baseOut({
				recommended_action: "make_offer",
				proposed_actions: [
					{
						type: "make_offer",
						params: { ...nullParams, amount: "99.00", note: "offer" },
						rationale: "x",
					},
				],
			}),
			snad,
			new Map(),
		);
		expect(v.actions).toHaveLength(0);
	});
	it("keeps a valid evidence proposal and normalises params", () => {
		const v = validateAssessment(
			baseOut({
				proposed_actions: [
					{
						type: "provide_evidence",
						params: {
							...nullParams,
							evidence_notes: "Delivered per tracking.",
						},
						rationale: "x",
					},
				],
			}),
			cf,
			new Map(),
		);
		expect(v.actions[0]).toMatchObject({
			type: "provide_evidence",
			params: { evidenceType: "PROOF_OF_FULFILLMENT", includeTracking: true },
		});
	});
	it("rejects messages leaking unknown contact details", () => {
		const inq = assembleCaseFile(
			rows({ reason: INR, ship: true, links: ["send-message"] }),
		);
		const v = validateAssessment(
			baseOut({
				recommended_action: "send_message",
				proposed_actions: [
					{
						type: "send_message",
						params: { ...nullParams, message: "Email me at someone@else.com" },
						rationale: "x",
					},
				],
			}),
			inq,
			new Map(),
		);
		expect(v.actions).toHaveLength(0);
	});
});

describe("policy", () => {
	const cf = assembleCaseFile(
		rows({ reason: INR, ship: true, deliver: true, uploadBefore: true }),
	);
	it("needs approval by default", () => {
		expect(
			decidePolicy(
				{ type: "provide_evidence", params: {} },
				{ rubricScore: 95, finalScore: 90, cf, autopilot: DEFAULT_AUTOPILOT },
			).decision,
		).toBe("needs_approval");
	});
	it("auto-approves strong fulfilment evidence only when enabled", () => {
		const autopilot = { ...DEFAULT_AUTOPILOT, autoSubmitFulfillment: true };
		expect(
			decidePolicy(
				{ type: "provide_evidence", params: {} },
				{ rubricScore: 95, finalScore: 90, cf, autopilot },
			).decision,
		).toBe("auto_approved");
		expect(
			decidePolicy(
				{ type: "provide_evidence", params: {} },
				{ rubricScore: 60, finalScore: 60, cf, autopilot },
			).decision,
		).toBe("needs_approval");
	});
	it("validates action params and money limits", () => {
		expect(() =>
			validateActionParams(
				"make_offer",
				{ amountMinor: 7000, note: "x" },
				{ amountMinor: 6400, currency: "USD" },
			),
		).toThrow();
		expect(
			validateActionParams(
				"make_offer",
				{ amountMinor: 1500, note: "x" },
				{ amountMinor: 6400, currency: "USD" },
			),
		).toMatchObject({ offerType: "REFUND" });
		expect(() =>
			validateActionParams(
				"send_message",
				{ message: "" },
				{ amountMinor: 6400, currency: "USD" },
			),
		).toThrow();
	});
});

describe("protection", () => {
	// biome-ignore lint/suspicious/noExplicitAny: fixture
	const r: any = rows({ reason: INR, ship: true, uploadBefore: true });
	it("is protected with tracking on file and matching address", () => {
		expect(
			evaluateProtection(r.order, r.shipment, null, { atRiskAfterHours: 1 })
				.status,
		).toBe("protected");
	});
	it("is at risk without tracking after the window", () => {
		expect(
			evaluateProtection(r.order, null, null, {
				atRiskAfterHours: 1,
				now: t(0),
			}).status,
		).toBe("at_risk");
	});
	it("is not eligible when disputed before tracking was uploaded", () => {
		expect(
			evaluateProtection(r.order, null, r.dispute, { atRiskAfterHours: 1 })
				.status,
		).toBe("not_eligible");
	});
});
