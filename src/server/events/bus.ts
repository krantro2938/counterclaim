import { sql } from "../db/client";
import { log } from "../log";

export type CcEvent =
	| {
			type: "dispute.updated";
			disputeId: string;
			status?: string;
			isNew?: boolean;
	  }
	| { type: "assessment.ready"; disputeId: string; assessmentId: number }
	| { type: "assessment.started"; disputeId: string }
	| {
			type: "action.updated";
			disputeId: string;
			actionId: string;
			status: string;
	  }
	| { type: "order.updated"; orderId: string; number?: number }
	| { type: "kpi.updated" }
	| { type: "activity"; text: string; disputeId?: string };

const CHANNEL = "cc_events";

/** Publish an event to every web process (NOTIFY cc_events). Never throws. */
export async function publish(event: CcEvent): Promise<void> {
	try {
		await sql().notify(CHANNEL, JSON.stringify(event));
	} catch (err) {
		log.warn({ err, event }, "notify failed");
	}
}

type Listener = (e: CcEvent) => void;
const g = globalThis as unknown as {
	__ccListeners?: Set<Listener>;
	__ccListening?: Promise<void>;
};

/** Subscribe in-process to cc_events (one LISTEN connection per process, fanned out). */
export function subscribe(fn: Listener): () => void {
	if (!g.__ccListeners) g.__ccListeners = new Set();
	g.__ccListeners.add(fn);
	if (!g.__ccListening) {
		g.__ccListening = sql()
			.listen(CHANNEL, (payload) => {
				let event: CcEvent;
				try {
					event = JSON.parse(payload) as CcEvent;
				} catch {
					return;
				}
				for (const l of g.__ccListeners ?? []) {
					try {
						l(event);
					} catch (err) {
						log.warn({ err }, "listener failed");
					}
				}
			})
			.then(() => log.info("listening on cc_events"))
			.catch((err) => {
				log.error({ err }, "LISTEN failed");
				g.__ccListening = undefined;
			});
	}
	return () => {
		g.__ccListeners?.delete(fn);
	};
}
