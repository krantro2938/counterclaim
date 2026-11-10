/**
 * Executor against a mocked PayPal, using the local Postgres (skipped when it isn't running).
 * Checks: PayPal-Request-Id = action UUID, HATEOAS re-check at execution time, no retry on 4xx.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.PAYPAL_CLIENT_ID = "test-id";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";

const DID = "TEST-EXEC-1";
let dbOk = false;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let mods: any;
const posts: { url: string; headers: Record<string, string>; body: string }[] =
	[];
let links = ["self", "make-offer", "accept-claim", "send-message"];
let offerStatus = 200;

function disputeJson() {
	return {
		dispute_id: DID,
		reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
		status: "WAITING_FOR_SELLER_RESPONSE",
		dispute_life_cycle_stage: "INQUIRY",
		dispute_amount: { currency_code: "USD", value: "48.00" },
		links: links.map((rel) => ({
			rel,
			href: `https://api-m.sandbox.paypal.com/v1/customer/disputes/${DID}/${rel}`,
			method: "POST",
		})),
	};
}

beforeAll(async () => {
	vi.stubGlobal("fetch", async (url: string | URL, init: RequestInit = {}) => {
		const u = String(url);
		if (u.endsWith("/v1/oauth2/token"))
			return new Response(
				JSON.stringify({ access_token: "t", expires_in: 3600 }),
				{ status: 200 },
			);
		if (init.method === "GET" && u.includes(`/v1/customer/disputes/${DID}`))
			return new Response(JSON.stringify(disputeJson()), {
				status: 200,
				headers: { "paypal-debug-id": "dbg-get" },
			});
		if (init.method === "POST") {
			posts.push({
				url: u,
				headers: init.headers as Record<string, string>,
				body: String(init.body),
			});
			if (u.endsWith("/make-offer") && offerStatus !== 200)
				return new Response(
					JSON.stringify({
						name: "UNPROCESSABLE_ENTITY",
						message: "Offer not allowed",
					}),
					{ status: offerStatus, headers: { "paypal-debug-id": "dbg-err" } },
				);
			return new Response(JSON.stringify({ links: [] }), {
				status: 200,
				headers: { "paypal-debug-id": "dbg-post" },
			});
		}
		return new Response("{}", { status: 404 });
	});
	try {
		const client = await import("../src/server/db/client");
		await client.sql()`select 1`;
		dbOk = true;
		mods = {
			client,
			schema: await import("../src/server/db/schema"),
			exec: await import("../src/server/executor"),
			orm: await import("drizzle-orm"),
		};
		const { db } = client;
		const { disputes } = mods.schema;
		await db().delete(disputes).where(mods.orm.eq(disputes.id, DID));
		const d = disputeJson();
		await db().insert(disputes).values({
			id: DID,
			reason: d.reason,
			stage: "INQUIRY",
			status: d.status,
			amountMinor: 4800,
			currency: "USD",
			links: d.links,
			raw: d,
		});
	} catch {
		dbOk = false;
	}
});

afterAll(async () => {
	if (dbOk) {
		await mods.client
			.db()
			.delete(mods.schema.disputes)
			.where(mods.orm.eq(mods.schema.disputes.id, DID));
		await mods.client
			.db()
			.delete(mods.schema.jobs)
			.where(mods.orm.eq(mods.schema.jobs.refId, DID));
	}
	vi.unstubAllGlobals();
});

async function newAction(type: string, params: Record<string, unknown>) {
	const [a] = await mods.client
		.db()
		.insert(mods.schema.actions)
		.values({
			disputeId: DID,
			type,
			params,
			status: "approved",
			source: "merchant",
		})
		.returning();
	return a;
}

async function reload(id: string) {
	const [a] = await mods.client
		.db()
		.select()
		.from(mods.schema.actions)
		.where(mods.orm.eq(mods.schema.actions.id, id));
	return a;
}

describe("executor (mocked PayPal)", () => {
	it("sends the action UUID as PayPal-Request-Id and records the debug id", async (ctx) => {
		if (!dbOk) ctx.skip();
		posts.length = 0;
		const a = await newAction("make_offer", {
			offerType: "REFUND",
			amountMinor: 1200,
			note: "Partial refund for the glaze colour.",
		});
		await mods.exec.executeAction(a.id);
		const after = await reload(a.id);
		expect(after.status).toBe("succeeded");
		expect(after.paypalDebugId).toBe("dbg-post");
		const call = posts.find((p) => p.url.endsWith("/make-offer"));
		expect(call?.headers["PayPal-Request-Id"]).toBe(a.paypalRequestId);
		expect(JSON.parse(call?.body ?? "{}")).toMatchObject({
			offer_type: "REFUND",
			offer_amount: { currency_code: "USD", value: "12.00" },
		});
	});

	it("refuses an action PayPal no longer allows (HATEOAS re-check)", async (ctx) => {
		if (!dbOk) ctx.skip();
		posts.length = 0;
		links = ["self", "send-message"];
		const a = await newAction("accept_claim", {
			note: "Refunded.",
			acceptClaimType: "REFUND",
		});
		await mods.exec.executeAction(a.id);
		const after = await reload(a.id);
		expect(after.status).toBe("failed");
		expect(after.error.name).toBe("NOT_ALLOWED");
		expect(posts.filter((p) => p.url.includes("/accept-claim"))).toHaveLength(
			0,
		);
		links = ["self", "make-offer", "accept-claim", "send-message"];
	});

	it("marks a PayPal 4xx as failed and never retries", async (ctx) => {
		if (!dbOk) ctx.skip();
		posts.length = 0;
		offerStatus = 422;
		const a = await newAction("make_offer", {
			offerType: "REFUND",
			amountMinor: 1000,
			note: "Offer.",
		});
		await mods.exec.executeAction(a.id);
		await mods.exec.executeAction(a.id); // a second run must not re-send
		const after = await reload(a.id);
		expect(after.status).toBe("failed");
		expect(after.error).toMatchObject({
			name: "UNPROCESSABLE_ENTITY",
			debugId: "dbg-err",
		});
		expect(posts.filter((p) => p.url.endsWith("/make-offer"))).toHaveLength(1);
		offerStatus = 200;
	});
});
