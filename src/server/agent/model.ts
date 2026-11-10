import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { env } from "../env";

/**
 * The only place that imports an LLM provider (CLAUDE.md §5).
 * AI_PROVIDER=openai_compat → Inception Mercury via OPENAI_URL/OPENAI_KEY/OPENAI_MODEL
 * AI_PROVIDER=anthropic     → Claude via ANTHROPIC_API_KEY
 */
export type ModelRole = "assess" | "cheap";

export type ModelInfo = {
	model: LanguageModel;
	id: string;
	provider: "openai_compat" | "anthropic";
	temperature: number;
	defaultMode: "tools" | "single_shot";
};

export function getModel(
	role: ModelRole,
	override?: "openai_compat" | "anthropic",
): ModelInfo {
	const e = env();
	const provider = override ?? e.AI_PROVIDER;
	if (provider === "anthropic") {
		if (!e.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
		const anthropic = createAnthropic({ apiKey: e.ANTHROPIC_API_KEY });
		const id =
			role === "assess" ? e.ANTHROPIC_MODEL_ASSESS : e.ANTHROPIC_MODEL_CHEAP;
		return {
			model: anthropic(id),
			id,
			provider,
			temperature: 0.2,
			defaultMode: "tools",
		};
	}
	if (!e.OPENAI_KEY) throw new Error("OPENAI_KEY is not set");
	const mercury = createOpenAICompatible({
		name: "inception",
		baseURL: e.OPENAI_URL,
		apiKey: e.OPENAI_KEY,
		supportsStructuredOutputs: true,
	});
	// Mercury requires temperature in [0.5, 1].
	return {
		model: mercury.chatModel(e.OPENAI_MODEL),
		id: e.OPENAI_MODEL,
		provider,
		temperature: 0.5,
		defaultMode: "tools",
	};
}

export function agentMode(info: ModelInfo): "tools" | "single_shot" {
	const m = env().AGENT_MODE;
	return m === "auto" ? info.defaultMode : m;
}
