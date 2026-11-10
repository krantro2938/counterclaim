/** Client-side API helpers (TanStack Query fetchers). Types come from server modules as type-only imports. */

export class ApiError extends Error {
	code: string;
	status: number;
	details: unknown;
	constructor(status: number, code: string, message: string, details?: unknown) {
		super(message);
		this.status = status;
		this.code = code;
		this.details = details;
	}
	get debugId(): string | undefined {
		return (this.details as { debugId?: string } | undefined)?.debugId ?? undefined;
	}
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
	const { json, ...rest } = init ?? {};
	const res = await fetch(path, {
		...rest,
		headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
		body: json !== undefined ? JSON.stringify(json) : rest.body,
	});
	const text = await res.text();
	const data = text ? JSON.parse(text) : null;
	if (!res.ok) {
		const e = data?.error ?? {};
		throw new ApiError(res.status, e.code ?? "HTTP_ERROR", e.message ?? `Request failed (${res.status})`, e.details);
	}
	return data as T;
}

export const post = <T>(path: string, json?: unknown) => api<T>(path, { method: "POST", json: json ?? {} });

export const qk = {
	overview: ["overview"] as const,
	disputes: ["disputes"] as const,
	dispute: (id: string) => ["dispute", id] as const,
	trace: (assessmentId: number) => ["trace", assessmentId] as const,
	orders: ["orders"] as const,
	settings: ["settings"] as const,
	lab: ["lab"] as const,
	products: ["products"] as const,
};
