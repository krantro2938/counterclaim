import { z } from "zod";

const money = z.object({ currency_code: z.string(), value: z.string() });
const link = z.object({
	href: z.string(),
	rel: z.string(),
	method: z.string().optional(),
});

/** Lenient schema for GET /v1/customer/disputes/{id}. Unknown fields pass through. */
export const DisputeSchema = z
	.object({
		dispute_id: z.string(),
		create_time: z.string().optional(),
		update_time: z.string().optional(),
		reason: z.string().default("OTHER"),
		status: z.string(),
		dispute_state: z.string().optional(),
		dispute_life_cycle_stage: z.string().optional(),
		dispute_channel: z.string().optional(),
		dispute_amount: money.optional(),
		seller_response_due_date: z.string().optional(),
		buyer_response_due_date: z.string().optional(),
		dispute_outcome: z
			.object({
				outcome_code: z.string().optional(),
				amount_refunded: money.optional(),
			})
			.passthrough()
			.optional(),
		disputed_transactions: z
			.array(
				z
					.object({
						buyer_transaction_id: z.string().optional(),
						seller_transaction_id: z.string().optional(),
						reference_id: z.string().optional(),
						transaction_status: z.string().optional(),
						gross_amount: money.optional(),
						invoice_number: z.string().optional(),
						custom: z.string().optional(),
						buyer: z
							.object({
								name: z.string().optional(),
								email: z.string().optional(),
							})
							.passthrough()
							.optional(),
						seller: z
							.object({
								merchant_id: z.string().optional(),
								name: z.string().optional(),
							})
							.passthrough()
							.optional(),
					})
					.passthrough(),
			)
			.optional(),
		messages: z
			.array(
				z
					.object({
						posted_by: z.string().optional(),
						time_posted: z.string().optional(),
						content: z.string().optional(),
					})
					.passthrough(),
			)
			.optional(),
		offer: z.object({}).passthrough().optional(),
		evidences: z.array(z.object({}).passthrough()).optional(),
		links: z.array(link).default([]),
	})
	.passthrough();

export type PayPalDispute = z.infer<typeof DisputeSchema>;

export type PayPalAddress = {
	address_line_1?: string;
	address_line_2?: string;
	admin_area_2?: string;
	admin_area_1?: string;
	postal_code?: string;
	country_code?: string;
};

export type PayPalOrder = {
	id: string;
	status: string;
	create_time?: string;
	update_time?: string;
	payer?: {
		payer_id?: string;
		email_address?: string;
		name?: { given_name?: string; surname?: string };
	};
	payment_source?: {
		paypal?: {
			email_address?: string;
			account_id?: string;
			name?: { given_name?: string; surname?: string };
			address?: PayPalAddress;
		};
	};
	purchase_units?: {
		reference_id?: string;
		invoice_id?: string;
		amount?: { currency_code: string; value: string };
		shipping?: {
			name?: { full_name?: string };
			address?: PayPalAddress;
			trackers?: { id: string; status?: string; create_time?: string }[];
		};
		payments?: {
			captures?: {
				id: string;
				status: string;
				amount: { currency_code: string; value: string };
				create_time?: string;
				seller_protection?: { status?: string; dispute_categories?: string[] };
			}[];
		};
	}[];
	links?: { href: string; rel: string; method?: string }[];
};
