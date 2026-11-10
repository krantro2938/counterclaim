import { and, sql as dsql, eq, isNull } from "drizzle-orm";
import { db, sql } from "../db/client";
import { jobs } from "../db/schema";

export type JobKind =
	| "process_webhook"
	| "sync_dispute"
	| "assess"
	| "execute_action"
	| "protection_scan"
	| "poll_disputes";

export type Job = typeof jobs.$inferSelect;

/**
 * Enqueue a job. With `dedupe`, a pending job of the same kind+ref is reused instead of
 * adding a duplicate (e.g. many webhooks for one dispute → one sync).
 */
export async function enqueue(
	kind: JobKind,
	opts: {
		refId?: string;
		payload?: Record<string, unknown>;
		runAfter?: Date;
		dedupe?: boolean;
	} = {},
): Promise<number> {
	if (opts.dedupe && opts.refId) {
		const existing = await db()
			.select({ id: jobs.id })
			.from(jobs)
			.where(
				and(
					eq(jobs.kind, kind),
					eq(jobs.refId, opts.refId),
					isNull(jobs.doneAt),
					isNull(jobs.lockedAt),
				),
			)
			.limit(1);
		if (existing[0]) return existing[0].id;
	}
	const [row] = await db()
		.insert(jobs)
		.values({
			kind,
			refId: opts.refId,
			payload: opts.payload ?? {},
			runAfter: opts.runAfter ?? new Date(),
		})
		.returning({ id: jobs.id });
	await sql().notify("cc_jobs", kind);
	return row.id;
}

/** Claim one due job (FOR UPDATE SKIP LOCKED). Stale locks (> 5 min) are reclaimed. */
export async function claimJob(): Promise<Job | null> {
	const rows = await sql()<Job[]>`
		update jobs set locked_at = now(), attempts = attempts + 1
		where id = (
			select id from jobs
			where done_at is null
			  and run_after <= now()
			  and (locked_at is null or locked_at < now() - interval '5 minutes')
			  and attempts < max_attempts
			order by run_after, id
			for update skip locked
			limit 1
		)
		returning id, kind, ref_id as "refId", payload, run_after as "runAfter", attempts,
		          max_attempts as "maxAttempts", locked_at as "lockedAt", done_at as "doneAt",
		          last_error as "lastError", created_at as "createdAt"`;
	return rows[0] ?? null;
}

export async function completeJob(id: number): Promise<void> {
	await db()
		.update(jobs)
		.set({ doneAt: new Date(), lockedAt: null })
		.where(eq(jobs.id, id));
}

export async function failJob(
	job: Job,
	error: unknown,
	retryInMs = 10_000,
): Promise<void> {
	const message =
		error instanceof Error ? `${error.name}: ${error.message}` : String(error);
	const final = job.attempts >= job.maxAttempts;
	await db()
		.update(jobs)
		.set({
			lastError: message.slice(0, 2000),
			lockedAt: null,
			doneAt: final ? new Date() : null,
			runAfter: final
				? job.runAfter
				: new Date(Date.now() + retryInMs * job.attempts),
		})
		.where(eq(jobs.id, job.id));
}

/** Delete finished jobs older than a day (housekeeping). */
export async function pruneJobs(): Promise<void> {
	await db()
		.delete(jobs)
		.where(dsql`done_at is not null and done_at < now() - interval '1 day'`);
}
