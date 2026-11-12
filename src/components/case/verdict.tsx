import { Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ChevronDown,
	Loader2,
	ShieldX,
	Trophy,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatDuration } from "#/lib/format";
import { actionLabel, OUTCOME_CODE_LABELS } from "#/lib/labels";
import { formatMoney } from "#/lib/money";
import { cn } from "#/lib/utils";
import { ScoreMeter } from "../score-meter";
import { Button } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Skeleton } from "../ui/skeleton";
import type { ActionDto, DisputeDetail } from "./types";

export function primaryLabel(a: ActionDto, currency: string): string {
	const amt =
		typeof a.params.amountMinor === "number"
			? formatMoney(a.params.amountMinor as number, currency)
			: null;
	switch (a.type) {
		case "provide_evidence":
			return "Fight with tracking evidence";
		case "make_offer":
			return `Offer a ${amt ?? ""} partial refund`.replace("  ", " ");
		case "accept_claim":
			return a.params.acceptClaimType === "PARTIAL_REFUND" && amt
				? `Accept with ${amt} refund`
				: "Accept and refund";
		case "send_message":
			return "Send message to buyer";
		case "escalate":
			return "Escalate to PayPal";
		default:
			return actionLabel(a.type);
	}
}

export function VerdictCard({
	detail,
	pending,
	onPrimary,
	onSelect,
	onReassess,
}: {
	detail: DisputeDetail;
	pending: ActionDto[];
	onPrimary: (a: ActionDto) => void;
	onSelect: (a: ActionDto) => void;
	onReassess: () => void;
}) {
	const a = detail.assessment;
	const cur = detail.dispute.currency;
	if (!a) {
		return (
			<section className="field space-y-4 p-6" aria-busy>
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Counterclaim is building
					the case file and assessing…
				</div>
				<Skeleton className="h-7 w-4/5" />
				<Skeleton className="h-12" />
				<Skeleton className="h-10 w-1/2" />
			</section>
		);
	}
	const primary = pending[0];
	return (
		<section
			className="space-y-5 rounded-[28px] bg-gradient-to-b from-sage to-card p-6 dark:from-sage/60 dark:to-card"
			aria-label="Verdict"
		>
			<p className="text-muted-foreground">Counterclaim recommends</p>
			{a.degraded && (
				<div className="flex items-start gap-2 rounded-lg bg-deadline-soft px-3 py-2 text-xs text-deadline">
					<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
					AI assessment unavailable; showing the rule-based score.
				</div>
			)}
			<div className="flex items-start justify-between gap-2">
				<h2 className="-mt-3 font-display text-[22px] leading-snug">
					{a.headline}
				</h2>
				{detail.assessmentRunning && (
					<Loader2
						className="mt-1 size-4 shrink-0 animate-spin text-muted-foreground"
						aria-label="Re-assessing"
					/>
				)}
			</div>
			<ScoreMeter
				final={a.finalScore}
				rubric={a.rubricScore}
				llm={a.llmScore}
			/>
			{primary?.type === "accept_claim" && (
				<p className="text-sm leading-relaxed text-muted-foreground">
					Fighting would likely still lose{" "}
					{formatMoney(detail.dispute.amountMinor, cur)} plus a{" "}
					{formatMoney(detail.fees.disputeFeeMinor, cur)} dispute fee. Accepting
					now takes about a minute instead of ~
					{detail.fees.minutesPerManualCase} minutes of evidence gathering.
				</p>
			)}
			{detail.order?.protectionStatus === "not_eligible" && (
				<Link
					to="/app/orders"
					className="flex items-center gap-2 rounded-lg bg-lost-soft px-3.5 py-2.5 text-sm text-lost hover:underline"
				>
					<ShieldX className="size-4 shrink-0" />
					Order #{detail.order.number} was never protected: no tracking reached
					PayPal before the dispute. See Orders &amp; Protection →
				</Link>
			)}
			{primary ? (
				<div className="flex flex-wrap gap-2.5">
					<Button
						size="lg"
						className="flex-1 justify-center"
						onClick={() => onPrimary(primary)}
						disabled={detail.assessmentRunning}
					>
						{primaryLabel(primary, cur)}
						<kbd className="ml-2 hidden rounded-md bg-primary-foreground/10 px-1.5 tabular text-[10px] sm:inline">
							A
						</kbd>
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="lg" variant="outline" className="gap-1">
								Other options <ChevronDown className="size-3.5" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-60">
							{pending.slice(1).map((p) => (
								<DropdownMenuItem key={p.id} onClick={() => onSelect(p)}>
									{primaryLabel(p, cur)}
								</DropdownMenuItem>
							))}
							<DropdownMenuItem onClick={onReassess}>
								Re-assess with latest data
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					{detail.dispute.status === "RESOLVED"
						? "This case is closed."
						: "No action needed from you right now. PayPal has the next move."}
				</p>
			)}
			<p className="text-xs text-muted-foreground/90">
				{a.confidence
					? `${a.confidence[0].toUpperCase()}${a.confidence.slice(1)} confidence · `
					: ""}
				{a.degraded ? "rules only" : `rules 60% + AI 40%`} ·{" "}
				{a.model ?? "rubric"} ·{" "}
				{a.latencyMs != null ? `${(a.latencyMs / 1000).toFixed(1)} s` : ""}
			</p>
		</section>
	);
}

function useCountUp(target: number, ms = 600) {
	const [v, setV] = useState(0);
	useEffect(() => {
		if (
			typeof window === "undefined" ||
			matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			setV(target);
			return;
		}
		const t0 = performance.now();
		let raf = 0;
		const tick = (t: number) => {
			const p = Math.min(1, (t - t0) / ms);
			const eased = 1 - (1 - p) ** 3;
			setV(Math.round(target * eased));
			if (p < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [target, ms]);
	return v;
}

/** Resolved state: the one celebration (DESIGN §11). */
export function OutcomeCard({ detail }: { detail: DisputeDetail }) {
	const d = detail.dispute;
	const won = d.outcome === "won";
	const lost = d.outcome === "lost";
	const amount = useCountUp(won ? d.amountMinor : 0);
	const created = d.createTime ?? d.firstSeenAt;
	const responseSecs = d.firstResponseAt
		? (new Date(d.firstResponseAt).getTime() -
				new Date(d.firstSeenAt).getTime()) /
			1000
		: null;
	return (
		<section
			className={cn(
				"relative overflow-hidden rounded-[28px] p-6",
				won ? "bg-gradient-to-b from-won-soft to-card" : "bg-card",
			)}
			aria-label="Outcome"
		>
			<div className="flex items-center gap-2 text-sm">
				{won ? <Trophy className="size-4 text-won" /> : null}
				<span
					className={cn(
						"font-medium",
						won ? "text-won" : lost ? "text-lost" : "text-muted-foreground",
					)}
				>
					{won ? "Won" : lost ? "Lost" : "Closed"}
				</span>
				<span className="text-muted-foreground">
					· {OUTCOME_CODE_LABELS[d.outcomeCode ?? ""] ?? d.outcomeCode ?? ""}
				</span>
			</div>
			<p
				className={cn(
					"mt-3 font-display text-[32px] leading-none tabular",
					won ? "text-won" : lost ? "text-lost" : "",
				)}
			>
				{won
					? `${formatMoney(amount, d.currency)} recovered`
					: lost
						? `${formatMoney(d.amountMinor, d.currency)} refunded`
						: formatMoney(d.amountMinor, d.currency)}
			</p>
			<dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
				<div>
					<dt className="text-xs text-muted-foreground">
						Time from dispute to response
					</dt>
					<dd className="tabular">{formatDuration(responseSecs)}</dd>
				</div>
				<div>
					<dt className="text-xs text-muted-foreground">Opened</dt>
					<dd className="tabular text-xs">
						{new Date(created).toLocaleString()}
					</dd>
				</div>
			</dl>
		</section>
	);
}
