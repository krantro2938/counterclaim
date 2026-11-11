import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, FlaskConical, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Money } from "#/components/money";
import { Page, PageHeader, SectionHeading } from "#/components/page";
import { ProtectionBadge, StatusBadge } from "#/components/status";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { ApiError, api, post, qk } from "#/lib/api";
import { relativeTime } from "#/lib/format";
import { hasRel, reasonLabel, stageLabel } from "#/lib/labels";
import type { OrderRowDto } from "#/server/queries";
import { ErrorBox } from "./disputes.index";

export const Route = createFileRoute("/app/lab")({ component: LabPage });

type LabDto = {
	disputes: {
		id: string;
		status: string;
		stage: string | null;
		reason: string;
		amountMinor: number;
		currency: string;
		links: { rel: string }[];
		outcome: string | null;
		orderId: string | null;
	}[];
	shipments: {
		id: string;
		orderId: string;
		carrier: string;
		trackingNumber: string;
		events: string[];
	}[];
	orders: OrderRowDto[];
	webhooks: {
		id: string;
		type: string;
		verified: boolean;
		verifyDetail: string | null;
		receivedAt: string;
		processedAt: string | null;
		error: string | null;
	}[];
};

function useLabAction() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			path,
			body,
		}: {
			path: string;
			body?: unknown;
			label: string;
		}) => post<{ debugId?: string }>(path, body),
		onSuccess: (r, v) => {
			toast.success(v.label, {
				description: r?.debugId ? `PayPal debug ID ${r.debugId}` : undefined,
			});
			qc.invalidateQueries({ queryKey: qk.lab });
			qc.invalidateQueries({ queryKey: qk.disputes });
			qc.invalidateQueries({ queryKey: qk.orders });
		},
		onError: (e: Error, v) =>
			toast.error(`${v.label} failed`, {
				description: `${e.message}${e instanceof ApiError && e.debugId ? ` · debug ${e.debugId}` : ""}`,
			}),
	});
}

function LabPage() {
	const q = useQuery({
		queryKey: qk.lab,
		queryFn: () => api<LabDto>("/api/lab/overview"),
		refetchInterval: 15_000,
	});
	const act = useLabAction();
	const run = (path: string, label: string, body?: unknown) =>
		act.mutate({ path, label, body });
	const has = (d: LabDto["disputes"][number], rel: string) =>
		hasRel(d.links, rel) ||
		((rel === "require-evidence" || rel === "adjudicate") &&
			d.status === "UNDER_REVIEW");

	return (
		<Page>
			<PageHeader
				eyebrow={
					<span className="inline-flex items-center gap-1.5 text-simulated">
						<FlaskConical className="size-3.5" /> Sandbox only
					</span>
				}
				title="Sandbox controls"
			/>
			<div className="rounded-[28px] bg-simulated-soft p-6">
				<p className="max-w-3xl text-sm leading-relaxed">
					These call sandbox-only PayPal endpoints (
					<span className="tabular text-xs">require-evidence</span>,{" "}
					<span className="tabular text-xs">adjudicate</span>) or local
					simulators (carrier scans, demo inbox). They stand in for time passing
					and for PayPal's reviewers.
				</p>
				<div className="mt-5 flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="outline"
						onClick={() => run("/api/lab/sync", "Sync queued")}
						className="gap-1.5 bg-card"
					>
						<RefreshCw className="size-3.5" /> Sync now
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button size="sm" variant="outline" className="bg-card">
								Reset demo data
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Reset demo data?</AlertDialogTitle>
								<AlertDialogDescription>
									Clears assessments, actions, activity and the local dispute
									cache. Orders, products and policies stay. Disputes re-sync
									from PayPal within a minute and are assessed again. Nothing is
									changed in PayPal.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									onClick={() => run("/api/lab/reset", "Demo data reset")}
								>
									Reset
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>

			{q.isError && (
				<ErrorBox
					message={(q.error as Error).message}
					onRetry={() => q.refetch()}
				/>
			)}

			<section className="field min-w-0 p-5 sm:p-6">
				<SectionHeading>Disputes</SectionHeading>
				{!q.data ? (
					<Skeleton className="mt-3 h-32" />
				) : q.data.disputes.length === 0 ? (
					<p className="py-4 text-sm text-muted-foreground">
						No disputes yet. Open one as the buyer in the PayPal sandbox
						Resolution Center.
					</p>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Dispute</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Reason</TableHead>
									<TableHead className="text-right">Amount</TableHead>
									<TableHead>PayPal allows</TableHead>
									<TableHead className="text-right">Controls</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{q.data.disputes.map((d) => (
									<TableRow key={d.id}>
										<TableCell>
											<Link
												to="/app/disputes/$disputeId"
												params={{ disputeId: d.id }}
												className="tabular text-xs hover:underline"
											>
												{d.id}
											</Link>
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												<StatusBadge status={d.status} outcome={d.outcome} />
												<span className="text-xs text-muted-foreground">
													{stageLabel(d.stage)}
												</span>
											</div>
										</TableCell>
										<TableCell>{reasonLabel(d.reason)}</TableCell>
										<TableCell className="text-right">
											<Money
												amountMinor={d.amountMinor}
												currency={d.currency}
											/>
										</TableCell>
										<TableCell className="max-w-64">
											<div className="flex flex-wrap gap-1">
												{d.links
													.filter((l) => l.rel !== "self")
													.map((l) => (
														<span
															key={l.rel}
															className="rounded bg-muted px-1.5 py-0.5 tabular text-[11px]"
														>
															{l.rel}
														</span>
													))}
											</div>
										</TableCell>
										<TableCell className="text-right">
											<div className="flex justify-end gap-1">
												<Button
													size="sm"
													variant="ghost"
													onClick={() =>
														run(
															`/api/lab/disputes/${d.id}/sync`,
															"Dispute re-synced",
														)
													}
												>
													Sync
												</Button>
												<Button
													size="sm"
													variant="outline"
													disabled={!has(d, "escalate")}
													onClick={() =>
														run(
															`/api/lab/disputes/${d.id}/escalate`,
															"Escalated to claim",
														)
													}
												>
													Escalate
												</Button>
												<Button
													size="sm"
													variant="outline"
													disabled={!has(d, "require-evidence")}
													onClick={() =>
														run(
															`/api/lab/disputes/${d.id}/require-evidence`,
															"Seller evidence requested",
															{ action: "SELLER_EVIDENCE" },
														)
													}
												>
													Require evidence
												</Button>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															size="sm"
															variant="outline"
															disabled={!has(d, "adjudicate")}
														>
															Adjudicate
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onClick={() =>
																run(
																	`/api/lab/disputes/${d.id}/adjudicate`,
																	"Adjudicated: seller",
																	{ outcome: "SELLER_FAVOR" },
																)
															}
														>
															Seller wins
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																run(
																	`/api/lab/disputes/${d.id}/adjudicate`,
																	"Adjudicated: buyer",
																	{ outcome: "BUYER_FAVOR" },
																)
															}
														>
															Buyer wins
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</section>

			<section className="field min-w-0 p-5 sm:p-6">
				<SectionHeading>Orders: demo inbox &amp; carrier</SectionHeading>
				{!q.data ? (
					<Skeleton className="mt-3 h-32" />
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Order</TableHead>
									<TableHead>Buyer</TableHead>
									<TableHead className="text-right">Amount</TableHead>
									<TableHead>Protection</TableHead>
									<TableHead>Carrier (simulated)</TableHead>
									<TableHead className="text-right">Demo inbox</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{q.data.orders.map((o) => {
									const s = q.data?.shipments.find((x) => x.orderId === o.id);
									const delivered = s?.events.includes("delivered");
									return (
										<TableRow key={o.id}>
											<TableCell className="tabular text-xs">
												#{o.number}
											</TableCell>
											<TableCell>{o.buyer ?? "—"}</TableCell>
											<TableCell className="text-right">
												<Money
													amountMinor={o.amountMinor}
													currency={o.currency}
												/>
											</TableCell>
											<TableCell>
												<ProtectionBadge
													status={o.protectionStatus}
													reasons={o.reasons}
												/>
											</TableCell>
											<TableCell>
												{s ? (
													<div className="flex items-center gap-2">
														<span className="text-xs text-muted-foreground">
															{s.events.at(-1)?.replace(/_/g, " ") ??
																"label pending"}
														</span>
														<Button
															size="sm"
															variant="ghost"
															disabled={delivered}
															onClick={() =>
																run(
																	`/api/lab/carrier/${s.id}/advance`,
																	"Carrier advanced",
																)
															}
														>
															Advance
														</Button>
														<Button
															size="sm"
															variant="ghost"
															disabled={delivered}
															onClick={() =>
																run(
																	`/api/lab/carrier/${s.id}/advance?to=delivered`,
																	"Marked delivered",
																)
															}
														>
															Deliver
														</Button>
													</div>
												) : (
													<span className="text-xs text-muted-foreground">
														Not shipped
													</span>
												)}
											</TableCell>
											<TableCell className="text-right">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button size="sm" variant="outline">
															Seed messages
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onClick={() =>
																run(
																	`/api/lab/orders/${o.id}/story`,
																	"Inbox seeded",
																	{ story: "delivered" },
																)
															}
														>
															"When will it arrive?"
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																run(
																	`/api/lab/orders/${o.id}/story`,
																	"Inbox seeded",
																	{ story: "glaze" },
																)
															}
														>
															"Glaze looks different"
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																run(
																	`/api/lab/orders/${o.id}/story`,
																	"Inbox cleared",
																	{ story: "silent" },
																)
															}
														>
															No contact
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				)}
			</section>

			<section className="field min-w-0 p-5 sm:p-6">
				<SectionHeading>Webhook log (last 50)</SectionHeading>
				{!q.data ? (
					<Skeleton className="mt-3 h-24" />
				) : q.data.webhooks.length === 0 ? (
					<p className="py-4 text-sm text-muted-foreground">
						No webhooks received yet. The 60-second poller keeps disputes in
						sync regardless.
					</p>
				) : (
					<ul className="space-y-0.5 text-sm">
						{q.data.webhooks.map((w) => (
							<li
								key={w.id}
								className="-mx-3 flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/60"
							>
								{w.verified ? (
									<Check className="size-4 text-won" aria-label="Verified" />
								) : (
									<X className="size-4 text-lost" aria-label="Not verified" />
								)}
								<span className="tabular text-xs">{w.type}</span>
								<span className="hidden truncate text-xs text-muted-foreground md:inline">
									{w.verifyDetail}
								</span>
								<span className="ml-auto text-xs text-muted-foreground">
									{relativeTime(w.receivedAt)}
								</span>
							</li>
						))}
					</ul>
				)}
			</section>
		</Page>
	);
}
