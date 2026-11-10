import { ZodError } from "zod";
import { env } from "./env";
import { log } from "./log";
import { PayPalNotConfiguredError } from "./paypal/auth";
import { PayPalError } from "./paypal/rest";

export function json(
	data: unknown,
	status = 200,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
			...headers,
		},
	});
}

export function apiError(
	code: string,
	message: string,
	status: number,
	details?: unknown,
): Response {
	return json({ error: { code, message, details } }, status);
}

/** Wrap a route handler: maps Zod/PayPal/known errors to the SPEC §10 error envelope. */
export function handle<A extends unknown[]>(
	fn: (...args: A) => Promise<Response>,
) {
	return async (...args: A): Promise<Response> => {
		try {
			return await fn(...args);
		} catch (err) {
			if (err instanceof ZodError)
				return apiError("BAD_REQUEST", "Invalid request body", 400, err.issues);
			if (err instanceof PayPalNotConfiguredError)
				return apiError("PAYPAL_NOT_CONFIGURED", err.message, 503);
			if (err instanceof PayPalError) {
				return apiError("PAYPAL_ERROR", `${err.name}: ${err.message}`, 502, {
					name: err.name,
					message: err.message,
					debugId: err.debugId,
					details: err.details,
					status: err.status,
				});
			}
			const status = (err as { status?: number }).status;
			if (status && status >= 400 && status < 500) {
				return apiError("REQUEST_FAILED", (err as Error).message, status);
			}
			log.error({ err }, "api error");
			return apiError(
				"INTERNAL",
				err instanceof Error ? err.message : "Internal error",
				500,
			);
		}
	};
}

export async function readJson<T>(
	request: Request,
	schema: { parse: (v: unknown) => T },
): Promise<T> {
	const text = await request.text();
	return schema.parse(text ? JSON.parse(text) : {});
}

export function labGuard(): Response | null {
	if (!env().LAB_ENABLED)
		return apiError("LAB_DISABLED", "Sandbox controls are disabled", 403);
	return null;
}
