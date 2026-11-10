import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { KpiTile } from "#/components/kpi-tile";
import { Money } from "#/components/money";
import { ACTOR_LABEL, ActorDot, SectionHeading } from "#/components/page";
import { MiniScore } from "#/components/score-meter";
import {
	DeadlineChip,
	LiveIndicator,
	ProtectionBadge,
	ReasonLabel,
} from "#/components/status";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { useFallbackInterval } from "#/hooks/use-live";
import { api, qk } from "#/lib/api";
import {
	formatDate,
	formatDuration,
	greeting,
	relativeTime,
} from "#/lib/format";
import { formatMoney } from "#/lib/money";
import type { getOverview, OrderRowDto } from "#/server/queries";
import { ErrorBox } from "./disputes.index";
import { ShipButton } from "./orders";

export const Route = createFileRoute("/app/")({ component: Overview });

type OverviewDto = Awaited<ReturnType<typeof getOverview>>;

function Overview() {
	const interval = useFallbackInterval();
	const q = useQuery({
		queryKey: qk.overview,
		queryFn: () => api<OverviewDto>("/api/overview"),
		refetchInterval: interval,
	});
	const orders = useQuery({
		queryKey: qk.orders,
		queryFn: () => api<{ rows: OrderRowDto[] }>("/api/orders"),
		refetchInterval: interval,
	});
	const d = q.data;
	const atRiskOrders = (orders.data?.rows ?? [])
		.filter((o) => o.protectionStatus === "at_risk")
		.slice(0, 3);

	return (
		<div className="mx-auto flex max-w-[1400px] flex-col gap-8 p-4 md:p-6">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="font-display text-[32px] font-medium leading-tight">
						{greeting()}, {d?.ownerName ?? "Maya"}
					</h1>
					<p className="mt-1 text-muted-foreground">
						{formatDate(new Date())} · {d?.storeName ?? "Kiln & Thread"}
					</p>
				</div>
				<LiveIndicator />
			</div>

			{q.isError && (
				<ErrorBox
					message={(q.error as Error).message}
					onRetry={() => q.refetch()}
				/>
			)}

			<section
				aria-label="Key numbers"
				className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4"
			>
				{!d ? (
					Array.from({ length: 4 }, (_, i) => (
						<Skeleton key={i} className="h-24" />
					))
				) : (
					<>
						<KpiTile
							label="At risk"
							value={formatMoney(d.atRiskMinor, d.currency)}
							hint={`${d.openDisputes} open dispute${d.openDisputes === 1 ? "" : "s"}`}
							spark={d.series.map((s) => s.disputes)}
						/>
						<KpiTile
							label="Recovered this month"
							value={formatMoney(d.recoveredMinor, d.currency)}
							hint={
								d.winRate != null
									? `${d.winRate}% win rate · ${d.resolvedCount} resolved`
									: "No resolved cases yet"
							}
						/>
						<KpiTile
							label="Needs your decision"
							value={d.needsDecision}
							hint={
								d.avgDecisionSeconds != null
									? `Avg. time to decide ${formatDuration(d.avgDecisionSeconds)}`
									: "Recommendations waiting"
							}
							to="/app/disputes"
						/>
						<KpiTile
							label="Protection coverage"
							value={
								d.protectionCoveragePct != null
									? `${d.protectionCoveragePct}%`
									: "—"
							}
							hint={`${d.protection.protected} protected · ${d.protection.atRisk} at risk`}
							to="/app/orders"
						/>
					</>
				)}
			</section>

			<div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
				<section className="min-w-0 lg:col-span-2" aria-labelledby="needs">
					<SectionHeading
						action={
							<Link
								to="/app/disputes"
								className="text-xs text-muted-foreground hover:text-foreground"
							>
								All disputes →
							</Link>
						}
					>
						<span id="needs">Needs your decision</span>
					</SectionHeading>
					{!d ? (
						<div className="space-y-3 pt-3">
							<Skeleton className="h-20" />
							<Skeleton className="h-20" />
						</div>
					) : d.needsList.length === 0 ? (
						<EmptyDesk />
					) : (
						<ul className="divide-y">
							{d.needsList.map((r) => (
								<li
									key={r.id}
									className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"
								>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
											<ReasonLabel reason={r.reason} className="font-medium" />
											<span className="text-muted-foreground">
												{r.buyer ?? "Buyer"}
											</span>
											<span className="font-mono text-xs text-muted-foreground">
												#{r.orderNumber ?? "—"}
											</span>
											<Money
												amountMinor={r.amountMinor}
												currency={r.currency}
											/>
											<DeadlineChip dueAt={r.dueAt} />
										</div>
										<p className="font-display text-lg sm:truncate">
											{r.headline ?? "Assessment in progress"}
										</p>
									</div>
									<div className="flex items-center gap-4">
										<MiniScore value={r.finalScore} className="w-32" />
										<Button asChild size="sm">
											<Link
												to="/app/disputes/$disputeId"
												params={{ disputeId: r.id }}
											>
												Review <ArrowRight className="size-3.5" />
											</Link>
										</Button>
									</div>
								</li>
							))}
						</ul>
					)}
				</section>

				<section aria-labelledby="prot">
					<SectionHeading
						action={
							<Link
								to="/app/orders"
								className="text-xs text-muted-foreground hover:text-foreground"
							>
								Orders →
							</Link>
						}
					>
						<span id="prot">Protection</span>
					</SectionHeading>
					{d ? (
						<ProtectionBar p={d.protection} />
					) : (
						<Skeleton className="mt-3 h-10" />
					)}
					<ul className="mt-4 space-y-3">
						{atRiskOrders.map((o) => (
							<li
								key={o.id}
								className="flex items-center justify-between gap-2 text-sm"
							>
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<span className="font-mono text-xs">#{o.number}</span>
										<ProtectionBadge
											status={o.protectionStatus}
											reasons={o.reasons}
										/>
									</div>
									<p className="truncate text-xs text-muted-foreground">
										{o.buyer ?? "—"} ·{" "}
										<Money amountMinor={o.amountMinor} currency={o.currency} />
									</p>
								</div>
								<ShipButton order={o} size="sm" />
							</li>
						))}
						{d && atRiskOrders.length === 0 && (
							<li className="text-sm text-muted-foreground">
								Every shipped order has tracking on file with PayPal.
							</li>
						)}
					</ul>
				</section>
			</div>

			<section aria-labelledby="recent">
				<SectionHeading>
					<span id="recent">Recent activity</span>
				</SectionHeading>
				{!d ? (
					<Skeleton className="mt-3 h-32" />
				) : d.recentActivity.length === 0 ? (
					<p className="py-6 text-sm text-muted-foreground">
						No activity yet. Buy something in the demo shop to get started.
					</p>
				) : (
					<ol className="divide-y">
						{d.recentActivity.map((a) => (
							<li key={a.id} className="flex items-start gap-3 py-2.5 text-sm">
								<ActorDot actor={a.actor} />
								<span className="w-24 shrink-0 text-xs text-muted-foreground">
									{ACTOR_LABEL[a.actor] ?? a.actor}
								</span>
								<span className="min-w-0 flex-1">
									{a.disputeId ? (
										<Link
											to="/app/disputes/$disputeId"
											params={{ disputeId: a.disputeId }}
											className="hover:underline"
										>
											{a.text}
										</Link>
									) : (
										a.text
									)}
								</span>
								<time
									className="shrink-0 font-mono text-xs text-muted-foreground tabular"
									dateTime={new Date(a.at).toISOString()}
									title={new Date(a.at).toLocaleString()}
								>
									{relativeTime(a.at)}
								</time>
							</li>
						))}
					</ol>
				)}
			</section>
		</div>
	);
}

function ProtectionBar({
	p,
}: {
	p: {
		protected: number;
		atRisk: number;
		notEligible: number;
		awaiting: number;
	};
}) {
	const total = p.protected + p.atRisk + p.notEligible + p.awaiting;
	if (!total)
		return (
			<p className="pt-3 text-sm text-muted-foreground">No paid orders yet.</p>
		);
	const seg = [
		{ k: "Protected", v: p.protected, c: "bg-won" },
		{ k: "Awaiting shipment", v: p.awaiting, c: "bg-muted-foreground/40" },
		{ k: "At risk", v: p.atRisk, c: "bg-score-mid" },
		{ k: "Not eligible", v: p.notEligible, c: "bg-lost" },
	].filter((s) => s.v > 0);
	return (
		<div className="pt-3">
			<div
				className="flex h-2.5 overflow-hidden rounded-full bg-muted"
				role="img"
				aria-label={seg.map((s) => `${s.k} ${s.v}`).join(", ")}
			>
				{seg.map((s) => (
					<span
						key={s.k}
						className={s.c}
						style={{ width: `${(s.v / total) * 100}%` }}
					/>
				))}
			</div>
			<ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
				{seg.map((s) => (
					<li key={s.k} className="flex items-center gap-1.5">
						<span className={`size-2 rounded-full ${s.c}`} />
						{s.k}{" "}
						<span className="font-mono tabular text-foreground">{s.v}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function EmptyDesk() {
	return (
		<div className="flex flex-col items-center gap-3 py-10 text-center">
			<svg
				viewBox="0 0 120 64"
				className="h-16 w-32 text-muted-foreground/60"
				aria-hidden
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
			>
				<path d="M8 52h104" />
				<rect x="30" y="22" width="44" height="30" rx="2" />
				<path d="M38 32h28M38 39h20" />
				<path d="M84 52V30c0-4 6-6 8-2l4 10" />
				<circle cx="92" cy="20" r="5" />
			</svg>
			<p className="font-display text-xl">Nothing needs you right now.</p>
			<p className="text-sm text-muted-foreground">
				New disputes are assessed automatically and land here.
			</p>
		</div>
	);
}
