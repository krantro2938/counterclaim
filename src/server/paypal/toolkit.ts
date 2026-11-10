import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { env, isSandbox } from "../env";
import { log } from "../log";
import { PayPalNotConfiguredError } from "./auth";

/**
 * PayPal Agent Toolkit (`@paypal/agent-toolkit/ai-sdk`).
 *
 * Two separate instances so the model can never reach a mutating tool:
 * - READ toolkit: get_dispute, list_disputes, get_order, get_shipment_tracking, list_transactions.
 *   These are wrapped as AI SDK 7 tools in agent/tools.ts and handed to the LLM.
 * - ACTION toolkit: accept_dispute_claim, create_shipment_tracking, create_refund.
 *   Only called programmatically by our executor / protection code after merchant approval,
 *   with PayPal-Request-Id set via `context.request_id`.
 *
 * The toolkit bundles AI SDK v4 (`parameters` schema). We call each tool's `execute` directly.
 */

export const READ_TOOL_NAMES = [
	"get_dispute",
	"list_disputes",
	"get_order",
	"get_shipment_tracking",
	"list_transactions",
] as const;
export type ReadToolName = (typeof READ_TOOL_NAMES)[number];

export const ACTION_TOOL_NAMES = [
	"accept_dispute_claim",
	"create_shipment_tracking",
	"create_refund",
] as const;
export type ActionToolName = (typeof ACTION_TOOL_NAMES)[number];

type ToolLike = {
	description?: string;
	execute?: (args: unknown, opts?: unknown) => Promise<unknown>;
};

function creds() {
	const e = env();
	if (!e.PAYPAL_CLIENT_ID || !e.PAYPAL_CLIENT_SECRET)
		throw new PayPalNotConfiguredError();
	return { clientId: e.PAYPAL_CLIENT_ID, clientSecret: e.PAYPAL_CLIENT_SECRET };
}

let readKit: PayPalAgentToolkit | undefined;

export function readToolkit(): PayPalAgentToolkit {
	if (!readKit) {
		readKit = new PayPalAgentToolkit({
			...creds(),
			configuration: {
				actions: {
					disputes: { list: true, get: true },
					orders: { get: true },
					shipment: { get: true },
					transactions: { list: true },
				},
				context: { sandbox: isSandbox() },
			},
		});
	}
	return readKit;
}

/** A fresh action toolkit per mutating call so PayPal-Request-Id = our action UUID. */
export function actionToolkit(requestId: string): PayPalAgentToolkit {
	return new PayPalAgentToolkit({
		...creds(),
		configuration: {
			actions: {
				disputes: { create: true }, // enables accept_dispute_claim
				shipment: { create: true },
				payments: { createRefund: true },
			},
			context: { sandbox: isSandbox(), request_id: requestId },
		},
	});
}

export type ToolkitResult = {
	ok: boolean;
	data: unknown;
	raw: string;
	ms: number;
};

/** Run a toolkit tool's execute() and normalise the result (the toolkit returns JSON strings, errors as {error}). */
export async function runToolkitTool(
	kit: PayPalAgentToolkit,
	name: string,
	args: Record<string, unknown>,
): Promise<ToolkitResult> {
	const tools = kit.getTools() as unknown as Record<string, ToolLike>;
	const t = tools[name];
	if (!t?.execute) throw new Error(`Toolkit tool not enabled: ${name}`);
	const started = Date.now();
	let out: unknown;
	try {
		out = await t.execute(args, {
			toolCallId: `cc-${Date.now()}`,
			messages: [],
		});
	} catch (err) {
		const ms = Date.now() - started;
		log.warn({ toolkit: { name, ms }, err }, "toolkit tool threw");
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			data: { error: { message } },
			raw: JSON.stringify({ error: { message } }),
			ms,
		};
	}
	const ms = Date.now() - started;
	const raw = typeof out === "string" ? out : JSON.stringify(out);
	let data: unknown = out;
	if (typeof out === "string") {
		try {
			data = JSON.parse(out);
		} catch {
			data = out;
		}
	}
	const isErr =
		data != null &&
		typeof data === "object" &&
		"error" in (data as Record<string, unknown>) &&
		Object.keys(data as Record<string, unknown>).length <= 2;
	log.info({ toolkit: { name, ok: !isErr, ms } }, "toolkit call");
	return { ok: !isErr, data, raw, ms };
}

export function readToolDescription(name: ReadToolName): string {
	try {
		const tools = readToolkit().getTools() as unknown as Record<
			string,
			ToolLike
		>;
		return tools[name]?.description ?? name;
	} catch {
		return name;
	}
}
