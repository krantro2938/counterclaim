import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { KpiTile } from "#/components/kpi-tile";
import { Money } from "#/components/money";
import {
	ACTOR_LABEL,
	ActorDot,
	Page,
	PageHeader,
	SectionHeading,
} from "#/components/page";
import { MiniScore } from "#/components/score-meter";
import {
	DeadlineChip,
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
		<Page>
			<PageHeader
				eyebrow={`${formatDate(new Date())} · ${d?.storeName ?? "Kiln & Thread"}`}
				title={`${greeting()}, ${d?.ownerName ?? "Maya"}.`}
				subtitle={
					d
						? d.needsDecision
							? `${d.needsDecision} case${d.needsDecision === 1 ? "" : "s"} waiting for your decision. Everything else is handled.`
							: "Nothing needs you right now. Counterclaim is watching."
						: undefined
				}
			/>

			{q.isError && (
				<ErrorBox
					message={(q.error as Error).message}
					onRetry={() => q.refetch()}
				/>
			)}

			<section
				aria-label="Key numbers"
				className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4"
			>
				{!d ? (
					Array.from({ length: 4 }, (_, i) => (
						<Skeleton key={i} className="h-28 rounded-xl" />
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

			<div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-10">
				<section className="min-w-0 lg:col-span-2" aria-labelledby="needs">
					<SectionHeading
						action={
							<Link
								to="/app/disputes"
								className="text-[13px] text-muted-foreground hover:text-foreground"
							>
								All disputes →
							</Link>
						}
					>
						<span id="needs">Needs your decision</span>
					</SectionHeading>
					{!d ? (
						<div className="space-y-3">
							<Skeleton className="h-28 rounded-xl" />
							<Skeleton className="h-28 rounded-xl" />
						</div>
					) : d.needsList.length === 0 ? (
						<EmptyDesk />
					) : (
						<ul className="space-y-3">
							{d.needsList.map((r) => (
								<li
									key={r.id}
									className="field flex flex-col gap-5 p-6 sm:flex-row sm:items-center"
								>
									<div className="min-w-0 flex-1 space-y-2.5">
										<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
											<ReasonLabel reason={r.reason} className="font-medium" />
											<span className="text-muted-foreground">
												{r.buyer ?? "Buyer"} · #{r.orderNumber ?? "—"}
											</span>
											<Money
												amountMinor={r.amountMinor}
												currency={r.currency}
											/>
											<DeadlineChip dueAt={r.dueAt} />
										</div>
										<p className="font-display text-[26px] leading-tight">
											{r.headline ?? "Assessment in progress"}
										</p>
									</div>
									<div className="flex items-center gap-5">
										<MiniScore value={r.finalScore} className="w-32" />
										<Button asChild>
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

				<section aria-labelledby="prot" className="min-w-0">
					<SectionHeading
						action={
							<Link
								to="/app/orders"
								className="text-[13px] text-muted-foreground hover:text-foreground"
							>
								Orders →
							</Link>
						}
					>
						<span id="prot">Protection</span>
					</SectionHeading>
					<div className="field p-6">
						{d ? (
							<ProtectionBar p={d.protection} />
						) : (
							<Skeleton className="h-10" />
						)}
						<ul className="mt-6 space-y-4">
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
											<Money
												amountMinor={o.amountMinor}
												currency={o.currency}
											/>
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
					</div>
				</section>
			</div>

			<section aria-labelledby="recent">
				<SectionHeading>
					<span id="recent">Recent activity</span>
				</SectionHeading>
				{!d ? (
					<Skeleton className="h-32 rounded-xl" />
				) : d.recentActivity.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No activity yet. Buy something in the demo shop to get started.
					</p>
				) : (
					<ol className="space-y-1">
						{d.recentActivity.map((a) => (
							<li
								key={a.id}
								className="-mx-3 flex items-start gap-4 rounded-lg px-3 py-2.5 text-sm hover:bg-muted/60"
							>
								<ActorDot actor={a.actor} />
								<span className="hidden w-28 shrink-0 text-muted-foreground sm:block">
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
		</Page>
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
		return <p className="text-sm text-muted-foreground">No paid orders yet.</p>;
	const seg = [
		{ k: "Protected", v: p.protected, c: "bg-won" },
		{ k: "Awaiting shipment", v: p.awaiting, c: "bg-muted-foreground/40" },
		{ k: "At risk", v: p.atRisk, c: "bg-score-mid" },
		{ k: "Not eligible", v: p.notEligible, c: "bg-lost" },
	].filter((s) => s.v > 0);
	return (
		<div>
			<div
				className="flex h-2 gap-0.5 overflow-hidden rounded-full"
				role="img"
				aria-label={seg.map((s) => `${s.k} ${s.v}`).join(", ")}
			>
				{seg.map((s) => (
					<span
						key={s.k}
						className={`rounded-full ${s.c}`}
						style={{ flexGrow: s.v }}
					/>
				))}
			</div>
			<ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
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
		<div className="field flex flex-col items-center gap-3 px-6 py-14 text-center">
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
			<p className="font-display text-[28px]">Nothing needs you right now.</p>
			<p className="text-sm text-muted-foreground">
				New disputes are assessed automatically and land here.
			</p>
		</div>
	);
}
