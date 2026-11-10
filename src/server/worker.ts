import { and, eq, isNull } from "drizzle-orm";
import { db, sql } from "./db/client";
import { jobs } from "./db/schema";
import { paypalConfigured } from "./env";
import { claimJob, completeJob, enqueue, failJob, type Job, pruneJobs } from "./jobs/queue";
import { kvSet } from "./kv";
import { log } from "./log";
import { processWebhook } from "./paypal/webhooks";
import { refreshProtection } from "./protection";
import { pollDisputes, syncDispute } from "./sync/disputes";

const POLL_EVERY_MS = 60_000;
const PROTECTION_EVERY_MS = 5 * 60_000;

async function handle(job: Job): Promise<void> {
	switch (job.kind) {
		case "process_webhook":
			return processWebhook(job.refId as string);
		case "sync_dispute":
			await syncDispute(job.refId as string, { reason: job.payload?.reason as string | undefined });
			return;
		case "assess": {
			const { runAssessment } = await import("./agent/assess");
			await runAssessment(job.refId as string);
			return;
		}
		case "execute_action": {
			const { executeAction } = await import("./executor");
			await executeAction(job.refId as string);
			return;
		}
		case "protection_scan":
			await refreshProtection();
			await enqueue("protection_scan", { runAfter: new Date(Date.now() + PROTECTION_EVERY_MS) });
			return;
		case "poll_disputes":
			try {
				if (paypalConfigured()) await pollDisputes();
			} finally {
				// self-rescheduling every 60 s, even after a failure
				await enqueue("poll_disputes", { runAfter: new Date(Date.now() + POLL_EVERY_MS) });
			}
			return;
		default:
			throw new Error(`Unknown job kind ${job.kind}`);
	}
}

/** Make sure exactly one pending self-rescheduling job of `kind` exists. */
async function ensureRecurring(kind: "poll_disputes" | "protection_scan") {
	const pending = await db()
		.select({ id: jobs.id })
		.from(jobs)
		.where(and(eq(jobs.kind, kind), isNull(jobs.doneAt)))
		.limit(1);
	if (!pending.length) await enqueue(kind);
}

const g = globalThis as unknown as { __ccWorker?: boolean };

/** Start the job loop (500 ms tick + NOTIFY wake-ups). Safe to call once per process. */
export async function startWorker(): Promise<void> {
	if (g.__ccWorker) return;
	g.__ccWorker = true;
	await ensureRecurring("poll_disputes");
	await ensureRecurring("protection_scan");
	log.info({ paypal: paypalConfigured() }, "worker started");

	let wake: (() => void) | null = null;
	await sql().listen("cc_jobs", () => wake?.());

	let lastPrune = 0;
	for (;;) {
		let job: Job | null = null;
		try {
			job = await claimJob();
		} catch (err) {
			log.error({ err }, "claim failed");
		}
		if (job) {
			const started = Date.now();
			try {
				await handle(job);
				await completeJob(job.id);
				log.info({ job: { id: job.id, kind: job.kind, ref: job.refId, ms: Date.now() - started } }, "job done");
			} catch (err) {
				log.error({ job: { id: job.id, kind: job.kind, ref: job.refId, attempt: job.attempts }, err }, "job failed");
				await failJob(job, err).catch(() => {});
			}
			continue;
		}
		if (Date.now() - lastPrune > 3_600_000) {
			lastPrune = Date.now();
			await pruneJobs().catch(() => {});
			await kvSet("worker.heartbeat", { at: new Date().toISOString() }).catch(() => {});
		}
		await new Promise<void>((resolve) => {
			const t = setTimeout(resolve, 500);
			wake = () => {
				clearTimeout(t);
				resolve();
			};
		});
		wake = null;
	}
}
