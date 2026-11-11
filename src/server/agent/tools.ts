import { tool } from "ai";
import { z } from "zod";
import { formatMoney } from "#/lib/money";
import type { CaseFile } from "../casefile";
import type { FeeConstants } from "../db/schema";
import { paypalConfigured } from "../env";
import { readToolkit, runToolkitTool } from "../paypal/toolkit";
import { AssessmentSchema } from "./schema";

/** Trace recorder: every tool call + (truncated) result goes to agent_steps. */
export type Recorder = (
	kind: "tool_call" | "tool_result" | "model" | "validation" | "info",
	payload: Record<string, unknown>,
) => void;

const MAX_RESULT_CHARS = 3500;
export function truncate(v: unknown, n = MAX_RESULT_CHARS): string {
	const s = typeof v === "string" ? v : JSON.stringify(v);
	return s.length > n
		? `${s.slice(0, n)}… [truncated ${s.length - n} chars]`
		: s;
}

/** Names of the PayPal Agent Toolkit tools exposed (read-only). */
// get_shipment_tracking is not given to the model: this app has no shipping/trackers scope (403),
// and get_order already returns the v2 trackers.
export const PAYPAL_READ_TOOLS = [
	"get_dispute",
	"get_order",
	"list_transactions",
] as const;

export function buildAgentTools(
	cf: CaseFile,
	fees: FeeConstants,
	record: Recorder,
	calledPayPal: Map<string, unknown>,
) {
	const wrap = <I, O>(
		name: string,
		source: "case_file" | "paypal_agent_toolkit",
		fn: (input: I) => Promise<O> | O,
	) => {
		return async (input: I) => {
			record("tool_call", { tool: name, source, input });
			const started = Date.now();
			try {
				const out = await fn(input);
				record("tool_result", {
					tool: name,
					source,
					ok: true,
					ms: Date.now() - started,
					result: truncate(out, 1500),
				});
				return typeof out === "string"
					? truncate(out)
					: JSON.parse(truncate(out, 1_000_000));
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				record("tool_result", {
					tool: name,
					source,
					ok: false,
					ms: Date.now() - started,
					error: message,
				});
				return { error: message };
			}
		};
	};

	const paypal = async (
		name: (typeof PAYPAL_READ_TOOLS)[number],
		args: Record<string, unknown>,
	) => {
		if (!paypalConfigured()) throw new Error("PayPal sandbox not configured");
		const r = await runToolkitTool(readToolkit(), name, args);
		// A failed read must not become citable "PP:" evidence or look like a successful call in the trace.
		if (!r.ok) throw new Error(`${name} failed: ${r.raw.slice(0, 300)}`);
		calledPayPal.set(name, r.data);
		return r.data;
	};

	return {
		list_facts: tool({
			description:
				"List the case-file facts (optionally only one source). Facts are the only evidence you may cite.",
			inputSchema: z.object({
				source: z
					.enum(["paypal", "carrier_sim", "store", "messages"])
					.nullable(),
			}),
			execute: wrap(
				"list_facts",
				"case_file",
				({ source }: { source: string | null }) =>
					cf.facts
						.filter((f) => !source || f.source === source)
						.map(({ id, text, source: s, strength, simulated }) => ({
							id,
							text,
							source: s,
							strength,
							simulated: Boolean(simulated),
						})),
			),
		}),
		get_fact: tool({
			description: "Get one fact by ID (e.g. F3).",
			inputSchema: z.object({ id: z.string() }),
			execute: wrap(
				"get_fact",
				"case_file",
				({ id }: { id: string }) =>
					cf.facts.find((f) => f.id === id) ?? { error: `No fact ${id}` },
			),
		}),
		get_store_policy: tool({
			description:
				"Read a store policy section: shipping, returns or handmade_variation.",
			inputSchema: z.object({
				section: z.enum(["shipping", "returns", "handmade_variation"]),
			}),
			execute: wrap(
				"get_store_policy",
				"case_file",
				({ section }: { section: string }) =>
					cf.storePolicy.find((p) => p.section === section) ?? {
						error: "No such policy",
					},
			),
		}),
		get_listing: tool({
			description:
				"The product listing as the buyer saw it at purchase (title, description, disclaimer).",
			inputSchema: z.object({}),
			execute: wrap(
				"get_listing",
				"case_file",
				() => cf.listingSnapshot ?? { error: "No listing snapshot" },
			),
		}),
		get_message_thread: tool({
			description:
				"The buyer/merchant email thread from the store's support inbox plus messages inside the PayPal dispute.",
			inputSchema: z.object({}),
			execute: wrap("get_message_thread", "case_file", () => ({
				supportInbox: cf.messages,
				disputeMessages: cf.dispute.messages,
			})),
		}),
		compute_fee_impact: tool({
			description:
				"Estimate the merchant's cost of an action: dispute fee exposure and time spent.",
			inputSchema: z.object({
				action: z.enum([
					"fight_with_evidence",
					"make_offer",
					"accept_claim",
					"send_message",
				]),
			}),
			execute: wrap(
				"compute_fee_impact",
				"case_file",
				({ action }: { action: string }) => {
					const fee = formatMoney(fees.disputeFeeMinor, cf.dispute.currency);
					const amt = formatMoney(cf.dispute.amountMinor, cf.dispute.currency);
					if (action === "fight_with_evidence")
						return {
							disputedAmount: amt,
							ifLost: `${amt} refunded + ${fee} dispute fee`,
							merchantTimeMinutes: 2,
							manualTimeMinutes: fees.minutesPerManualCase,
							note: "Counterclaim assembles the evidence; the merchant only approves.",
						};
					if (action === "accept_claim")
						return {
							cost: amt,
							feeAvoided: fee,
							merchantTimeMinutes: 1,
							note: "Ends the case now; avoids the dispute fee of a lost fight.",
						};
					if (action === "make_offer")
						return {
							cost: "the offer amount",
							note: "Keeps the item with the buyer; if accepted the case closes without a fee.",
						};
					return { cost: "none", merchantTimeMinutes: 1 };
				},
			),
		}),

		// ── PayPal Agent Toolkit (live sandbox reads), pinned to THIS case's IDs ──
		get_dispute: tool({
			description:
				"PayPal Agent Toolkit: fetch this dispute live from PayPal (status, links, messages, evidence requests).",
			inputSchema: z.object({}),
			execute: wrap("get_dispute", "paypal_agent_toolkit", () =>
				paypal("get_dispute", { dispute_id: cf.disputeId }),
			),
		}),
		get_order: tool({
			description:
				"PayPal Agent Toolkit: fetch this case's PayPal order (payer, shipping address, captures).",
			inputSchema: z.object({}),
			execute: wrap("get_order", "paypal_agent_toolkit", () => {
				if (!cf.order?.paypalOrderId)
					throw new Error("No PayPal order linked to this dispute");
				return paypal("get_order", { id: cf.order.paypalOrderId });
			}),
		}),
		list_transactions: tool({
			description:
				"PayPal Agent Toolkit: look up this case's capture in the merchant's PayPal transaction history.",
			inputSchema: z.object({}),
			execute: wrap("list_transactions", "paypal_agent_toolkit", () => {
				if (!cf.order?.captureId)
					throw new Error("No capture linked to this dispute");
				return paypal("list_transactions", {
					transaction_id: cf.order.captureId,
					search_months: 1,
				});
			}),
		}),

		submit_assessment: tool({
			description:
				"Submit your final assessment. Call exactly once, at the end.",
			inputSchema: AssessmentSchema,
			execute: async () => "Assessment received.",
		}),
	};
}
