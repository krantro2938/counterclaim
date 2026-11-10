/**
 * LOCAL DEV ONLY: inserts synthetic disputes (ids prefixed DEV-) so the agent can be exercised
 * before real sandbox disputes exist. Never run against the deployed database.
 *   pnpm tsx --env-file=.env scripts/dev-fixture.ts [--assess] [--clean]
 */
import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { db, sql } from "../src/server/db/client";
import {
	carrierEvents,
	customerMessages,
	disputes,
	orders,
	shipments,
} from "../src/server/db/schema";

if (process.env.DATABASE_URL?.includes("@db:"))
	throw new Error("refusing to run against the production database");

const clean = process.argv.includes("--clean");
await db().delete(disputes).where(like(disputes.id, "DEV-%"));
await db().delete(orders).where(like(orders.paypalOrderId, "DEV-%"));
if (clean) {
	console.log("dev fixtures removed");
	await sql().end();
	process.exit(0);
}
const now = Date.now();
const h = (n: number) => new Date(now - n * 3_600_000);
const addr = {
	name: "Jordan Lee",
	line1: "1 Main St",
	city: "San Jose",
	state: "CA",
	postalCode: "95131",
	countryCode: "US",
};

async function mk(
	n: number,
	slug: string,
	title: string,
	amount: number,
	opts: {
		ship: boolean;
		deliver: boolean;
		uploadBefore: boolean;
		reason: string;
		story?: "glaze" | "delivered";
		links: string[];
	},
) {
	const id = randomUUID();
	await db()
		.insert(orders)
		.values({
			id,
			number: 9000 + n,
			paypalOrderId: `DEV-ORDER-${n}`,
			captureId: `DEV-CAP-${n}`,
			buyerName: "Jordan Lee",
			buyerEmail: "buyer@example.com",
			amountMinor: amount,
			currency: "USD",
			items: [{ slug, title, quantity: 1, unitMinor: amount }],
			shippingAddress: addr,
			paypalShippingAddress: addr,
			status: "captured",
			capturedAt: h(120),
			protectionStatus: "pending",
			origin: "seed",
		});
	if (opts.ship) {
		const sid = randomUUID();
		await db()
			.insert(shipments)
			.values({
				id: sid,
				orderId: id,
				carrier: "USPS",
				trackingNumber: `9400111899223${n}00000`,
				shippedAt: h(110),
				uploadedToPaypalAt: opts.uploadBefore ? h(109) : null,
				simulated: true,
			});
		const ev = [
			["label_created", "Shipping label created", 110],
			["in_transit", "Accepted at USPS origin facility", 100],
			["out_for_delivery", "Out for delivery", 50],
		] as const;
		for (const [code, description, ago] of ev)
			await db()
				.insert(carrierEvents)
				.values({
					shipmentId: sid,
					code,
					description,
					location: "San Jose, CA 95131",
					occurredAt: h(ago),
					simulated: true,
				});
		if (opts.deliver)
			await db()
				.insert(carrierEvents)
				.values({
					shipmentId: sid,
					code: "delivered",
					description: "Delivered, front door/porch",
					location: "San Jose, CA 95131",
					occurredAt: h(46),
					simulated: true,
				});
	}
	if (opts.story === "glaze") {
		await db()
			.insert(customerMessages)
			.values([
				{
					orderId: id,
					direction: "in",
					channel: "email",
					body: "Hello, the bowl arrived safely, thank you. The glaze is a lot greener than in the photo though. Is that normal?",
					sentAt: h(40),
				},
				{
					orderId: id,
					direction: "out",
					channel: "email",
					body: "Hi Jordan, each piece is hand-glazed so the colour shifts in the kiln, which is mentioned on the listing. Happy to help if you're unhappy with it.",
					sentAt: h(39),
				},
			]);
	}
	const did = `DEV-D-${n}`;
	await db()
		.insert(disputes)
		.values({
			id: did,
			orderId: id,
			reason: opts.reason,
			stage: "CHARGEBACK",
			status: "WAITING_FOR_SELLER_RESPONSE",
			amountMinor: amount,
			currency: "USD",
			sellerResponseDueAt: new Date(now + 3 * 86_400_000),
			links: [
				{ rel: "self", href: "x" },
				...opts.links.map((rel) => ({ rel, href: `x/${rel}` })),
			],
			raw: {
				dispute_id: did,
				messages: opts.reason.includes("DESCRIBED")
					? [
							{
								posted_by: "BUYER",
								time_posted: h(20).toISOString(),
								content:
									"The colour is very different from the photo. I expected a pale blue-grey.",
							},
						]
					: [
							{
								posted_by: "BUYER",
								time_posted: h(20).toISOString(),
								content: "I never received my package.",
							},
						],
			},
			createTime: h(20),
			buyerName: "Jordan Lee",
			sellerTransactionId: `DEV-CAP-${n}`,
		});
	return did;
}

const ids = [
	await mk(1, "speckled-stoneware-vase", "Speckled Stoneware Vase", 6400, {
		ship: true,
		deliver: true,
		uploadBefore: true,
		reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
		links: ["provide-evidence", "accept-claim"],
	}),
	await mk(2, "celadon-serving-bowl", "Celadon Serving Bowl", 4800, {
		ship: true,
		deliver: true,
		uploadBefore: true,
		reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
		story: "glaze",
		links: ["make-offer", "accept-claim", "provide-evidence", "send-message"],
	}),
	await mk(3, "linen-tea-towels", "Linen Tea Towels, Set of 2", 2200, {
		ship: false,
		deliver: false,
		uploadBefore: false,
		reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
		links: ["accept-claim", "provide-evidence"],
	}),
];
console.log("fixtures:", ids.join(", "));
if (process.argv.includes("--assess")) {
	const { runAssessment } = await import("../src/server/agent/assess");
	for (const id of ids) {
		const t = Date.now();
		try {
			const aid = await runAssessment(id);
			console.log(id, "assessment", aid, `${Date.now() - t} ms`);
		} catch (e) {
			console.error(id, "FAILED", e);
		}
	}
}
await sql().end();
