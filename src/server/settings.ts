import { asc, eq } from "drizzle-orm";
import { db } from "./db/client";
import {
	type AutopilotSettings,
	type FeeConstants,
	merchantSettings,
	storePolicies,
} from "./db/schema";

export const DEFAULT_AUTOPILOT: AutopilotSettings = {
	autoAcknowledgeInquiry: false,
	autoSubmitFulfillment: false,
	autoSubmitMinScore: 85,
	autoAcceptSmallClaims: false,
	autoAcceptMaxMinor: 1500,
	autoAcceptMaxLikelihood: 25,
	undoWindowSeconds: 120,
};

export const DEFAULT_FEES: FeeConstants = {
	/** PayPal dispute fee for a lost/escalated case (standard US fee, illustrative) */
	disputeFeeMinor: 1500,
	/** typical manual time to assemble one dispute response */
	minutesPerManualCase: 45,
};

export type MerchantSettings = typeof merchantSettings.$inferSelect;

export async function getSettings(): Promise<MerchantSettings> {
	const [row] = await db().select().from(merchantSettings).where(eq(merchantSettings.id, 1)).limit(1);
	if (row) return { ...row, autopilot: { ...DEFAULT_AUTOPILOT, ...row.autopilot } };
	const [created] = await db()
		.insert(merchantSettings)
		.values({ id: 1, autopilot: DEFAULT_AUTOPILOT, feeConstants: DEFAULT_FEES })
		.onConflictDoNothing()
		.returning();
	return created ?? (await getSettings());
}

export async function getPolicies() {
	return db().select().from(storePolicies).orderBy(asc(storePolicies.id));
}
