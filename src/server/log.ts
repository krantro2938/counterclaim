import pino from "pino";

/** Structured JSON logger (CLAUDE.md §5). */
export const log = pino({
	level: process.env.LOG_LEVEL ?? "info",
	base: { svc: process.env.CC_PROCESS ?? "web" },
	timestamp: pino.stdTimeFunctions.isoTime,
});
