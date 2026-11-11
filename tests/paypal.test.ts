import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickEvidenceType } from "../src/server/evidence/type";

const calls: { url: string; init: RequestInit }[] = [];

function mockFetch(
	handler: (
		url: string,
		init: RequestInit,
	) => { status: number; body: unknown; headers?: Record<string, string> },
) {
	vi.stubGlobal("fetch", async (url: string | URL, init: RequestInit = {}) => {
		calls.push({ url: String(url), init });
		if (String(url).endsWith("/v1/oauth2/token")) {
			return new Response(
				JSON.stringify({ access_token: "tok", expires_in: 3600 }),
				{ status: 200 },
			);
		}
		const r = handler(String(url), init);
		return new Response(JSON.stringify(r.body), {
			status: r.status,
			headers: { "paypal-debug-id": "dbg123", ...(r.headers ?? {}) },
		});
	});
}

beforeEach(() => {
	calls.length = 0;
	vi.resetModules();
	process.env.PAYPAL_CLIENT_ID = "id";
	process.env.PAYPAL_CLIENT_SECRET = "secret";
	process.env.PAYPAL_WEBHOOK_ID = "WH-1";
	process.env.PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";
});
afterEach(() => vi.unstubAllGlobals());

describe("paypal rest client", () => {
	it("sends PayPal-Request-Id on mutating calls and returns the debug id", async () => {
		mockFetch(() => ({ status: 200, body: { links: [] } }));
		const { makeOffer } = await import("../src/server/paypal/rest");
		const r = await makeOffer(
			"PP-D-1",
			{
				note: "n",
				offer_type: "REFUND",
				offer_amount: { currency_code: "USD", value: "15.00" },
			},
			"action-uuid",
		);
		expect(r.debugId).toBe("dbg123");
		const call = calls.find((c) => c.url.includes("/make-offer"));
		expect(
			(call?.init.headers as Record<string, string>)["PayPal-Request-Id"],
		).toBe("action-uuid");
		expect(JSON.parse(String(call?.init.body))).toMatchObject({
			offer_amount: { value: "15.00" },
		});
	});
	it("maps PayPal errors to PayPalError with name, details and debug id", async () => {
		mockFetch(() => ({
			status: 422,
			body: {
				name: "UNPROCESSABLE_ENTITY",
				message: "Action not allowed",
				details: [{ issue: "NOT_ALLOWED" }],
			},
		}));
		const { acceptClaim, PayPalError } = await import(
			"../src/server/paypal/rest"
		);
		const err = await acceptClaim("PP-D-1", { note: "x" }, "a1").catch(
			(e) => e,
		);
		expect(err).toBeInstanceOf(PayPalError);
		expect(err.toJSON()).toMatchObject({
			name: "UNPROCESSABLE_ENTITY",
			status: 422,
			debugId: "dbg123",
		});
	});
	it("builds provide-evidence as multipart with an input JSON part and a file part", async () => {
		mockFetch(() => ({ status: 200, body: {} }));
		const { provideEvidence } = await import("../src/server/paypal/rest");
		await provideEvidence(
			"PP-D-1",
			{
				evidenceType: "PROOF_OF_FULFILLMENT",
				trackingInfo: [{ carrier_name: "USPS", tracking_number: "9400" }],
				notes: "Delivered",
				file: {
					name: "evidence.pdf",
					bytes: new Uint8Array([1, 2, 3]),
					contentType: "application/pdf",
				},
			},
			"a2",
		);
		const call = calls.find((c) => c.url.includes("/provide-evidence"));
		const form = call?.init.body as FormData;
		expect(form).toBeInstanceOf(FormData);
		const input = JSON.parse(await (form.get("input") as Blob).text());
		expect(input.evidences[0]).toMatchObject({
			evidence_type: "PROOF_OF_FULFILLMENT",
			evidence_info: { tracking_info: [{ carrier_name: "USPS" }] },
			documents: [{ name: "evidence.pdf" }],
		});
		expect(form.get("evidence-file")).toBeInstanceOf(Blob);
	});
});

describe("webhook verification", () => {
	it("verifies via PayPal and passes the webhook id + transmission headers", async () => {
		mockFetch(() => ({
			status: 200,
			body: { verification_status: "SUCCESS" },
		}));
		const { verifyWebhook } = await import("../src/server/paypal/webhooks");
		const headers = new Headers({
			"paypal-auth-algo": "SHA256withRSA",
			"paypal-cert-url": "https://api.sandbox.paypal.com/cert",
			"paypal-transmission-id": "tid",
			"paypal-transmission-sig": "sig",
			"paypal-transmission-time": "2026-11-11T00:00:00Z",
		});
		const r = await verifyWebhook(headers, {
			id: "WH-EVT-1",
			event_type: "CUSTOMER.DISPUTE.CREATED",
		});
		expect(r.verified).toBe(true);
		const body = JSON.parse(
			String(
				calls.find((c) => c.url.includes("verify-webhook-signature"))?.init
					.body,
			),
		);
		expect(body).toMatchObject({
			webhook_id: "WH-1",
			transmission_id: "tid",
			auth_algo: "SHA256withRSA",
			webhook_event: { id: "WH-EVT-1" },
		});
	});
	it("rejects when PayPal says FAILURE", async () => {
		mockFetch(() => ({
			status: 200,
			body: { verification_status: "FAILURE" },
		}));
		const { verifyWebhook } = await import("../src/server/paypal/webhooks");
		expect((await verifyWebhook(new Headers(), { id: "x" })).verified).toBe(
			false,
		);
	});
});

describe("pickEvidenceType", () => {
	const req = (...types: string[]) =>
		types.map((t) => ({ evidence_type: t, source: "REQUESTED_FROM_SELLER" }));
	it("keeps proof of fulfilment when PayPal asked for it or asked for nothing", () => {
		expect(pickEvidenceType(req("PROOF_OF_FULFILLMENT", "OTHER"), true)).toBe(
			"PROOF_OF_FULFILLMENT",
		);
		expect(pickEvidenceType([], true)).toBe("PROOF_OF_FULFILLMENT");
	});
	it("falls back to OTHER when PayPal only requested refund proof or other (sandbox SNAD claim)", () => {
		expect(pickEvidenceType(req("PROOF_OF_REFUND", "OTHER"), true)).toBe(
			"OTHER",
		);
	});
	it("always sends OTHER in the sandbox, which rejects PROOF_OF_FULFILLMENT even when requested", () => {
		expect(
			pickEvidenceType(
				req("PROOF_OF_FULFILLMENT", "PROOF_OF_REFUND"),
				true,
				true,
			),
		).toBe("OTHER");
	});
	it("ignores evidence the buyer submitted", () => {
		expect(
			pickEvidenceType(
				[{ evidence_type: "CREATE", source: "SUBMITTED_BY_BUYER" }],
				false,
			),
		).toBe("OTHER");
	});
});
