import { z } from "zod";

const bool = z
	.enum(["true", "false", "1", "0", ""])
	.optional()
	.transform((v) => v === "true" || v === "1");

const optionalString = z
	.string()
	.optional()
	.transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const EnvSchema = z.object({
	NODE_ENV: z.string().default("development"),
	DATABASE_URL: z
		.string()
		.default("postgres://counterclaim:counterclaim@localhost:5433/counterclaim"),

	PAYPAL_CLIENT_ID: optionalString,
	PAYPAL_CLIENT_SECRET: optionalString,
	PAYPAL_API_BASE: z.string().default("https://api-m.sandbox.paypal.com"),
	PAYPAL_WEBHOOK_ID: optionalString,

	AI_PROVIDER: z.enum(["openai_compat", "anthropic"]).default("openai_compat"),
	OPENAI_URL: z.string().default("https://api.inceptionlabs.ai/v1"),
	OPENAI_KEY: optionalString,
	OPENAI_MODEL: z.string().default("mercury-3"),
	ANTHROPIC_API_KEY: optionalString,
	ANTHROPIC_MODEL_ASSESS: z.string().default("claude-sonnet-5-5"),
	ANTHROPIC_MODEL_CHEAP: z.string().default("claude-haiku-5-5"),
	AGENT_MODE: z.enum(["auto", "tools", "single_shot"]).default("auto"),

	PUBLIC_BASE_URL: z.string().default("http://localhost:3000"),
	WORKER_MODE: z.enum(["separate", "inprocess"]).default("separate"),
	LAB_ENABLED: bool,
	LOG_LEVEL: z.string().default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Zod-validated server environment. Server-only. */
export function env(): Env {
	if (!cached) cached = EnvSchema.parse(process.env);
	return cached;
}

export function paypalConfigured(): boolean {
	const e = env();
	return Boolean(e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET);
}

export function isSandbox(): boolean {
	return env().PAYPAL_API_BASE.includes("sandbox");
}
