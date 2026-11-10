import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { qk } from "#/lib/api";

type Status = "connecting" | "live" | "reconnecting";
let status: Status = "connecting";
const subs = new Set<() => void>();
const setStatus = (s: Status) => {
	status = s;
	for (const f of subs) f();
};

/** SSE connection state for the LiveIndicator and the 30 s polling fallback. */
export function useLiveStatus(): Status {
	return useSyncExternalStore(
		(f) => {
			subs.add(f);
			return () => subs.delete(f);
		},
		() => status,
		() => "connecting" as Status,
	);
}

/** Polling fallback interval when SSE is down (DESIGN §13). */
export function useFallbackInterval(): number | false {
	return useLiveStatus() === "live" ? false : 30_000;
}

type Listener = (type: string, data: Record<string, unknown>) => void;
const listeners = new Set<Listener>();
export function onLiveEvent(fn: Listener): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/** One EventSource for the app; invalidates queries and raises toasts. Mount once in the app shell. */
export function useLiveEvents(navigateToDispute?: (id: string) => void) {
	const qc = useQueryClient();
	useEffect(() => {
		let es: EventSource | null = null;
		let retry: ReturnType<typeof setTimeout> | undefined;
		let closed = false;
		const types = [
			"dispute.updated",
			"assessment.ready",
			"assessment.started",
			"action.updated",
			"order.updated",
			"kpi.updated",
			"activity",
		];
		const connect = () => {
			es = new EventSource("/api/events");
			es.addEventListener("hello", () => setStatus("live"));
			es.onopen = () => setStatus("live");
			es.onerror = () => {
				setStatus("reconnecting");
				es?.close();
				if (!closed) retry = setTimeout(connect, 3000);
			};
			for (const t of types) {
				es.addEventListener(t, (ev) => {
					let data: Record<string, unknown> = {};
					try {
						data = JSON.parse((ev as MessageEvent).data);
					} catch {}
					handle(t, data);
					for (const l of listeners) l(t, data);
				});
			}
		};
		const handle = (t: string, d: Record<string, unknown>) => {
			const disputeId = d.disputeId as string | undefined;
			if (
				t === "dispute.updated" ||
				t === "assessment.ready" ||
				t === "assessment.started" ||
				t === "action.updated"
			) {
				qc.invalidateQueries({ queryKey: qk.disputes });
				qc.invalidateQueries({ queryKey: qk.overview });
				qc.invalidateQueries({ queryKey: qk.lab });
				if (disputeId)
					qc.invalidateQueries({ queryKey: qk.dispute(disputeId) });
			}
			if (t === "order.updated") {
				qc.invalidateQueries({ queryKey: qk.orders });
				qc.invalidateQueries({ queryKey: qk.overview });
				qc.invalidateQueries({ queryKey: qk.lab });
				qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "dispute" });
			}
			if (t === "kpi.updated" || t === "activity") {
				qc.invalidateQueries({ queryKey: qk.overview });
				if (disputeId)
					qc.invalidateQueries({ queryKey: qk.dispute(disputeId) });
			}
			if (t === "dispute.updated" && d.isNew && disputeId) {
				toast("New dispute", {
					description:
						"A buyer opened a dispute. Counterclaim is building the case.",
					action: navigateToDispute
						? { label: "Open", onClick: () => navigateToDispute(disputeId) }
						: undefined,
				});
			}
			if (t === "assessment.ready" && disputeId) {
				toast.success("Assessment ready", {
					description: "Counterclaim has a recommendation.",
					action: navigateToDispute
						? { label: "Review", onClick: () => navigateToDispute(disputeId) }
						: undefined,
				});
			}
		};
		connect();
		return () => {
			closed = true;
			clearTimeout(retry);
			es?.close();
		};
	}, [qc, navigateToDispute]);
}
