import { formatDateTime, formatExact, relativeTime } from "#/lib/format";
import { cn } from "#/lib/utils";
import { ACTOR_LABEL } from "../page";
import { SimulatedTag } from "../status";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import type { DisputeDetail } from "./types";

type Item = {
	key: string;
	at: string;
	actor: string;
	text: string;
	sub?: string;
	simulated?: boolean;
};

const ACTOR_COLOR: Record<string, string> = {
	buyer: "bg-deadline",
	merchant: "bg-foreground",
	paypal: "bg-review",
	agent: "bg-primary",
	simulated: "bg-simulated",
	system: "bg-muted-foreground",
};

export function buildTimeline(detail: DisputeDetail): Item[] {
	const items: Item[] = [];
	for (const a of detail.activity) {
		items.push({
			key: `a${a.id}`,
			at: String(a.at),
			actor: a.actor,
			text: a.text,
			simulated: a.actor === "simulated",
		});
	}
	for (const m of detail.messages) {
		items.push({
			key: `m${m.id}`,
			at: String(m.sentAt),
			actor: m.direction === "in" ? "buyer" : "merchant",
			text: m.direction === "in" ? "Buyer emailed the shop" : "You replied",
			sub: m.body,
		});
	}
	const raw = detail.dispute.raw as {
		messages?: { posted_by?: string; time_posted?: string; content?: string }[];
	};
	for (const [i, m] of (raw.messages ?? []).entries()) {
		if (!m.content || !m.time_posted) continue;
		const who =
			m.posted_by === "BUYER"
				? "buyer"
				: m.posted_by === "SELLER"
					? "merchant"
					: "paypal";
		items.push({
			key: `dm${i}`,
			at: m.time_posted,
			actor: who,
			text: `${who === "buyer" ? "Buyer" : who === "merchant" ? "You" : "PayPal"} wrote in the dispute`,
			sub: m.content,
		});
	}
	if (
		detail.order?.capturedAt &&
		!detail.activity.some((a) => a.kind === "order_captured")
	) {
		items.push({
			key: "captured",
			at: String(detail.order.capturedAt),
			actor: "buyer",
			text: `Order #${detail.order.number} paid via PayPal`,
		});
	}
	if (!detail.activity.some((a) => a.kind === "carrier_event")) {
		for (const e of detail.carrierEvents)
			items.push({
				key: `c${e.id}`,
				at: String(e.occurredAt),
				actor: "simulated",
				text: `${e.description} · ${e.location ?? ""}`,
				simulated: e.simulated,
			});
	}
	return items.sort(
		(a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
	);
}

export function CaseTimeline({ detail }: { detail: DisputeDetail }) {
	const items = buildTimeline(detail);
	if (!items.length)
		return <p className="py-6 text-sm text-muted-foreground">No events yet.</p>;
	return (
		<ol className="relative ml-1 border-l border-border/80 pl-6">
			{items.map((it) => (
				<li key={it.key} className="relative pb-6 last:pb-0">
					<span
						aria-hidden
						className={cn(
							"absolute -left-[29px] top-1.5 size-2.5 rounded-full ring-4 ring-background",
							ACTOR_COLOR[it.actor] ?? "bg-muted-foreground",
						)}
					/>
					<div className="flex flex-wrap items-baseline gap-x-2">
						<Tooltip>
							<TooltipTrigger asChild>
								<time
									className="font-mono text-xs text-muted-foreground tabular"
									dateTime={it.at}
								>
									{formatDateTime(it.at)}
								</time>
							</TooltipTrigger>
							<TooltipContent>
								{relativeTime(it.at)} · {formatExact(it.at)}
							</TooltipContent>
						</Tooltip>
						<span className="text-xs text-muted-foreground">
							{ACTOR_LABEL[it.actor] ?? it.actor}
						</span>
					</div>
					<p className="mt-1 text-[15px]">
						{it.text} {it.simulated && <SimulatedTag className="ml-1" />}
					</p>
					{it.sub && (
						<p className="mt-2 rounded-xl bg-card px-4 py-3 font-display text-[18px] leading-snug text-foreground/80">
							“{it.sub}”
						</p>
					)}
				</li>
			))}
		</ol>
	);
}
