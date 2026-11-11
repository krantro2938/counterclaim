import { randomUUID } from "node:crypto";
import { asc, desc, sql as dsql, eq } from "drizzle-orm";
import { toDecimalString, toMinor } from "#/lib/money";
import { CARRIERS, simulatedTrackingNumber } from "./carrier";
import { db } from "./db/client";
import { type Address, orders, products, shipments } from "./db/schema";
import { env } from "./env";
import { publish } from "./events/bus";
import { recordActivity } from "./kv";
import { log } from "./log";
import {
	addTracking,
	captureOrder,
	createOrder,
	getOrder,
} from "./paypal/rest";
import { actionToolkit, runToolkitTool } from "./paypal/toolkit";
import type { PayPalAddress, PayPalOrder } from "./paypal/types";
import { refreshProtection } from "./protection";

export async function listProducts() {
	return db().select().from(products).orderBy(asc(products.sortOrder));
}

async function nextOrderNumber(): Promise<number> {
	const [row] = await db()
		.select({ n: dsql<number>`coalesce(max(${orders.number}), 1040) + 1` })
		.from(orders);
	return Number(row.n);
}

export function fromPayPalAddress(
	a?: PayPalAddress,
	name?: string,
): Address | undefined {
	if (!a) return undefined;
	return {
		name,
		line1: a.address_line_1,
		line2: a.address_line_2,
		city: a.admin_area_2,
		state: a.admin_area_1,
		postalCode: a.postal_code,
		countryCode: a.country_code,
	};
}

/** Create our order row + a PayPal order (intent CAPTURE). */
export async function createShopOrder(input: {
	slug: string;
	quantity: number;
	/** true → same-tab checkout via PayPal's approval page (no popup). */
	redirect?: boolean;
}) {
	const [product] = await db()
		.select()
		.from(products)
		.where(eq(products.slug, input.slug))
		.limit(1);
	if (!product)
		throw Object.assign(new Error("Unknown product"), { status: 404 });
	const qty = Math.min(Math.max(1, Math.trunc(input.quantity)), 5);
	const totalMinor = product.priceMinor * qty;
	const number = await nextOrderNumber();
	const id = randomUUID();
	await db()
		.insert(orders)
		.values({
			id,
			number,
			amountMinor: totalMinor,
			currency: product.currency,
			items: [
				{
					productId: product.id,
					slug: product.slug,
					title: product.title,
					quantity: qty,
					unitMinor: product.priceMinor,
				},
			],
			status: "created",
			origin: "paypal",
		});
	const res = await createOrder(
		{
			referenceId: id,
			invoiceId: `KT-${number}-${id.slice(0, 6)}`,
			currency: product.currency,
			totalValue: toDecimalString(totalMinor, product.currency),
			description: `Kiln & Thread order #${number}`,
			...(input.redirect && {
				returnUrl: `${env().PUBLIC_BASE_URL}/shop/checkout/return`,
				cancelUrl: `${env().PUBLIC_BASE_URL}/shop/p/${product.slug}`,
			}),
			items: [
				{
					name: product.title,
					quantity: qty,
					unitValue: toDecimalString(product.priceMinor, product.currency),
					sku: product.slug,
				},
			],
		},
		id,
	);
	await db()
		.update(orders)
		.set({ paypalOrderId: res.data.id, raw: res.data })
		.where(eq(orders.id, id));
	const approveUrl = res.data.links?.find(
		(l) => l.rel === "payer-action" || l.rel === "approve",
	)?.href;
	return {
		paypalOrderId: res.data.id,
		orderNumber: number,
		debugId: res.debugId,
		approveUrl,
	};
}

function applyCapture(o: PayPalOrder) {
	const pu = o.purchase_units?.[0];
	const capture = pu?.payments?.captures?.[0];
	const payerName =
		[o.payer?.name?.given_name, o.payer?.name?.surname]
			.filter(Boolean)
			.join(" ") || undefined;
	const shipName = pu?.shipping?.name?.full_name ?? payerName;
	const ppAddr = fromPayPalAddress(pu?.shipping?.address, shipName);
	return {
		captureId: capture?.id,
		captureStatus: capture?.status,
		payerId: o.payer?.payer_id,
		buyerEmail:
			o.payer?.email_address ?? o.payment_source?.paypal?.email_address,
		buyerName: payerName ?? shipName,
		paypalShippingAddress: ppAddr,
		capturedAt: capture?.create_time
			? new Date(capture.create_time)
			: new Date(),
	};
}

/** Capture an approved PayPal order and record the payment. Idempotent per PayPal order. */
export async function captureShopOrder(paypalOrderId: string) {
	const [order] = await db()
		.select()
		.from(orders)
		.where(eq(orders.paypalOrderId, paypalOrderId))
		.limit(1);
	if (!order) throw Object.assign(new Error("Unknown order"), { status: 404 });
	if (order.status === "captured")
		return { orderNumber: order.number, alreadyCaptured: true };
	let data: PayPalOrder;
	let debugId: string | null = null;
	try {
		const res = await captureOrder(paypalOrderId, `${order.id}-capture`);
		data = res.data;
		debugId = res.debugId;
	} catch (err) {
		// Already captured (e.g. a retry) → read the order instead.
		log.warn({ err }, "capture failed, reading order");
		const res = await getOrder(paypalOrderId);
		data = res.data;
		if (data.status !== "COMPLETED") throw err;
	}
	const c = applyCapture(data);
	await db()
		.update(orders)
		.set({
			status:
				c.captureStatus === "COMPLETED" || data.status === "COMPLETED"
					? "captured"
					: (c.captureStatus ?? data.status).toLowerCase(),
			captureId: c.captureId,
			payerId: c.payerId,
			buyerEmail: c.buyerEmail,
			buyerName: c.buyerName,
			paypalShippingAddress: c.paypalShippingAddress,
			// the shop ships to the PayPal-confirmed address (shipping_preference GET_FROM_FILE)
			shippingAddress: c.paypalShippingAddress,
			capturedAt: c.capturedAt,
			raw: data,
		})
		.where(eq(orders.id, order.id));
	await recordActivity({
		actor: "buyer",
		kind: "order_captured",
		text: `Order #${order.number} paid via PayPal by ${c.buyerName ?? "a buyer"}`,
		orderId: order.id,
		meta: { captureId: c.captureId, debugId },
	});
	await refreshProtection([order.id]);
	await publish({
		type: "order.updated",
		orderId: order.id,
		number: order.number,
	});
	await publish({ type: "kpi.updated" });
	return { orderNumber: order.number, debugId };
}

/**
 * Import a paid PayPal order that another deployment of this shop created (e.g. a checkout run on
 * a dev server). Reads the order from PayPal and keeps our id (custom_id) and number (invoice_id),
 * so dispute matching works the same as for orders captured here.
 */
export async function importPayPalOrder(paypalOrderId: string) {
	const [existing] = await db()
		.select()
		.from(orders)
		.where(eq(orders.paypalOrderId, paypalOrderId))
		.limit(1);
	if (existing?.status === "captured")
		return { orderNumber: existing.number, imported: false };
	const { data, debugId } = await getOrder(paypalOrderId);
	if (data.status !== "COMPLETED")
		throw Object.assign(new Error(`PayPal order is ${data.status}`), {
			status: 409,
		});
	const pu = data.purchase_units?.[0];
	const amount = pu?.payments?.captures?.[0]?.amount ?? pu?.amount;
	if (!pu || !amount)
		throw Object.assign(new Error("PayPal order has no purchase unit"), {
			status: 422,
		});
	const known = await db().select().from(products);
	const items = (pu.items ?? []).map((i) => {
		const product = known.find((k) => k.slug === i.sku);
		return {
			productId: product?.id,
			slug: i.sku ?? "",
			title: i.name,
			quantity: Number(i.quantity) || 1,
			unitMinor: i.unit_amount
				? toMinor(i.unit_amount.value, i.unit_amount.currency_code)
				: 0,
		};
	});
	const uuidRe =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
	const ref = pu.custom_id ?? pu.reference_id;
	const id = existing?.id ?? (ref && uuidRe.test(ref) ? ref : randomUUID());
	const invoiceNumber = Number(/^KT-(\d+)-/.exec(pu.invoice_id ?? "")?.[1]);
	let number = existing?.number;
	if (!number) {
		const [taken] = Number.isFinite(invoiceNumber)
			? await db()
					.select({ id: orders.id })
					.from(orders)
					.where(eq(orders.number, invoiceNumber))
					.limit(1)
			: [undefined];
		number =
			Number.isFinite(invoiceNumber) && !taken
				? invoiceNumber
				: await nextOrderNumber();
	}
	const c = applyCapture(data);
	const row = {
		id,
		number,
		paypalOrderId,
		amountMinor: toMinor(amount.value, amount.currency_code),
		currency: amount.currency_code,
		items,
		status: "captured",
		origin: "paypal",
		captureId: c.captureId,
		payerId: c.payerId,
		buyerEmail: c.buyerEmail,
		buyerName: c.buyerName,
		paypalShippingAddress: c.paypalShippingAddress,
		shippingAddress: c.paypalShippingAddress,
		capturedAt: c.capturedAt,
		raw: data,
	};
	if (existing) await db().update(orders).set(row).where(eq(orders.id, id));
	else await db().insert(orders).values(row);
	await recordActivity({
		actor: "buyer",
		kind: "order_captured",
		text: `Order #${number} paid via PayPal by ${c.buyerName ?? "a buyer"}`,
		orderId: id,
		meta: { captureId: c.captureId, debugId, imported: true },
	});
	await refreshProtection([id]);
	await publish({ type: "order.updated", orderId: id, number });
	await publish({ type: "kpi.updated" });
	return { orderNumber: number, imported: true };
}

/**
 * "Mark shipped": CarrierSim generates a (simulated) tracking number, then we push it to PayPal
 * with the Agent Toolkit's create_shipment_tracking (programmatic, never the LLM). Falls back to
 * our REST client (Orders v2 /track) if the toolkit call fails.
 */
export async function shipOrder(
	orderId: string,
	opts: { carrier?: string; notifyPayer?: boolean } = {},
) {
	const [order] = await db()
		.select()
		.from(orders)
		.where(eq(orders.id, orderId))
		.limit(1);
	if (!order)
		throw Object.assign(new Error("Order not found"), { status: 404 });
	if (!order.captureId || !order.paypalOrderId)
		throw Object.assign(new Error("Order has no PayPal capture"), {
			status: 409,
		});
	const carrier = CARRIERS.includes(opts.carrier as (typeof CARRIERS)[number])
		? (opts.carrier as string)
		: "USPS";
	const [existing] = await db()
		.select()
		.from(shipments)
		.where(eq(shipments.orderId, orderId))
		.orderBy(desc(shipments.shippedAt))
		.limit(1);
	const trackingNumber =
		existing?.trackingNumber ?? simulatedTrackingNumber(carrier);
	const shipmentId = existing?.id ?? randomUUID();
	if (!existing) {
		await db().insert(shipments).values({
			id: shipmentId,
			orderId,
			carrier,
			trackingNumber,
			simulated: true,
		});
	}
	const requestId = `${shipmentId}`;
	let via = "toolkit:create_shipment_tracking";
	let response: unknown;
	let debugId: string | null = null;
	const tk = await runToolkitTool(
		actionToolkit(requestId),
		"create_shipment_tracking",
		{
			transaction_id: order.captureId,
			order_id: order.paypalOrderId,
			tracking_number: trackingNumber,
			carrier,
			status: "SHIPPED",
		},
	);
	if (tk.ok && !hasBatchErrors(tk.data)) {
		response = tk.data;
	} else {
		log.warn(
			{ toolkit: tk.data },
			"toolkit create_shipment_tracking failed; using REST /track",
		);
		const r = await addTracking(
			{
				orderId: order.paypalOrderId,
				captureId: order.captureId,
				trackingNumber,
				carrier,
				notifyPayer: Boolean(opts.notifyPayer),
			},
			requestId,
		);
		via = `rest:${r.endpoint}`;
		response = { toolkitError: tk.data, rest: r.data };
		debugId = r.debugId;
	}
	await db()
		.update(shipments)
		.set({
			uploadedToPaypalAt: new Date(),
			paypalResponse: { via, response, debugId },
		})
		.where(eq(shipments.id, shipmentId));
	await recordActivity({
		actor: "merchant",
		kind: "tracking_uploaded",
		text: `Tracking ${trackingNumber} (${carrier}, simulated) uploaded to PayPal for order #${order.number}`,
		orderId,
		meta: { via, debugId },
	});
	await refreshProtection([orderId]);
	return { shipmentId, trackingNumber, carrier, via, debugId };
}

function hasBatchErrors(data: unknown): boolean {
	const d = data as { errors?: unknown[] } | null;
	return Boolean(d && Array.isArray(d.errors) && d.errors.length > 0);
}
