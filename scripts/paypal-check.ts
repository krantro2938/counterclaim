/**
 * G0 sandbox truth check. Run as soon as PayPal credentials are in .env:
 *   pnpm tsx --env-file=.env scripts/paypal-check.ts [--register-webhook https://counterclaim.aansl.com/webhooks/paypal]
 * Prints token scopes, disputes (status, stage, HATEOAS rels) and webhooks. Never prints secrets.
 */
import { env } from "../src/server/env";
import { createWebhook, getDispute, listDisputes, listWebhooks } from "../src/server/paypal/rest";
import { WEBHOOK_EVENT_TYPES } from "../src/server/paypal/webhooks";

const e = env();
if (!e.PAYPAL_CLIENT_ID || !e.PAYPAL_CLIENT_SECRET) {
	console.error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing");
	process.exit(1);
}

const basic = Buffer.from(`${e.PAYPAL_CLIENT_ID}:${e.PAYPAL_CLIENT_SECRET}`).toString("base64");
const tok = await fetch(`${e.PAYPAL_API_BASE}/v1/oauth2/token`, {
	method: "POST",
	headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
	body: "grant_type=client_credentials",
});
const tj = (await tok.json()) as { scope?: string; app_id?: string; expires_in?: number };
console.log(`token: HTTP ${tok.status}, app ${tj.app_id}, expires_in ${tj.expires_in}`);
const scopes = (tj.scope ?? "").split(" ");
for (const s of ["disputes/read-seller", "disputes/update-seller", "shipping/trackers/readwrite", "reporting/search/read", "payments/refund", "checkout/order"]) {
	console.log(`  scope ${s}: ${scopes.some((x) => x.includes(s)) ? "yes" : "NO"}`);
}

try {
	const items = await listDisputes({ maxPages: 2 });
	console.log(`disputes: ${items.length}`);
	for (const it of items.slice(0, 10)) {
		const d = await getDispute(it.dispute_id);
		console.log(
			`  ${it.dispute_id} ${d.data.reason} stage=${d.data.dispute_life_cycle_stage} status=${d.data.status} amount=${d.data.dispute_amount?.value} rels=[${(d.data.links ?? []).map((l) => l.rel).join(", ")}] debug=${d.debugId}`,
		);
	}
} catch (err) {
	console.error("disputes failed:", err);
}

try {
	const w = await listWebhooks();
	console.log(`webhooks: ${w.data.webhooks.length}`);
	for (const h of w.data.webhooks) console.log(`  ${h.id} ${h.url} [${h.event_types.map((x) => x.name).join(", ")}]`);
	const i = process.argv.indexOf("--register-webhook");
	if (i > 0) {
		const url = process.argv[i + 1];
		if (w.data.webhooks.some((h) => h.url === url)) console.log(`webhook already registered for ${url}`);
		else {
			const c = await createWebhook(url, WEBHOOK_EVENT_TYPES);
			console.log(`registered webhook ${c.data.id} → ${url}  (set PAYPAL_WEBHOOK_ID=${c.data.id})`);
		}
	}
} catch (err) {
	console.error("webhooks failed:", err);
}
process.exit(0);
