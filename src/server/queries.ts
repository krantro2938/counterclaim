import { and, asc, desc, eq, gte, inArray, isNotNull, ne, sql as dsql } from "drizzle-orm";
import { db } from "./db/client";
import {
	actions,
	activity,
	agentSteps,
	assessments,
	carrierEvents,
	customerMessages,
	disputes,
	evidenceFiles,
	orders,
	shipments,
	webhookEvents,
} from "./db/schema";
import { env, paypalConfigured } from "./env";
import { kvGet } from "./kv";
import { getPolicies, getSettings } from "./settings";

const OPEN_ACTION = ["proposed", "needs_approval", "auto_scheduled", "approved", "executing"] as const;

async function latestAssessments(disputeIds: string[]) {
	if (!disputeIds.length) return new Map<string, typeof assessments.$inferSelect>();
	const rows = await db()
		.selectDistinctOn([assessments.disputeId])
		.from(assessments)
		.where(and(inArray(assessments.disputeId, disputeIds), eq(assessments.state, "ready")))
		.orderBy(assessments.disputeId, desc(assessments.version));
	return new Map(rows.map((r) => [r.disputeId, r]));
}

function nextStep(d: typeof disputes.$inferSelect, pendingDecision: boolean, assessing: boolean): string {
	if (d.status === "RESOLVED") return "Closed";
	if (assessing) return "Counterclaim is assessing";
	if (pendingDecision) return "Review the recommendation";
	if (d.status === "UNDER_REVIEW") return "Waiting for PayPal's decision";
	if (d.status === "WAITING_FOR_BUYER_RESPONSE") return "Waiting for the buyer";
	if (d.status === "WAITING_FOR_SELLER_RESPONSE") return "Respond before the deadline";
	return "Monitor";
}

export async function listDisputeRows() {
	const rows = await db()
		.select({ d: disputes, orderNumber: orders.number, orderBuyer: orders.buyerName })
		.from(disputes)
		.leftJoin(orders, eq(orders.id, disputes.orderId))
		.orderBy(desc(disputes.updatedAt));
	const ids = rows.map((r) => r.d.id);
	const latest = await latestAssessments(ids);
	const pending = ids.length
		? await db()
				.select({ disputeId: actions.disputeId, n: dsql<number>`count(*)` })
				.from(actions)
				.where(and(inArray(actions.disputeId, ids), inArray(actions.status, ["needs_approval", "proposed"])))
				.groupBy(actions.disputeId)
		: [];
	const running = ids.length
		? await db()
				.select({ disputeId: assessments.disputeId })
				.from(assessments)
				.where(and(inArray(assessments.disputeId, ids), eq(assessments.state, "running")))
		: [];
	const pendingSet = new Set(pending.filter((p) => Number(p.n) > 0).map((p) => p.disputeId));
	const runningSet = new Set(running.map((r) => r.disputeId));
	return rows.map(({ d, orderNumber, orderBuyer }) => {
		const a = latest.get(d.id);
		return {
			id: d.id,
			orderNumber: orderNumber ?? null,
			buyer: d.buyerName ?? orderBuyer ?? null,
			reason: d.reason,
			stage: d.stage,
			status: d.status,
			outcome: d.outcome,
			amountMinor: d.amountMinor,
			currency: d.currency,
			dueAt: d.sellerResponseDueAt?.toISOString() ?? null,
			finalScore: a?.finalScore ?? null,
			rubricScore: a?.rubricScore ?? null,
			llmScore: a?.llmScore ?? null,
			recommendedAction: a?.recommendedAction ?? null,
			headline: a?.headline ?? null,
			needsDecision: pendingSet.has(d.id) && d.status !== "RESOLVED",
			assessing: runningSet.has(d.id),
			nextStep: nextStep(d, pendingSet.has(d.id), runningSet.has(d.id)),
			createdAt: (d.createTime ?? d.firstSeenAt).toISOString(),
			updatedAt: d.updatedAt.toISOString(),
		};
	});
}

export type DisputeRowDto = Awaited<ReturnType<typeof listDisputeRows>>[number];

export async function getDisputeDetail(id: string) {
	const [d] = await db().select().from(disputes).where(eq(disputes.id, id)).limit(1);
	if (!d) return null;
	const [order] = d.orderId ? await db().select().from(orders).where(eq(orders.id, d.orderId)).limit(1) : [];
	const [shipment] = order
		? await db().select().from(shipments).where(eq(shipments.orderId, order.id)).orderBy(desc(shipments.shippedAt)).limit(1)
		: [];
	const events = shipment
		? await db().select().from(carrierEvents).where(eq(carrierEvents.shipmentId, shipment.id)).orderBy(asc(carrierEvents.occurredAt))
		: [];
	const messages = await db()
		.select()
		.from(customerMessages)
		.where(order ? dsql`${customerMessages.orderId} = ${order.id} or ${customerMessages.disputeId} = ${id}` : eq(customerMessages.disputeId, id))
		.orderBy(asc(customerMessages.sentAt));
	const allAssessments = await db()
		.select()
		.from(assessments)
		.where(eq(assessments.disputeId, id))
		.orderBy(desc(assessments.version));
	const latest = allAssessments.find((a) => a.state === "ready") ?? null;
	const running = allAssessments.find((a) => a.state === "running") ?? null;
	const acts = await db().select().from(actions).where(eq(actions.disputeId, id)).orderBy(desc(actions.createdAt));
	const files = await db()
		.select({ id: evidenceFiles.id, filename: evidenceFiles.filename, sizeBytes: evidenceFiles.sizeBytes, createdAt: evidenceFiles.createdAt, actionId: evidenceFiles.actionId })
		.from(evidenceFiles)
		.where(eq(evidenceFiles.disputeId, id))
		.orderBy(desc(evidenceFiles.createdAt));
	const acts2 = await db()
		.select()
		.from(activity)
		.where(order ? dsql`${activity.disputeId} = ${id} or ${activity.orderId} = ${order.id}` : eq(activity.disputeId, id))
		.orderBy(asc(activity.at));
	return {
		dispute: { ...d, raw: d.raw },
		order: order ?? null,
		shipment: shipment ?? null,
		carrierEvents: events,
		messages,
		assessment: latest,
		assessmentRunning: Boolean(running),
		assessmentVersions: allAssessments.filter((a) => a.state === "ready").map((a) => ({ id: a.id, version: a.version, createdAt: a.createdAt })),
		actions: acts,
		evidenceFiles: files,
		activity: acts2,
	};
}

export async function getTrace(assessmentId: number) {
	return db().select().from(agentSteps).where(eq(agentSteps.assessmentId, assessmentId)).orderBy(asc(agentSteps.seq));
}

export async function listOrderRows() {
	const rows = await db().select().from(orders).where(isNotNull(orders.capturedAt)).orderBy(desc(orders.number));
	const ids = rows.map((r) => r.id);
	const ships = ids.length ? await db().select().from(shipments).where(inArray(shipments.orderId, ids)) : [];
	const delivered = ships.length
		? await db()
				.select({ shipmentId: carrierEvents.shipmentId, code: carrierEvents.code })
				.from(carrierEvents)
				.where(inArray(carrierEvents.shipmentId, ships.map((s) => s.id)))
		: [];
	const disps = ids.length ? await db().select({ id: disputes.id, orderId: disputes.orderId, status: disputes.status }).from(disputes).where(inArray(disputes.orderId, ids)) : [];
	return rows.map((o) => {
		const s = ships.find((x) => x.orderId === o.id);
		const evs = s ? delivered.filter((e) => e.shipmentId === s.id) : [];
		return {
			id: o.id,
			number: o.number,
			buyer: o.buyerName,
			buyerEmail: o.buyerEmail,
			items: o.items,
			amountMinor: o.amountMinor,
			currency: o.currency,
			capturedAt: o.capturedAt?.toISOString() ?? null,
			captureId: o.captureId,
			paypalOrderId: o.paypalOrderId,
			status: o.status,
			shipment: s
				? {
						id: s.id,
						carrier: s.carrier,
						trackingNumber: s.trackingNumber,
						uploadedToPaypalAt: s.uploadedToPaypalAt?.toISOString() ?? null,
						lastEvent: evs.at(-1)?.code ?? null,
						simulated: s.simulated,
					}
				: null,
			protectionStatus: o.protectionStatus,
			reasons: o.protectionReasons,
			disputeId: disps.find((d) => d.orderId === o.id)?.id ?? null,
		};
	});
}

export type OrderRowDto = Awaited<ReturnType<typeof listOrderRows>>[number];

export async function getOverview() {
	const settings = await getSettings();
	const all = await db().select().from(disputes);
	const open = all.filter((d) => d.status !== "RESOLVED");
	const monthStart = new Date();
	monthStart.setUTCDate(1);
	monthStart.setUTCHours(0, 0, 0, 0);
	const won = all.filter((d) => d.outcome === "won");
	const lost = all.filter((d) => d.outcome === "lost");
	const recoveredMinor = won.filter((d) => (d.resolvedAt ?? d.updatedAt) >= monthStart).reduce((s, d) => s + d.amountMinor, 0);
	const rows = await listDisputeRows();
	const needs = rows.filter((r) => r.needsDecision);
	const orderRows = await db()
		.select({ status: orders.protectionStatus })
		.from(orders)
		.where(isNotNull(orders.capturedAt));
	const counted = orderRows.filter((o) => o.status !== "pending" && o.status !== "not_applicable");
	const protectedN = counted.filter((o) => o.status === "protected").length;
	const decided = await db()
		.select({ created: disputes.firstSeenAt, decided: actions.decidedAt })
		.from(actions)
		.innerJoin(disputes, eq(disputes.id, actions.disputeId))
		.where(and(isNotNull(actions.decidedAt), ne(actions.source, "autopilot")));
	const decisionSecs = decided.filter((x) => x.decided).map((x) => ((x.decided as Date).getTime() - x.created.getTime()) / 1000);
	// sparkline: disputes opened per day, last 14 days
	const since = new Date(Date.now() - 13 * 86_400_000);
	since.setUTCHours(0, 0, 0, 0);
	const opened = await db().select({ at: disputes.firstSeenAt, amt: disputes.amountMinor }).from(disputes).where(gte(disputes.firstSeenAt, since));
	const series = Array.from({ length: 14 }, (_, i) => {
		const day = new Date(since.getTime() + i * 86_400_000);
		const key = day.toISOString().slice(0, 10);
		return { day: key, disputes: opened.filter((o) => o.at.toISOString().slice(0, 10) === key).length };
	});
	const recent = await db().select().from(activity).orderBy(desc(activity.at)).limit(10);
	return {
		ownerName: settings.ownerName,
		storeName: settings.storeName,
		atRiskMinor: open.reduce((s, d) => s + d.amountMinor, 0),
		recoveredMinor,
		openDisputes: open.length,
		needsDecision: needs.length,
		needsList: needs.slice(0, 5),
		avgDecisionSeconds: decisionSecs.length ? Math.round(decisionSecs.reduce((a, b) => a + b, 0) / decisionSecs.length) : null,
		protectionCoveragePct: counted.length ? Math.round((protectedN / counted.length) * 100) : null,
		protection: {
			protected: protectedN,
			atRisk: counted.filter((o) => o.status === "at_risk").length,
			notEligible: counted.filter((o) => o.status === "not_eligible").length,
			awaiting: counted.filter((o) => o.status === "awaiting").length,
		},
		winRate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
		resolvedCount: won.length + lost.length,
		series,
		recentActivity: recent,
		currency: "USD",
	};
}

export async function getConnectionStatus() {
	const e = env();
	const [lastWebhook, pollerLast, heartbeat] = await Promise.all([
		kvGet<{ at: string; type: string; verified: boolean }>("webhook.last"),
		kvGet<{ at: string; found: number }>("poller.lastRun"),
		kvGet<{ at: string }>("worker.heartbeat"),
	]);
	let tokenOk: boolean | null = null;
	let tokenError: string | null = null;
	if (paypalConfigured()) {
		try {
			const { getAccessToken } = await import("./paypal/auth");
			await getAccessToken();
			tokenOk = true;
		} catch (err) {
			tokenOk = false;
			tokenError = err instanceof Error ? err.message : String(err);
		}
	}
	return {
		paypalConfigured: paypalConfigured(),
		paypalEnv: e.PAYPAL_API_BASE.includes("sandbox") ? "sandbox" : "live",
		tokenOk,
		tokenError,
		webhookId: e.PAYPAL_WEBHOOK_ID ?? null,
		webhookUrl: `${e.PUBLIC_BASE_URL}/webhooks/paypal`,
		lastWebhook: lastWebhook ?? null,
		pollerLastRun: pollerLast ?? null,
		workerHeartbeat: heartbeat ?? null,
		aiProvider: e.AI_PROVIDER,
		models:
			e.AI_PROVIDER === "anthropic"
				? { assess: e.ANTHROPIC_MODEL_ASSESS, cheap: e.ANTHROPIC_MODEL_CHEAP }
				: { assess: e.OPENAI_MODEL, cheap: e.OPENAI_MODEL },
		anthropicAvailable: Boolean(e.ANTHROPIC_API_KEY),
		labEnabled: e.LAB_ENABLED,
		workerMode: e.WORKER_MODE,
	};
}

export async function getSettingsDto() {
	const [settings, policies, connection] = await Promise.all([getSettings(), getPolicies(), getConnectionStatus()]);
	return { settings, policies, connection };
}

export async function recentWebhooks() {
	return db()
		.select({ id: webhookEvents.id, type: webhookEvents.type, verified: webhookEvents.verified, verifyDetail: webhookEvents.verifyDetail, receivedAt: webhookEvents.receivedAt, processedAt: webhookEvents.processedAt, error: webhookEvents.error })
		.from(webhookEvents)
		.orderBy(desc(webhookEvents.receivedAt))
		.limit(50);
}

export { OPEN_ACTION };
