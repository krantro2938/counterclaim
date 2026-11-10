import { sql as dsql } from "drizzle-orm";
import { db, sql } from "../src/server/db/client";
import { products, storePolicies } from "../src/server/db/schema";
import { labReset } from "../src/server/lab";
import { POLICIES, PRODUCTS } from "../src/server/seed-data";
import { DEFAULT_AUTOPILOT, DEFAULT_FEES, getSettings } from "../src/server/settings";
import { HANDMADE_DISCLAIMER } from "../src/server/seed-data";

const reset = process.argv.includes("--reset");
const wipeOrders = process.argv.includes("--wipe-orders");

for (const p of PRODUCTS) {
	await db()
		.insert(products)
		.values({ ...p, currency: "USD", disclaimer: HANDMADE_DISCLAIMER })
		.onConflictDoUpdate({
			target: products.slug,
			set: { title: p.title, description: p.description, priceMinor: p.priceMinor, imageUrl: p.imageUrl, sortOrder: p.sortOrder, disclaimer: HANDMADE_DISCLAIMER },
		});
}
for (const p of POLICIES) {
	await db()
		.insert(storePolicies)
		.values(p)
		.onConflictDoUpdate({ target: storePolicies.section, set: { title: p.title, body: p.body } });
}
await getSettings();
if (reset) {
	await db().execute(dsql`update merchant_settings set autopilot = ${JSON.stringify(DEFAULT_AUTOPILOT)}::jsonb, fee_constants = ${JSON.stringify(DEFAULT_FEES)}::jsonb where id = 1`);
	await labReset({ keepOrders: !wipeOrders });
	console.log(`demo data reset${wipeOrders ? " (orders wiped)" : ""}; disputes will re-sync from PayPal`);
}
console.log(`seeded ${PRODUCTS.length} products, ${POLICIES.length} policies`);
await sql().end();
