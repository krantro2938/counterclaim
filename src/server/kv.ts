import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { activity, kv } from "./db/schema";
import { publish } from "./events/bus";

export async function kvGet<T>(key: string): Promise<T | undefined> {
	const [row] = await db().select().from(kv).where(eq(kv.key, key)).limit(1);
	return row?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
	await db()
		.insert(kv)
		.values({ key, value, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: kv.key,
			set: { value, updatedAt: new Date() },
		});
}

export type Actor =
	| "buyer"
	| "merchant"
	| "paypal"
	| "agent"
	| "simulated"
	| "system";

/** Append to the activity feed (Overview "Recent activity" + case timelines). */
export async function recordActivity(a: {
	actor: Actor;
	kind: string;
	text: string;
	disputeId?: string | null;
	orderId?: string | null;
	meta?: Record<string, unknown>;
	at?: Date;
}): Promise<void> {
	await db()
		.insert(activity)
		.values({
			actor: a.actor,
			kind: a.kind,
			text: a.text,
			disputeId: a.disputeId ?? null,
			orderId: a.orderId ?? null,
			meta: a.meta ?? null,
			at: a.at ?? new Date(),
		});
	await publish({
		type: "activity",
		text: a.text,
		disputeId: a.disputeId ?? undefined,
	});
}
