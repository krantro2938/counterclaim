import { asc, desc, sql as dsql, eq } from "drizzle-orm";
import { normRel, REL_TO_ACTION, reasonLabel, stageLabel } from "#/lib/labels";
import { formatMoney } from "#/lib/money";
import { db } from "../db/client";
import {
	type Address,
	carrierEvents,
	customerMessages,
	disputes,
	orders,
	products,
	shipments,
	storePolicies,
} from "../db/schema";
import { addressesMatch } from "../protection";

/** Deterministic case file (SPEC §7.1). No LLM involved. Facts are the only citable evidence. */

export type FactSource = "paypal" | "carrier_sim" | "store" | "messages";
export type Fact = {
	id: string;
	text: string;
	source: FactSource;
	strength: "strong" | "medium" | "weak";
	/** machine-readable tag the rubric keys off */
	tag: string;
	simulated?: boolean;
};

type DisputeRow = typeof disputes.$inferSelect;
type OrderRow = typeof orders.$inferSelect;
type ShipmentRow = typeof shipments.$inferSelect;
type CarrierEventRow = typeof carrierEvents.$inferSelect;
type MessageRow = typeof customerMessages.$inferSelect;
type PolicyRow = typeof storePolicies.$inferSelect;
type ProductRow = typeof products.$inferSelect;

export type DisputeMessage = {
	postedBy: string;
	at: string | null;
	content: string;
};

export type CaseFile = {
	disputeId: string;
	dispute: {
		reason: string;
		reasonLabel: string;
		stage: string | null;
		status: string;
		amountMinor: number;
		currency: string;
		dueAt: string | null;
		createdAt: string | null;
		buyerName: string | null;
		messages: DisputeMessage[];
		offer: unknown;
		evidencesRequested: unknown;
	};
	/** derived from links[].rel — THE action space */
	allowedActions: string[];
	allowedRels: string[];
	order:
		| (Pick<
				OrderRow,
				| "id"
				| "number"
				| "paypalOrderId"
				| "captureId"
				| "amountMinor"
				| "currency"
				| "items"
				| "buyerName"
				| "buyerEmail"
		  > & {
				capturedAt: string | null;
				shippingAddress: Address | null;
				paypalShippingAddress: Address | null;
		  })
		| null;
	paypalShippingMatchesOrder: boolean;
	shipment: {
		carrier: string;
		trackingNumber: string;
		shippedAt: string;
		uploadedToPaypalAt: string | null;
		simulated: boolean;
	} | null;
	carrierEvents: {
		code: string;
		description: string;
		location: string | null;
		at: string;
		simulated: boolean;
	}[];
	messages: { direction: string; channel: string; body: string; at: string }[];
	storePolicy: { section: string; title: string; body: string }[];
	listingSnapshot: {
		title: string;
		description: string;
		disclaimer: string | null;
		imageUrl: string;
	} | null;
	facts: Fact[];
	/** keyword signals used by the rubric (SNAD complaint category) */
	signals: {
		complaintMentionsColour: boolean;
		buyerContactedFirst: boolean;
		merchantOfferedHelp: boolean;
	};
};

function fmtDate(d: Date | string | null | undefined): string {
	if (!d) return "unknown date";
	const x = new Date(d);
	return `${x.toISOString().slice(0, 10)} ${x.toISOString().slice(11, 16)} UTC`;
}

function addrShort(a?: Address | null): string {
	if (!a) return "unknown address";
	return [
		a.city,
		[a.state, a.postalCode].filter(Boolean).join(" "),
		a.countryCode,
	]
		.filter(Boolean)
		.join(", ");
}

const COLOUR_WORDS =
	/\b(colou?r|glaze|shade|green|greener|paler|darker|lighter|tone|hue|different from (the )?photo|not like the (photo|picture))\b/i;
const HELP_WORDS = /\b(refund|return|exchange|replace|help|partial)\b/i;

export function extractDisputeMessages(
	raw: Record<string, unknown>,
): DisputeMessage[] {
	const msgs =
		(raw.messages as
			| { posted_by?: string; time_posted?: string; content?: string }[]
			| undefined) ?? [];
	return msgs
		.filter((m) => m.content)
		.map((m) => ({
			postedBy: m.posted_by ?? "UNKNOWN",
			at: m.time_posted ?? null,
			content: m.content as string,
		}));
}

/** Pure part: given loaded rows, build the case file. Unit-tested. */
export function assembleCaseFile(input: {
	dispute: DisputeRow;
	order: OrderRow | null;
	shipment: ShipmentRow | null;
	events: CarrierEventRow[];
	messages: MessageRow[];
	policies: PolicyRow[];
	product: ProductRow | null;
}): CaseFile {
	const {
		dispute: d,
		order: o,
		shipment: s,
		events,
		messages,
		policies,
		product,
	} = input;
	const raw = (d.raw ?? {}) as Record<string, unknown>;
	const rels = (d.links ?? []).map((l) => normRel(l.rel));
	const allowedActions = [
		...new Set(rels.map((r) => REL_TO_ACTION[r]).filter(Boolean)),
	] as string[];
	const dMessages = extractDisputeMessages(raw);
	const facts: Fact[] = [];
	const add = (f: Omit<Fact, "id">) =>
		facts.push({ id: `F${facts.length + 1}`, ...f });
	const amount = formatMoney(d.amountMinor, d.currency);
	const disputeOpenedAt = d.createTime ?? d.firstSeenAt;

	// ── PayPal: the dispute itself
	add({
		source: "paypal",
		strength: "medium",
		tag: "dispute_opened",
		text: `Buyer opened a "${reasonLabel(d.reason)}" dispute for ${amount} on ${fmtDate(disputeOpenedAt)} (stage: ${stageLabel(d.stage)}, status: ${d.status}).`,
	});
	if (d.sellerResponseDueAt) {
		add({
			source: "paypal",
			strength: "weak",
			tag: "deadline",
			text: `PayPal requires a seller response by ${fmtDate(d.sellerResponseDueAt)}.`,
		});
	}
	for (const m of dMessages.slice(-4)) {
		add({
			source: "paypal",
			strength: "medium",
			tag: m.postedBy === "BUYER" ? "buyer_dispute_message" : "dispute_message",
			text: `${m.postedBy === "BUYER" ? "Buyer" : m.postedBy === "SELLER" ? "Seller" : "PayPal"} wrote in the dispute${m.at ? ` on ${fmtDate(m.at)}` : ""}: "${m.content.slice(0, 280)}"`,
		});
	}

	// ── PayPal: order + capture
	const addrMatch = o
		? addressesMatch(o.shippingAddress, o.paypalShippingAddress)
		: true;
	if (o) {
		const items = o.items.map((i) => `${i.quantity} × ${i.title}`).join(", ");
		add({
			source: "paypal",
			strength: "medium",
			tag: "order_paid",
			text: `Order #${o.number} (${items}) was paid via PayPal on ${fmtDate(o.capturedAt)}: capture ${o.captureId ?? "—"}, ${formatMoney(o.amountMinor, o.currency)}.`,
		});
		if (o.paypalShippingAddress) {
			add({
				source: "paypal",
				strength: addrMatch ? "strong" : "medium",
				tag: addrMatch ? "address_match" : "address_mismatch",
				text: addrMatch
					? s
						? `The order shipped to the PayPal-confirmed address (${addrShort(o.paypalShippingAddress)}).`
						: `The order's ship-to address is the PayPal-confirmed address (${addrShort(o.paypalShippingAddress)}).`
					: `The ship-to address (${addrShort(o.shippingAddress)}) differs from the PayPal address (${addrShort(o.paypalShippingAddress)}).`,
			});
		}
	} else {
		add({
			source: "store",
			strength: "weak",
			tag: "no_order",
			text: "No matching order was found in the store for this PayPal transaction.",
		});
	}

	// ── Shipment + tracking
	if (s) {
		add({
			source: "carrier_sim",
			strength: "strong",
			tag: "tracking_exists",
			simulated: s.simulated,
			text: `Shipped ${fmtDate(s.shippedAt)} via ${s.carrier}, tracking number ${s.trackingNumber}${s.simulated ? " (simulated)" : ""}.`,
		});
		if (s.uploadedToPaypalAt) {
			const before =
				!disputeOpenedAt || s.uploadedToPaypalAt <= disputeOpenedAt;
			add({
				source: "paypal",
				strength: before ? "strong" : "medium",
				tag: before ? "tracking_uploaded_before" : "tracking_uploaded_after",
				text: `Tracking was uploaded to PayPal on ${fmtDate(s.uploadedToPaypalAt)}, ${before ? "before" : "after"} the dispute was opened.`,
			});
		} else {
			add({
				source: "store",
				strength: "medium",
				tag: "tracking_not_uploaded",
				text: "The tracking number was never uploaded to PayPal.",
			});
		}
	} else if (o) {
		add({
			source: "store",
			strength: "strong",
			tag: "no_tracking",
			text: `No shipment or tracking number is recorded for order #${o.number}.`,
		});
	}
	const delivered = events.find((e) => e.code === "delivered");
	const lastEvent = events.at(-1);
	if (delivered) {
		add({
			source: "carrier_sim",
			strength: "strong",
			tag: "delivered",
			simulated: delivered.simulated,
			text: `Carrier scan: delivered ${fmtDate(delivered.occurredAt)} to ${delivered.location ?? "the destination"}${delivered.simulated ? " (simulated)" : ""}.`,
		});
	} else if (lastEvent) {
		add({
			source: "carrier_sim",
			strength: "medium",
			tag: "in_transit",
			simulated: lastEvent.simulated,
			text: `Latest carrier scan: "${lastEvent.description}" at ${lastEvent.location ?? "—"} on ${fmtDate(lastEvent.occurredAt)}${lastEvent.simulated ? " (simulated)" : ""}. Not delivered yet.`,
		});
	}

	// ── Store: listing + policies
	const variation = policies.find((p) => p.section === "handmade_variation");
	if (product?.disclaimer) {
		add({
			source: "store",
			strength: "strong",
			tag: "listing_disclaimer",
			text: `The product listing for "${product.title}" states: "${product.disclaimer}"`,
		});
		add({
			source: "store",
			strength: "medium",
			tag: "listing_photos",
			text: `The listing showed product photos at the time of purchase (${product.imageUrl}).`,
		});
	}
	if (variation)
		add({
			source: "store",
			strength: "medium",
			tag: "policy_variation",
			text: `Store policy "${variation.title}": ${variation.body.slice(0, 300)}`,
		});
	const returns = policies.find((p) => p.section === "returns");
	if (returns)
		add({
			source: "store",
			strength: "medium",
			tag: "policy_returns",
			text: `Store policy "${returns.title}": ${returns.body.slice(0, 300)}`,
		});
	const shipping = policies.find((p) => p.section === "shipping");
	if (shipping)
		add({
			source: "store",
			strength: "weak",
			tag: "policy_shipping",
			text: `Store policy "${shipping.title}": ${shipping.body.slice(0, 240)}`,
		});

	// ── Support inbox messages
	const sorted = [...messages].sort(
		(a, b) => a.sentAt.getTime() - b.sentAt.getTime(),
	);
	for (const m of sorted.slice(-6)) {
		add({
			source: "messages",
			strength: "medium",
			tag: m.direction === "in" ? "buyer_message" : "merchant_message",
			text: `${m.direction === "in" ? "Buyer" : "Merchant"} emailed on ${fmtDate(m.sentAt)}: "${m.body.slice(0, 280)}"`,
		});
	}
	if (o && !sorted.some((m) => m.direction === "in")) {
		add({
			source: "messages",
			strength: "medium",
			tag: "no_buyer_contact",
			text: "The buyer did not contact the store before opening the dispute.",
		});
	}

	const buyerText = [
		...dMessages.filter((m) => m.postedBy === "BUYER").map((m) => m.content),
		...sorted.filter((m) => m.direction === "in").map((m) => m.body),
	].join(" ");
	const firstBuyerMsg = sorted.find((m) => m.direction === "in");
	return {
		disputeId: d.id,
		dispute: {
			reason: d.reason,
			reasonLabel: reasonLabel(d.reason),
			stage: d.stage,
			status: d.status,
			amountMinor: d.amountMinor,
			currency: d.currency,
			dueAt: d.sellerResponseDueAt?.toISOString() ?? null,
			createdAt: disputeOpenedAt?.toISOString() ?? null,
			buyerName: d.buyerName ?? o?.buyerName ?? null,
			messages: dMessages,
			offer: raw.offer ?? null,
			evidencesRequested: raw.evidences ?? null,
		},
		allowedActions,
		allowedRels: rels,
		order: o
			? {
					id: o.id,
					number: o.number,
					paypalOrderId: o.paypalOrderId,
					captureId: o.captureId,
					amountMinor: o.amountMinor,
					currency: o.currency,
					items: o.items,
					buyerName: o.buyerName,
					buyerEmail: o.buyerEmail,
					capturedAt: o.capturedAt?.toISOString() ?? null,
					shippingAddress: o.shippingAddress ?? null,
					paypalShippingAddress: o.paypalShippingAddress ?? null,
				}
			: null,
		paypalShippingMatchesOrder: addrMatch,
		shipment: s
			? {
					carrier: s.carrier,
					trackingNumber: s.trackingNumber,
					shippedAt: s.shippedAt.toISOString(),
					uploadedToPaypalAt: s.uploadedToPaypalAt?.toISOString() ?? null,
					simulated: s.simulated,
				}
			: null,
		carrierEvents: events.map((e) => ({
			code: e.code,
			description: e.description,
			location: e.location,
			at: e.occurredAt.toISOString(),
			simulated: e.simulated,
		})),
		messages: sorted.map((m) => ({
			direction: m.direction,
			channel: m.channel,
			body: m.body,
			at: m.sentAt.toISOString(),
		})),
		storePolicy: policies.map((p) => ({
			section: p.section,
			title: p.title,
			body: p.body,
		})),
		listingSnapshot: product
			? {
					title: product.title,
					description: product.description,
					disclaimer: product.disclaimer,
					imageUrl: product.imageUrl,
				}
			: null,
		facts,
		signals: {
			complaintMentionsColour: COLOUR_WORDS.test(buyerText),
			buyerContactedFirst: Boolean(
				firstBuyerMsg &&
					(!disputeOpenedAt || firstBuyerMsg.sentAt <= disputeOpenedAt),
			),
			merchantOfferedHelp: sorted.some(
				(m) => m.direction === "out" && HELP_WORDS.test(m.body),
			),
		},
	};
}

export async function buildCaseFile(disputeId: string): Promise<CaseFile> {
	const [d] = await db()
		.select()
		.from(disputes)
		.where(eq(disputes.id, disputeId))
		.limit(1);
	if (!d) throw new Error(`Dispute ${disputeId} not found`);
	const [o] = d.orderId
		? await db().select().from(orders).where(eq(orders.id, d.orderId)).limit(1)
		: [];
	const [s] = o
		? await db()
				.select()
				.from(shipments)
				.where(eq(shipments.orderId, o.id))
				.orderBy(desc(shipments.shippedAt))
				.limit(1)
		: [];
	const events = s
		? await db()
				.select()
				.from(carrierEvents)
				.where(eq(carrierEvents.shipmentId, s.id))
				.orderBy(asc(carrierEvents.occurredAt))
		: [];
	const messages = o
		? await db()
				.select()
				.from(customerMessages)
				.where(
					dsql`${customerMessages.orderId} = ${o.id} and ${customerMessages.channel} = 'email'`,
				)
		: [];
	const policies = await db()
		.select()
		.from(storePolicies)
		.orderBy(asc(storePolicies.id));
	const slug = o?.items[0]?.slug;
	const [product] = slug
		? await db().select().from(products).where(eq(products.slug, slug)).limit(1)
		: [];
	return assembleCaseFile({
		dispute: d,
		order: o ?? null,
		shipment: s ?? null,
		events,
		messages,
		policies,
		product: product ?? null,
	});
}
