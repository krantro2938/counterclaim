import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return "bytea";
	},
});

const ts = (name?: string) =>
	name ? timestamp(name, { withTimezone: true }) : timestamp({ withTimezone: true });

export type Address = {
	name?: string;
	line1?: string;
	line2?: string;
	city?: string;
	state?: string;
	postalCode?: string;
	countryCode?: string;
};

export type OrderItem = {
	productId?: number;
	slug?: string;
	title: string;
	quantity: number;
	unitMinor: number;
};

export type AutopilotSettings = {
	autoAcknowledgeInquiry: boolean;
	autoSubmitFulfillment: boolean;
	autoSubmitMinScore: number;
	autoAcceptSmallClaims: boolean;
	autoAcceptMaxMinor: number;
	autoAcceptMaxLikelihood: number;
	undoWindowSeconds: number;
};

export type FeeConstants = {
	disputeFeeMinor: number;
	minutesPerManualCase: number;
};

export const merchantSettings = pgTable("merchant_settings", {
	id: integer().primaryKey().default(1),
	storeName: text().notNull().default("Kiln & Thread"),
	ownerName: text().notNull().default("Maya"),
	autopilot: jsonb().$type<AutopilotSettings>().notNull(),
	atRiskAfterHours: integer().notNull().default(1),
	feeConstants: jsonb().$type<FeeConstants>().notNull(),
	updatedAt: ts().notNull().defaultNow(),
});

export const storePolicies = pgTable("store_policies", {
	id: serial().primaryKey(),
	section: text().notNull().unique(),
	title: text().notNull(),
	body: text().notNull(),
});

export const products = pgTable("products", {
	id: serial().primaryKey(),
	slug: text().notNull().unique(),
	title: text().notNull(),
	description: text().notNull(),
	priceMinor: bigint({ mode: "number" }).notNull(),
	currency: varchar({ length: 3 }).notNull().default("USD"),
	imageUrl: text().notNull(),
	disclaimer: text(),
	sortOrder: integer().notNull().default(0),
});

export const orders = pgTable(
	"orders",
	{
		id: uuid().primaryKey().defaultRandom(),
		number: integer().notNull().unique(),
		paypalOrderId: text().unique(),
		captureId: text().unique(),
		buyerEmail: text(),
		buyerName: text(),
		payerId: text(),
		amountMinor: bigint({ mode: "number" }).notNull(),
		currency: varchar({ length: 3 }).notNull().default("USD"),
		items: jsonb().$type<OrderItem[]>().notNull(),
		shippingAddress: jsonb().$type<Address>(),
		paypalShippingAddress: jsonb().$type<Address>(),
		/** created | approved | captured | refunded | partially_refunded */
		status: text().notNull().default("created"),
		capturedAt: ts(),
		/** protected | at_risk | not_eligible | not_applicable | pending */
		protectionStatus: text().notNull().default("pending"),
		protectionReasons: jsonb().$type<string[]>().notNull().default([]),
		/** paypal = real sandbox checkout; seed = demo backfill (labelled in UI) */
		origin: text().notNull().default("paypal"),
		raw: jsonb(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [index("orders_captured_at_idx").on(t.capturedAt)],
);

export const shipments = pgTable("shipments", {
	id: uuid().primaryKey().defaultRandom(),
	orderId: uuid()
		.notNull()
		.references(() => orders.id, { onDelete: "cascade" }),
	carrier: text().notNull(),
	trackingNumber: text().notNull(),
	shippedAt: ts().notNull().defaultNow(),
	uploadedToPaypalAt: ts(),
	paypalResponse: jsonb(),
	simulated: boolean().notNull().default(true),
});

export const carrierEvents = pgTable("carrier_events", {
	id: serial().primaryKey(),
	shipmentId: uuid()
		.notNull()
		.references(() => shipments.id, { onDelete: "cascade" }),
	/** label_created | in_transit | out_for_delivery | delivered */
	code: text().notNull(),
	description: text().notNull(),
	location: text(),
	occurredAt: ts().notNull(),
	simulated: boolean().notNull().default(true),
});

export const customerMessages = pgTable("customer_messages", {
	id: serial().primaryKey(),
	orderId: uuid().references(() => orders.id, { onDelete: "cascade" }),
	disputeId: text(),
	/** in = from buyer, out = from merchant */
	direction: text().notNull(),
	/** email | dispute */
	channel: text().notNull(),
	body: text().notNull(),
	sentAt: ts().notNull(),
});

export const disputes = pgTable(
	"disputes",
	{
		id: text().primaryKey(),
		orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
		reason: text().notNull(),
		stage: text(),
		status: text().notNull(),
		amountMinor: bigint({ mode: "number" }).notNull(),
		currency: varchar({ length: 3 }).notNull().default("USD"),
		sellerResponseDueAt: ts(),
		links: jsonb().$type<{ rel: string; href: string; method?: string }[]>().notNull().default([]),
		raw: jsonb().notNull(),
		/** won | lost | other (derived from dispute_outcome) */
		outcome: text(),
		outcomeCode: text(),
		buyerName: text(),
		buyerTransactionId: text(),
		sellerTransactionId: text(),
		createTime: ts(),
		resolvedAt: ts(),
		firstSeenAt: ts().notNull().defaultNow(),
		/** first time the merchant acted (for "time from dispute to response") */
		firstResponseAt: ts(),
		updatedAt: ts().notNull().defaultNow(),
		paypalUpdateTime: ts(),
	},
	(t) => [index("disputes_status_idx").on(t.status)],
);

export const assessments = pgTable(
	"assessments",
	{
		id: serial().primaryKey(),
		disputeId: text()
			.notNull()
			.references(() => disputes.id, { onDelete: "cascade" }),
		version: integer().notNull(),
		/** running | ready | failed */
		state: text().notNull().default("running"),
		rubricScore: integer(),
		llmScore: integer(),
		finalScore: integer(),
		recommendedAction: text(),
		confidence: text(),
		headline: text(),
		reasoning: jsonb().$type<{ point: string; factIds: string[] }[]>(),
		risks: jsonb().$type<string[]>(),
		missing: jsonb().$type<string[]>(),
		facts: jsonb(),
		rubric: jsonb(),
		degraded: boolean().notNull().default(false),
		mode: text(),
		model: text(),
		latencyMs: integer(),
		tokensIn: integer(),
		tokensOut: integer(),
		error: text(),
		statusAtAssessment: text(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [uniqueIndex("assessments_dispute_version_idx").on(t.disputeId, t.version)],
);

export type ActionStatus =
	| "proposed"
	| "needs_approval"
	| "approved"
	| "auto_scheduled"
	| "executing"
	| "succeeded"
	| "failed"
	| "rejected"
	| "cancelled"
	| "superseded";

export const actions = pgTable(
	"actions",
	{
		id: uuid().primaryKey().defaultRandom(),
		disputeId: text()
			.notNull()
			.references(() => disputes.id, { onDelete: "cascade" }),
		assessmentId: integer().references(() => assessments.id, { onDelete: "set null" }),
		/** send_message | provide_evidence | make_offer | accept_claim | escalate */
		type: text().notNull(),
		params: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		status: text().$type<ActionStatus>().notNull().default("proposed"),
		/** agent | merchant | autopilot */
		source: text().notNull().default("agent"),
		rationale: text(),
		rel: text(),
		paypalRequestId: uuid().notNull().defaultRandom(),
		paypalDebugId: text(),
		response: jsonb(),
		error: jsonb(),
		executeAfter: ts(),
		decidedAt: ts(),
		executedAt: ts(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [index("actions_dispute_idx").on(t.disputeId)],
);

export const agentSteps = pgTable(
	"agent_steps",
	{
		id: serial().primaryKey(),
		assessmentId: integer()
			.notNull()
			.references(() => assessments.id, { onDelete: "cascade" }),
		seq: integer().notNull(),
		/** model | tool_call | tool_result | validation | info */
		kind: text().notNull(),
		payload: jsonb().notNull(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [index("agent_steps_assessment_idx").on(t.assessmentId)],
);

export const evidenceFiles = pgTable("evidence_files", {
	id: uuid().primaryKey().defaultRandom(),
	disputeId: text()
		.notNull()
		.references(() => disputes.id, { onDelete: "cascade" }),
	actionId: uuid().references(() => actions.id, { onDelete: "set null" }),
	filename: text().notNull(),
	bytes: bytea().notNull(),
	sizeBytes: integer().notNull(),
	sha256: text().notNull(),
	createdAt: ts().notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
	id: text().primaryKey(),
	type: text().notNull(),
	verified: boolean().notNull().default(false),
	verifyDetail: text(),
	payload: jsonb().notNull(),
	receivedAt: ts().notNull().defaultNow(),
	processedAt: ts(),
	error: text(),
});

export const jobs = pgTable(
	"jobs",
	{
		id: serial().primaryKey(),
		kind: text().notNull(),
		refId: text(),
		payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		runAfter: ts().notNull().defaultNow(),
		attempts: integer().notNull().default(0),
		maxAttempts: integer().notNull().default(3),
		lockedAt: ts(),
		doneAt: ts(),
		lastError: text(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("jobs_pending_idx")
			.on(t.runAfter)
			.where(sql`done_at is null`),
	],
);

/** Activity feed: one row per notable thing that happened (timeline + Overview feed). */
export const activity = pgTable(
	"activity",
	{
		id: serial().primaryKey(),
		disputeId: text(),
		orderId: uuid(),
		/** buyer | merchant | paypal | agent | simulated | system */
		actor: text().notNull(),
		kind: text().notNull(),
		text: text().notNull(),
		meta: jsonb(),
		at: ts().notNull().defaultNow(),
	},
	(t) => [index("activity_at_idx").on(t.at), index("activity_dispute_idx").on(t.disputeId)],
);

/** Small key/value store for runtime state (poller cursor, last webhook, etc.) */
export const kv = pgTable("kv", {
	key: text().primaryKey(),
	value: jsonb().notNull(),
	updatedAt: ts().notNull().defaultNow(),
});
