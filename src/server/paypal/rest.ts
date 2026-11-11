import { env } from "../env";
import { log } from "../log";
import { clearTokenCache, getAccessToken } from "./auth";
import type { PayPalDispute, PayPalOrder } from "./types";

export class PayPalError extends Error {
	status: number;
	debugId: string | null;
	details: unknown;
	path: string;
	constructor(opts: {
		status: number;
		name?: string;
		message?: string;
		details?: unknown;
		debugId: string | null;
		path: string;
	}) {
		super(opts.message ?? `PayPal request failed with ${opts.status}`);
		this.name = opts.name ?? "PAYPAL_ERROR";
		this.status = opts.status;
		this.debugId = opts.debugId;
		this.details = opts.details;
		this.path = opts.path;
	}
	toJSON() {
		return {
			name: this.name,
			message: this.message,
			status: this.status,
			debugId: this.debugId,
			details: this.details,
			path: this.path,
		};
	}
}

export type PayPalResponse<T> = {
	status: number;
	data: T;
	debugId: string | null;
};

type RequestOpts = {
	method: "GET" | "POST" | "PATCH" | "DELETE";
	path: string;
	query?: Record<string, string | number | undefined>;
	json?: unknown;
	form?: FormData;
	requestId?: string;
	prefer?: "return=representation" | "return=minimal";
};

/** Low-level PayPal REST call. Logs method, path, status and PayPal-Debug-Id. */
export async function paypalRequest<T = unknown>(
	opts: RequestOpts,
	retry401 = true,
): Promise<PayPalResponse<T>> {
	const token = await getAccessToken();
	const url = new URL(env().PAYPAL_API_BASE + opts.path);
	for (const [k, v] of Object.entries(opts.query ?? {}))
		if (v !== undefined) url.searchParams.set(k, String(v));
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		Accept: "application/json",
	};
	if (opts.json !== undefined) headers["Content-Type"] = "application/json";
	if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;
	if (opts.prefer) headers.Prefer = opts.prefer;
	const started = Date.now();
	const res = await fetch(url, {
		method: opts.method,
		headers,
		body:
			opts.form ??
			(opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
	});
	const debugId = res.headers.get("paypal-debug-id");
	const text = await res.text();
	let data: unknown;
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = text;
		}
	}
	log.info(
		{
			paypal: {
				method: opts.method,
				path: opts.path,
				status: res.status,
				debugId,
				ms: Date.now() - started,
			},
		},
		"paypal call",
	);
	if (res.status === 401 && retry401) {
		clearTokenCache();
		return paypalRequest<T>(opts, false);
	}
	if (!res.ok) {
		const d = (data ?? {}) as {
			name?: string;
			message?: string;
			details?: unknown;
			error?: string;
			error_description?: string;
		};
		throw new PayPalError({
			status: res.status,
			name: d.name ?? d.error,
			message:
				d.message ??
				d.error_description ??
				(typeof data === "string" ? data.slice(0, 300) : undefined),
			details: d.details,
			debugId,
			path: opts.path,
		});
	}
	return { status: res.status, data: data as T, debugId };
}

// ─── Orders (shop) ────────────────────────────────────────────────────────

export type CreateOrderInput = {
	referenceId: string;
	invoiceId?: string;
	currency: string;
	totalValue: string;
	items: { name: string; quantity: number; unitValue: string; sku?: string }[];
	description?: string;
	/** Same-tab checkout: PayPal sends the buyer back here (`?token=<order id>`). */
	returnUrl?: string;
	cancelUrl?: string;
};

export function createOrder(input: CreateOrderInput, requestId: string) {
	return paypalRequest<PayPalOrder>({
		method: "POST",
		path: "/v2/checkout/orders",
		requestId,
		prefer: "return=representation",
		json: {
			intent: "CAPTURE",
			purchase_units: [
				{
					reference_id: input.referenceId,
					custom_id: input.referenceId,
					invoice_id: input.invoiceId,
					description: input.description,
					amount: {
						currency_code: input.currency,
						value: input.totalValue,
						breakdown: {
							item_total: {
								currency_code: input.currency,
								value: input.totalValue,
							},
						},
					},
					items: input.items.map((i) => ({
						name: i.name,
						quantity: String(i.quantity),
						sku: i.sku,
						category: "PHYSICAL_GOODS",
						unit_amount: { currency_code: input.currency, value: i.unitValue },
					})),
				},
			],
			payment_source: {
				paypal: {
					experience_context: {
						shipping_preference: "GET_FROM_FILE",
						user_action: "PAY_NOW",
						brand_name: "Kiln & Thread",
						...(input.returnUrl && {
							return_url: input.returnUrl,
							cancel_url: input.cancelUrl ?? input.returnUrl,
						}),
					},
				},
			},
		},
	});
}

export function captureOrder(orderId: string, requestId: string) {
	return paypalRequest<PayPalOrder>({
		method: "POST",
		path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
		requestId,
		prefer: "return=representation",
		json: {},
	});
}

export function getOrder(orderId: string) {
	return paypalRequest<PayPalOrder>({
		method: "GET",
		path: `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
	});
}

/** Add tracking to an order (Orders v2 track). Falls back to legacy trackers-batch. */
export async function addTracking(
	input: {
		orderId: string;
		captureId: string;
		trackingNumber: string;
		carrier: string;
		notifyPayer: boolean;
	},
	requestId: string,
): Promise<PayPalResponse<unknown> & { endpoint: string }> {
	try {
		const r = await paypalRequest({
			method: "POST",
			path: `/v2/checkout/orders/${encodeURIComponent(input.orderId)}/track`,
			requestId,
			json: {
				capture_id: input.captureId,
				tracking_number: input.trackingNumber,
				carrier: input.carrier,
				notify_payer: input.notifyPayer,
			},
		});
		return { ...r, endpoint: "POST /v2/checkout/orders/{id}/track" };
	} catch (err) {
		if (
			!(err instanceof PayPalError) ||
			err.status >= 500 ||
			err.status === 401
		)
			throw err;
		log.warn(
			{ err: err.toJSON() },
			"orders/track failed, trying trackers-batch",
		);
		const r = await paypalRequest({
			method: "POST",
			path: "/v1/shipping/trackers-batch",
			requestId: `${requestId}-batch`.slice(0, 108),
			json: {
				trackers: [
					{
						transaction_id: input.captureId,
						tracking_number: input.trackingNumber,
						status: "SHIPPED",
						carrier: input.carrier,
						notify_buyer: input.notifyPayer,
					},
				],
			},
		});
		return { ...r, endpoint: "POST /v1/shipping/trackers-batch" };
	}
}

export function refundCapture(
	captureId: string,
	amount: { currency_code: string; value: string } | undefined,
	note: string,
	requestId: string,
) {
	return paypalRequest({
		method: "POST",
		path: `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
		requestId,
		json: { amount, note_to_payer: note.slice(0, 255) },
	});
}

// ─── Disputes ─────────────────────────────────────────────────────────────

type DisputeList = {
	items?: {
		dispute_id: string;
		update_time?: string;
		status?: string;
		reason?: string;
	}[];
	links?: { href: string; rel: string; method?: string }[];
};

/** List disputes updated after a timestamp, following `next` links. */
export async function listDisputes(
	opts: { updateTimeAfter?: string; maxPages?: number } = {},
) {
	const out: NonNullable<DisputeList["items"]> = [];
	let path = "/v1/customer/disputes";
	let query: Record<string, string | number | undefined> | undefined = {
		page_size: 50,
		update_time_after: opts.updateTimeAfter,
	};
	for (let page = 0; page < (opts.maxPages ?? 5); page++) {
		const r: PayPalResponse<DisputeList> = await paypalRequest<DisputeList>({
			method: "GET",
			path,
			query,
		});
		out.push(...(r.data.items ?? []));
		const next: { href: string } | undefined = r.data.links?.find(
			(l: { rel: string }) => l.rel === "next",
		);
		if (!next) break;
		const u: URL = new URL(next.href);
		path = u.pathname;
		query = Object.fromEntries(u.searchParams.entries());
	}
	return out;
}

export function getDispute(id: string) {
	return paypalRequest<PayPalDispute>({
		method: "GET",
		path: `/v1/customer/disputes/${encodeURIComponent(id)}`,
	});
}

const dpath = (id: string, action: string) =>
	`/v1/customer/disputes/${encodeURIComponent(id)}/${action}`;

export function sendMessage(id: string, message: string, requestId: string) {
	return paypalRequest({
		method: "POST",
		path: dpath(id, "send-message"),
		requestId,
		json: { message },
	});
}

export function makeOffer(
	id: string,
	body: {
		note: string;
		offer_type: string;
		offer_amount?: { currency_code: string; value: string };
	},
	requestId: string,
) {
	return paypalRequest({
		method: "POST",
		path: dpath(id, "make-offer"),
		requestId,
		json: body,
	});
}

export function acceptClaim(
	id: string,
	body: {
		note: string;
		accept_claim_type?: string;
		refund_amount?: { currency_code: string; value: string };
	},
	requestId: string,
) {
	return paypalRequest({
		method: "POST",
		path: dpath(id, "accept-claim"),
		requestId,
		json: body,
	});
}

export function escalate(id: string, note: string, requestId: string) {
	return paypalRequest({
		method: "POST",
		path: dpath(id, "escalate"),
		requestId,
		json: { note },
	});
}

export type EvidenceInput = {
	evidenceType: "PROOF_OF_FULFILLMENT" | "PROOF_OF_REFUND" | "OTHER";
	trackingInfo?: { carrier_name: string; tracking_number: string }[];
	refundIds?: string[];
	notes: string;
	file?: { name: string; bytes: Uint8Array; contentType: string };
};

/** provide-evidence: multipart with an `input` JSON part and an `evidence-file` file part. */
export function provideEvidence(
	id: string,
	ev: EvidenceInput,
	requestId: string,
	filePart = "evidence-file",
) {
	const input = {
		evidences: [
			{
				evidence_type: ev.evidenceType,
				evidence_info: {
					...(ev.trackingInfo?.length
						? { tracking_info: ev.trackingInfo }
						: {}),
					...(ev.refundIds?.length ? { refund_ids: ev.refundIds } : {}),
				},
				notes: ev.notes.slice(0, 2000),
				...(ev.file ? { documents: [{ name: ev.file.name }] } : {}),
			},
		],
	};
	const form = new FormData();
	form.append(
		"input",
		new Blob([JSON.stringify(input)], { type: "application/json" }),
	);
	if (ev.file) {
		form.append(
			filePart,
			new Blob([new Uint8Array(ev.file.bytes)], { type: ev.file.contentType }),
			ev.file.name,
		);
	}
	return paypalRequest({
		method: "POST",
		path: dpath(id, "provide-evidence"),
		requestId,
		form,
	});
}

/** Sandbox only. */
export function requireEvidence(
	id: string,
	action: "SELLER_EVIDENCE" | "BUYER_EVIDENCE",
	requestId: string,
) {
	return paypalRequest({
		method: "POST",
		path: dpath(id, "require-evidence"),
		requestId,
		json: { action },
	});
}

/** Sandbox only. */
export function adjudicate(
	id: string,
	outcome: "SELLER_FAVOR" | "BUYER_FAVOR",
	requestId: string,
) {
	return paypalRequest({
		method: "POST",
		path: dpath(id, "adjudicate"),
		requestId,
		json: { adjudication_outcome: outcome },
	});
}

// ─── Webhooks ─────────────────────────────────────────────────────────────

export function verifyWebhookSignature(body: {
	auth_algo: string;
	cert_url: string;
	transmission_id: string;
	transmission_sig: string;
	transmission_time: string;
	webhook_id: string;
	webhook_event: unknown;
}) {
	return paypalRequest<{ verification_status: "SUCCESS" | "FAILURE" | string }>(
		{
			method: "POST",
			path: "/v1/notifications/verify-webhook-signature",
			json: body,
		},
	);
}

export function listWebhooks() {
	return paypalRequest<{
		webhooks: { id: string; url: string; event_types: { name: string }[] }[];
	}>({
		method: "GET",
		path: "/v1/notifications/webhooks",
	});
}

export function createWebhook(url: string, eventTypes: string[]) {
	return paypalRequest<{ id: string; url: string }>({
		method: "POST",
		path: "/v1/notifications/webhooks",
		json: { url, event_types: eventTypes.map((name) => ({ name })) },
	});
}
