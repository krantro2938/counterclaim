import { env, paypalConfigured } from "../env";
import { log } from "../log";

let cached: { token: string; expiresAt: number } | undefined;
let inflight: Promise<string> | undefined;

export class PayPalNotConfiguredError extends Error {
	constructor() {
		super(
			"PayPal sandbox credentials are not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)",
		);
		this.name = "PayPalNotConfigured";
	}
}

/** OAuth2 client-credentials token, cached until expiry minus 60 s. */
export async function getAccessToken(): Promise<string> {
	if (!paypalConfigured()) throw new PayPalNotConfiguredError();
	if (cached && Date.now() < cached.expiresAt) return cached.token;
	if (inflight) return inflight;
	inflight = (async () => {
		const e = env();
		const basic = Buffer.from(
			`${e.PAYPAL_CLIENT_ID}:${e.PAYPAL_CLIENT_SECRET}`,
		).toString("base64");
		const res = await fetch(`${e.PAYPAL_API_BASE}/v1/oauth2/token`, {
			method: "POST",
			headers: {
				Authorization: `Basic ${basic}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "grant_type=client_credentials",
		});
		const debugId = res.headers.get("paypal-debug-id");
		log.info(
			{
				paypal: {
					method: "POST",
					path: "/v1/oauth2/token",
					status: res.status,
					debugId,
				},
			},
			"paypal call",
		);
		if (!res.ok) {
			const text = await res.text();
			throw new Error(
				`PayPal token request failed (${res.status}): ${text.slice(0, 300)}`,
			);
		}
		const json = (await res.json()) as {
			access_token: string;
			expires_in: number;
			scope?: string;
		};
		cached = {
			token: json.access_token,
			expiresAt: Date.now() + (json.expires_in - 60) * 1000,
		};
		return json.access_token;
	})();
	try {
		return await inflight;
	} finally {
		inflight = undefined;
	}
}

export function clearTokenCache(): void {
	cached = undefined;
}
