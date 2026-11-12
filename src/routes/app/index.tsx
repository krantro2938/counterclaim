import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ChevronRight,
	FlaskConical,
	Gavel,
	ShieldAlert,
	SlidersHorizontal,
	Truck,
} from "lucide-react";
import { KpiTile } from "#/components/kpi-tile";
import { Money } from "#/components/money";
import {
	ACTOR_LABEL,
	ActorDot,
	Avatar,
	Card,
	Page,
	PageHeader,
} from "#/components/page";
import { MiniScore } from "#/components/score-meter";
import { DeadlineChip, ReasonLabel } from "#/components/status";
import { Skeleton } from "#/components/ui/skeleton";
import { useFallbackInterval } from "#/hooks/use-live";
import { api, qk } from "#/lib/api";
import { formatDate, greeting, relativeTime } from "#/lib/format";
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
				title={`${greeting()}, ${d?.ownerName ?? "Maya"}`}
			/>

			{q.isError && (
				<ErrorBox
					message={(q.error as Error).message}
					onRetry={() => q.refetch()}
				/>
			)}

			<div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
				<div className="flex min-w-0 flex-col gap-4">
					<section
						aria-label="Key numbers"
						className="grid grid-cols-2 gap-3 sm:gap-4 2xl:grid-cols-4"
					>
						{!d ? (
							Array.from({ length: 4 }, (_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
								<Skeleton key={i} className="h-[120px] rounded-2xl" />
							))
						) : (
							<>
								<KpiTile
									label="At risk"
									value={formatMoney(d.atRiskMinor, d.currency)}
									badge={`${d.openDisputes} open`}
									badgeTone={d.openDisputes ? "deadline" : "muted"}
									hint="in open disputes"
								/>
								<KpiTile
									label="Recovered"
									value={formatMoney(d.recoveredMinor, d.currency)}
									badge={d.winRate != null ? `${d.winRate}% won` : undefined}
									badgeTone="won"
									hint={
										d.resolvedCount
											? `${d.resolvedCount} resolved this month`
											: "this month"
									}
								/>
								<KpiTile
									label="Needs you"
									value={d.needsDecision}
									badge={d.needsDecision ? "Review" : undefined}
									badgeTone="deadline"
									hint="recommendations waiting"
									to="/app/disputes"
								/>
								<KpiTile
									label="Protected"
									value={
										d.protectionCoveragePct != null
											? `${d.protectionCoveragePct}%`
											: "—"
									}
									badge={
										d.protection.atRisk
											? `${d.protection.atRisk} at risk`
											: undefined
									}
									badgeTone="lost"
									hint={`${d.protection.protected} orders covered`}
									to="/app/orders"
								/>
							</>
						)}
					</section>

					<Card
						id="needs"
						title="Needs your decision"
						action={
							<Link
								to="/app/disputes"
								className="text-[13px] font-medium text-primary hover:underline"
							>
								See all
							</Link>
						}
					>
						{!d ? (
							<div className="space-y-2">
								<Skeleton className="h-16 rounded-xl" />
								<Skeleton className="h-16 rounded-xl" />
							</div>
						) : d.needsList.length === 0 ? (
							<EmptyDesk />
						) : (
							<div className="-mx-2">
								<div className="hidden grid-cols-[minmax(160px,1.1fr)_minmax(0,2fr)_90px_110px_120px_96px] gap-4 px-3 pb-2 text-xs text-muted-foreground lg:grid">
									<span>Buyer</span>
									<span>Recommendation</span>
									<span className="text-right">Amount</span>
									<span>Due</span>
									<span>Win likelihood</span>
									<span />
								</div>
								<ul>
									{d.needsList.map((r) => (
										<li key={r.id}>
											<Link
												to="/app/disputes/$disputeId"
												params={{ disputeId: r.id }}
												className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-3 transition-colors hover:bg-muted lg:grid-cols-[minmax(160px,1.1fr)_minmax(0,2fr)_90px_110px_120px_96px] lg:gap-4"
											>
												<span className="flex min-w-0 items-center gap-3">
													<Avatar name={r.buyer} />
													<span className="hidden min-w-0 lg:block">
														<span className="block truncate font-medium">
															{r.buyer ?? "Buyer"}
														</span>
														<span className="block text-xs text-muted-foreground">
															#{r.orderNumber ?? "—"}
														</span>
													</span>
												</span>
												<span className="min-w-0">
													<span className="line-clamp-2 font-medium leading-snug">
														{r.headline ?? "Assessment in progress"}
													</span>
													<ReasonLabel
														reason={r.reason}
														className="text-xs text-muted-foreground"
													/>
												</span>
												<Money
													amountMinor={r.amountMinor}
													currency={r.currency}
													className="text-right"
												/>
												<DeadlineChip
													dueAt={r.dueAt}
													className="col-start-2 lg:col-start-auto"
												/>
												<MiniScore value={r.finalScore} />
												<span className="hidden h-9 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium lg:inline-flex">
													Review
												</span>
											</Link>
										</li>
									))}
								</ul>
							</div>
						)}
					</Card>

					<Card id="recent" title="Recent activity">
						{!d ? (
							<Skeleton className="h-32 rounded-xl" />
						) : d.recentActivity.length === 0 ? (
							<p className="text-muted-foreground">
								No activity yet. Buy something in the demo shop to get started.
							</p>
						) : (
							<ol className="-mx-2">
								{d.recentActivity.map((a) => (
									<li
										key={a.id}
										className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-muted"
									>
										<ActorDot actor={a.actor} />
										<span className="hidden w-24 shrink-0 text-muted-foreground sm:block">
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
											className="shrink-0 text-xs text-muted-foreground tabular"
											dateTime={new Date(a.at).toISOString()}
											title={new Date(a.at).toLocaleString()}
										>
											{relativeTime(a.at)}
										</time>
									</li>
								))}
							</ol>
						)}
					</Card>
				</div>

				<div className="flex min-w-0 flex-col gap-4">
					<Card
						id="prot"
						title="Protection"
						action={
							<Link
								to="/app/orders"
								className="text-[13px] font-medium text-primary hover:underline"
							>
								See all
							</Link>
						}
					>
						{d ? (
							<ProtectionBar p={d.protection} />
						) : (
							<Skeleton className="h-10" />
						)}
						<ul className="mt-4 space-y-1">
							{atRiskOrders.map((o) => (
								<li
									key={o.id}
									className="flex items-center gap-3 rounded-2xl bg-muted px-3.5 py-3"
								>
									<ShieldAlert className="size-4 shrink-0 text-deadline" />
									<div className="min-w-0 flex-1">
										<p className="font-medium">Order #{o.number}</p>
										<p className="truncate text-xs text-muted-foreground">
											{o.buyer ?? "—"} ·{" "}
											<Money
												amountMinor={o.amountMinor}
												currency={o.currency}
											/>{" "}
											· not shipped
										</p>
									</div>
									<ShipButton order={o} size="sm" />
								</li>
							))}
							{d && atRiskOrders.length === 0 && (
								<li className="text-muted-foreground">
									Every shipped order has tracking on file with PayPal.
								</li>
							)}
						</ul>
					</Card>

					<AskCard needs={d?.needsDecision ?? 0} />
				</div>
			</div>
		</Page>
	);
}

/** Calm entry points into the agent's work, in the style of an assistant card. */
function AskCard({ needs }: { needs: number }) {
	const tiles = [
		{
			to: "/app/disputes",
			Icon: Gavel,
			tint: "bg-deadline-soft text-deadline",
			label: needs
				? `Review ${needs} recommendation${needs === 1 ? "" : "s"}`
				: "Browse disputes",
		},
		{
			to: "/app/orders",
			Icon: Truck,
			tint: "bg-won-soft text-won",
			label: "Protect unshipped orders",
		},
		{
			to: "/app/settings",
			Icon: SlidersHorizontal,
			tint: "bg-review-soft text-review",
			label: "Tune autopilot",
		},
		{
			to: "/app/lab",
			Icon: FlaskConical,
			tint: "bg-simulated-soft text-simulated",
			label: "Sandbox controls",
		},
	];
	return (
		<section className="rounded-[28px] bg-gradient-to-b from-sage/80 to-card p-5 sm:p-6 dark:from-sage/50 dark:to-card">
			<p className="text-center text-muted-foreground">
				Counterclaim is watching
			</p>
			<h2 className="mt-1 text-center font-display text-[22px]">
				What should we look at?
			</h2>
			<div className="mt-5 grid grid-cols-2 gap-2">
				{tiles.map((t) => (
					<Link
						key={t.to}
						to={t.to}
						className="group flex min-h-24 flex-col justify-between gap-3 rounded-2xl bg-card p-3.5 transition-colors hover:bg-accent/60"
					>
						<span
							className={`flex size-7 items-center justify-center rounded-lg ${t.tint}`}
						>
							<t.Icon className="size-3.5" />
						</span>
						<span className="flex items-end justify-between gap-1 text-[13px] font-medium leading-snug">
							{t.label}
							<ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
						</span>
					</Link>
				))}
			</div>
		</section>
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
						{s.k} <span className="tabular text-foreground">{s.v}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function EmptyDesk() {
	return (
		<div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
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
			<p className="font-display text-lg">Nothing needs you right now.</p>
			<p className="text-sm text-muted-foreground">
				New disputes are assessed automatically and land here.
			</p>
		</div>
	);
}
