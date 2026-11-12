import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowLeft,
	Check,
	Copy,
	ExternalLink,
	MoreHorizontal,
	ShieldX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	ActionProposal,
	ApproveDialog,
	errorText,
} from "#/components/case/action-proposal";
import { AgentChat } from "#/components/case/agent-chat";
import { EvidencePreview } from "#/components/case/evidence-preview";
import { FactChip } from "#/components/case/fact-chip";
import { CaseTimeline } from "#/components/case/timeline";
import { TraceViewer } from "#/components/case/trace-viewer";
import type {
	ActionDto,
	DisputeDetail,
	FactDto,
} from "#/components/case/types";
import { OutcomeCard, VerdictCard } from "#/components/case/verdict";
import { Money } from "#/components/money";
import { Avatar, Page } from "#/components/page";
import {
	DeadlineChip,
	ProtectionBadge,
	SimulatedTag,
	StatusBadge,
} from "#/components/status";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Skeleton } from "#/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { useFallbackInterval } from "#/hooks/use-live";
import { ApiError, api, post, qk } from "#/lib/api";
import { formatDateTime, stripFactRefs } from "#/lib/format";
import { normRel, REL_TO_ACTION, reasonLabel, stageLabel } from "#/lib/labels";
import { formatMoney } from "#/lib/money";
import { cn } from "#/lib/utils";
import { ErrorBox } from "./disputes.index";

export const Route = createFileRoute("/app/disputes/$disputeId")({
	component: CasePage,
});

const PENDING = new Set(["needs_approval", "proposed"]);
const SANDBOX_REL = new Set(["require-evidence", "adjudicate"]);

function CasePage() {
	const { disputeId } = Route.useParams();
	const qc = useQueryClient();
	const interval = useFallbackInterval();
	const q = useQuery({
		queryKey: qk.dispute(disputeId),
		queryFn: () => api<DisputeDetail>(`/api/disputes/${disputeId}`),
		refetchInterval: interval,
	});
	const [confirm, setConfirm] = useState<{
		action: ActionDto;
		edits: Record<string, unknown>;
	} | null>(null);
	const [focusId, setFocusId] = useState<string | null>(null);
	const [rawOpen, setRawOpen] = useState(false);
	const prevStatuses = useRef<Map<string, string>>(new Map());

	const d = q.data;
	const pending = useMemo(
		() =>
			(d?.actions ?? []).filter(
				(a) => PENDING.has(a.status) && a.assessmentId === d?.assessment?.id,
			),
		[d],
	);
	const visibleActions = useMemo(() => {
		if (!d) return [];
		const latest = d.assessment?.id;
		return d.actions
			.filter(
				(a) =>
					a.assessmentId === latest ||
					!["superseded", "rejected"].includes(a.status),
			)
			.filter((a) => a.status !== "superseded");
	}, [d]);

	// Toast when an action finishes (SSE refetch brings the new status).
	useEffect(() => {
		if (!d) return;
		for (const a of d.actions) {
			const prev = prevStatuses.current.get(a.id);
			if (prev && prev !== a.status) {
				if (a.status === "succeeded")
					toast.success("PayPal accepted the response", {
						description: a.paypalDebugId
							? `PayPal debug ID ${a.paypalDebugId}`
							: `via ${(a.response as { via?: string } | null)?.via ?? "PayPal API"}`,
					});
				if (a.status === "failed")
					toast.error("PayPal rejected the action", {
						description: `${errorText(a.error)}${(a.error as { debugId?: string } | null)?.debugId ? ` · debug ${(a.error as { debugId?: string }).debugId}` : ""}`,
					});
			}
			prevStatuses.current.set(a.id, a.status);
		}
	}, [d]);

	const approve = useMutation({
		mutationFn: ({
			action,
			edits,
		}: {
			action: ActionDto;
			edits: Record<string, unknown>;
		}) => post(`/api/actions/${action.id}/approve`, { params: edits }),
		onMutate: ({ action }) => {
			qc.setQueryData<DisputeDetail>(qk.dispute(disputeId), (old) =>
				old
					? {
							...old,
							actions: old.actions.map((a) =>
								a.id === action.id ? { ...a, status: "approved" } : a,
							),
						}
					: old,
			);
		},
		onError: (e: Error) => {
			toast.error("Couldn't approve", {
				description: `${e.message}${e instanceof ApiError && e.debugId ? ` · debug ${e.debugId}` : ""}`,
			});
			qc.invalidateQueries({ queryKey: qk.dispute(disputeId) });
		},
		onSettled: () => qc.invalidateQueries({ queryKey: qk.dispute(disputeId) }),
	});
	const reject = useMutation({
		mutationFn: (a: ActionDto) =>
			post(`/api/actions/${a.id}/reject`, { reason: "Rejected by merchant" }),
		onSuccess: () => qc.invalidateQueries({ queryKey: qk.dispute(disputeId) }),
		onError: (e: Error) =>
			toast.error("Couldn't reject", { description: e.message }),
	});
	const cancel = useMutation({
		mutationFn: (a: ActionDto) => post(`/api/actions/${a.id}/cancel`),
		onSuccess: () => {
			toast("Autopilot action undone");
			qc.invalidateQueries({ queryKey: qk.dispute(disputeId) });
		},
		onError: (e: Error) =>
			toast.error("Couldn't undo", { description: e.message }),
	});
	const reassess = useMutation({
		mutationFn: () => post(`/api/disputes/${disputeId}/assess`),
		onSuccess: () =>
			toast("Re-assessing", {
				description: "Counterclaim is rebuilding the case file.",
			}),
		onError: (e: Error) =>
			toast.error("Couldn't re-assess", { description: e.message }),
	});

	const requestApprove = useCallback(
		(action: ActionDto, edits: Record<string, unknown> = {}) =>
			setConfirm({ action, edits }),
		[],
	);

	// "a" approves the primary action (with the confirm dialog), DESIGN §14.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement;
			if (
				t.closest(
					"input, textarea, [contenteditable=true], [role=dialog], [role=alertdialog]",
				)
			)
				return;
			if (e.key === "a" && pending[0] && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				requestApprove(pending[0]);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [pending, requestApprove]);

	if (q.isError) {
		return (
			<div className="p-6">
				<ErrorBox
					message={(q.error as Error).message}
					onRetry={() => q.refetch()}
				/>
			</div>
		);
	}
	if (!d) return <CaseSkeleton />;
	const dispute = d.dispute;
	const facts = ((d.assessment?.facts as FactDto[] | null) ?? []) as FactDto[];
	const resolved = dispute.status === "RESOLVED";
	const busy = approve.isPending;

	return (
		<Page>
			<Link
				to="/app/disputes"
				className="inline-flex w-fit items-center gap-1.5 px-1 pt-1 text-[13px] text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="size-3.5" /> All disputes
			</Link>
			<div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
				{/* Right column first in DOM order on small screens: verdict stays on top */}
				<aside className="order-first flex min-w-0 flex-col gap-4 xl:sticky xl:top-4 xl:order-last xl:self-start">
					{resolved ? (
						<OutcomeCard detail={d} />
					) : (
						<VerdictCard
							detail={d}
							pending={pending}
							onPrimary={(a) => requestApprove(a)}
							onSelect={(a) => {
								setFocusId(a.id);
								document
									.getElementById(`action-${a.id}`)
									?.scrollIntoView({ behavior: "smooth", block: "center" });
							}}
							onReassess={() => reassess.mutate()}
						/>
					)}
					{visibleActions.length > 0 && (
						<div className="space-y-3">
							<h3 className="px-1 pt-2 text-[15px] font-semibold">
								Proposed actions
							</h3>
							{visibleActions.map((a) => (
								<div key={a.id} id={`action-${a.id}`}>
									<ActionProposal
										action={a}
										detail={d}
										highlight={focusId === a.id}
										requestApprove={requestApprove}
										onReject={(x) => reject.mutate(x)}
										onCancel={(x) => cancel.mutate(x)}
										busy={busy}
									/>
								</div>
							))}
						</div>
					)}
					<EvidencePreview detail={d} />
					{!resolved && <AgentChat disputeId={dispute.id} />}
				</aside>

				<section className="field min-w-0 p-5 md:p-6" aria-label="Case">
					<header className="flex flex-wrap items-start gap-4 pb-5">
						<Avatar name={d.order?.buyerName} className="size-11 text-sm" />
						<div className="min-w-0 flex-1">
							<h1 className="font-display text-[22px]">
								{reasonLabel(dispute.reason)} ·{" "}
								{formatMoney(dispute.amountMinor, dispute.currency)}
							</h1>
							<p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
								{d.order
									? `${d.order.buyerName ?? "Buyer"} · Order #${d.order.number}`
									: "No matching order"}
								<span aria-hidden>·</span>
								<CopyId id={dispute.id} />
								<span aria-hidden>·</span>
								{stageLabel(dispute.stage)}
							</p>
							<div className="mt-3 flex flex-wrap items-center gap-3">
								<StatusBadge
									status={dispute.status}
									outcome={dispute.outcome}
								/>
								<DeadlineChip
									dueAt={
										dispute.sellerResponseDueAt
											? String(dispute.sellerResponseDueAt)
											: null
									}
									resolved={resolved}
								/>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Button variant="outline" size="sm" asChild>
								<a
									href="https://www.sandbox.paypal.com/resolutioncenter"
									target="_blank"
									rel="noreferrer"
									className="gap-1.5"
								>
									Open in PayPal <ExternalLink className="size-3.5" />
								</a>
							</Button>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="icon"
										className="size-9"
										aria-label="More actions"
									>
										<MoreHorizontal className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										onClick={() => reassess.mutate()}
										disabled={resolved}
									>
										Re-assess
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => setRawOpen(true)}>
										View raw JSON
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</header>
					<Tabs defaultValue="timeline">
						<TabsList
							variant="line"
							className="no-scrollbar h-auto w-full justify-start gap-1.5 overflow-x-auto p-0"
						>
							{["Timeline", "Reasoning", "Order", "Trace", "PayPal"].map(
								(t) => (
									<TabsTrigger
										key={t}
										value={t.toLowerCase()}
										className="h-9 flex-none rounded-full border-0 bg-muted! px-4 text-[13.5px] font-normal text-muted-foreground shadow-none after:hidden hover:bg-accent/60! data-[state=active]:bg-accent! data-[state=active]:font-medium data-[state=active]:text-accent-foreground"
									>
										{t}
									</TabsTrigger>
								),
							)}
						</TabsList>
						<TabsContent value="timeline" className="pt-6">
							<CaseTimeline detail={d} />
						</TabsContent>
						<TabsContent value="reasoning" className="pt-6">
							<Reasoning detail={d} facts={facts} />
						</TabsContent>
						<TabsContent value="order" className="pt-6">
							<OrderTab detail={d} />
						</TabsContent>
						<TabsContent value="trace" className="pt-6">
							<h3 className="mb-4 font-display text-lg">
								How Counterclaim reached this
							</h3>
							<TraceViewer detail={d} />
						</TabsContent>
						<TabsContent value="paypal" className="pt-6">
							<PayPalLinks detail={d} />
						</TabsContent>
					</Tabs>
				</section>
			</div>

			<ApproveDialog
				pending={confirm}
				detail={d}
				onClose={() => setConfirm(null)}
				onConfirm={() => {
					if (confirm) approve.mutate(confirm);
					setConfirm(null);
				}}
			/>
			<Dialog open={rawOpen} onOpenChange={setRawOpen}>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>Raw PayPal dispute</DialogTitle>
					</DialogHeader>
					<pre className="max-h-[70vh] overflow-auto rounded-lg bg-muted p-4 tabular text-[11px]">
						{JSON.stringify(dispute.raw, null, 2)}
					</pre>
				</DialogContent>
			</Dialog>
		</Page>
	);
}

function CopyId({ id }: { id: string }) {
	const [done, setDone] = useState(false);
	return (
		<button
			type="button"
			className="group inline-flex items-center gap-1 tabular hover:text-foreground"
			onClick={() =>
				navigator.clipboard?.writeText(id).then(() => {
					setDone(true);
					setTimeout(() => setDone(false), 1200);
				})
			}
			aria-label="Copy dispute ID"
		>
			{id}
			{done ? (
				<Check className="size-3.5 text-won" />
			) : (
				<Copy className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
			)}
		</button>
	);
}

function Reasoning({
	detail,
	facts,
}: {
	detail: DisputeDetail;
	facts: FactDto[];
}) {
	const a = detail.assessment;
	if (!a)
		return (
			<p className="text-sm text-muted-foreground">Assessment in progress…</p>
		);
	const rubric =
		(a.rubric as
			| {
					label: string;
					earned: number;
					points: number;
					met: boolean;
					factIds: string[];
			  }[]
			| null) ?? [];
	return (
		<div className="space-y-12">
			<ol className="space-y-5">
				{(a.reasoning ?? []).map((r, i) => (
					<li key={r.point} className="flex gap-4">
						<span className="w-6 shrink-0 pt-0.5 font-display text-[22px] leading-none text-muted-foreground">
							{i + 1}
						</span>
						<p className="text-[15px] leading-relaxed">
							{stripFactRefs(r.point)}{" "}
							<span className="inline-flex flex-wrap gap-1 align-middle">
								{r.factIds.map((id) => (
									<FactChip key={id} id={id} facts={facts} />
								))}
							</span>
						</p>
					</li>
				))}
			</ol>
			{(a.risks?.length ?? 0) > 0 && (
				<div>
					<h4 className="eyebrow mb-4">Risks</h4>
					<ul className="space-y-2.5 text-sm text-muted-foreground">
						{a.risks?.map((r) => (
							<li key={r} className="flex gap-2">
								<AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-deadline" />
								{r}
							</li>
						))}
					</ul>
				</div>
			)}
			{(a.missing?.length ?? 0) > 0 && (
				<div>
					<h4 className="eyebrow mb-4">Missing evidence</h4>
					<ul className="list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
						{a.missing?.map((m) => (
							<li key={m}>{m}</li>
						))}
					</ul>
				</div>
			)}
			<div>
				<h4 className="eyebrow mb-4">Rule score · {a.rubricScore}/100</h4>
				<ul className="field py-2 text-sm">
					{rubric.map((r) => (
						<li key={r.label} className="flex items-center gap-4 px-5 py-2.5">
							<span
								className={cn(
									"w-8 tabular text-xs",
									r.earned > 0
										? "text-won"
										: r.earned < 0
											? "text-lost"
											: "text-muted-foreground",
								)}
							>
								{r.earned > 0 ? "+" : ""}
								{r.earned}
							</span>
							<span className={cn("flex-1", !r.met && "text-muted-foreground")}>
								{r.label}
							</span>
							<span className="flex gap-1">
								{r.factIds.map((id) => (
									<FactChip key={id} id={id} facts={facts} />
								))}
							</span>
						</li>
					))}
				</ul>
			</div>
			<div>
				<h4 className="eyebrow mb-4">Case file facts</h4>
				<ul className="space-y-2.5 text-sm">
					{facts.map((f) => (
						<li key={f.id} className="flex gap-4">
							<span className="w-8 shrink-0 tabular text-xs text-muted-foreground">
								{f.id}
							</span>
							<span className="flex-1">
								{f.text} {f.simulated && <SimulatedTag className="ml-1" />}
							</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

function addrLines(
	a?: {
		name?: string;
		line1?: string;
		line2?: string;
		city?: string;
		state?: string;
		postalCode?: string;
		countryCode?: string;
	} | null,
) {
	if (!a) return "—";
	return [
		a.name,
		a.line1,
		a.line2,
		[a.city, a.state, a.postalCode].filter(Boolean).join(" "),
		a.countryCode,
	]
		.filter(Boolean)
		.join("\n");
}

function OrderTab({ detail }: { detail: DisputeDetail }) {
	const o = detail.order;
	if (!o)
		return (
			<p className="text-sm text-muted-foreground">
				No matching order in the store for this PayPal transaction.
			</p>
		);
	const match =
		JSON.stringify(o.shippingAddress ?? {}) ===
			JSON.stringify(o.paypalShippingAddress ?? {}) || !o.shippingAddress;
	return (
		<div className="space-y-10 text-sm">
			<div className="flex flex-wrap items-center gap-3">
				<span className="font-display text-[28px]">Order #{o.number}</span>
				<ProtectionBadge
					status={o.protectionStatus}
					reasons={o.protectionReasons}
				/>
				{o.protectionStatus === "not_eligible" && (
					<Link
						to="/app/orders"
						className="inline-flex items-center gap-1 text-xs text-lost hover:underline"
					>
						<ShieldX className="size-3.5" /> Never protected: see Orders &amp;
						Protection
					</Link>
				)}
			</div>
			<table className="w-full">
				<thead>
					<tr className="text-left">
						<th className="eyebrow pb-3 font-medium">Item</th>
						<th className="eyebrow pb-3 text-right font-medium">Qty</th>
						<th className="eyebrow pb-3 text-right font-medium">Price</th>
					</tr>
				</thead>
				<tbody>
					{o.items.map((i) => (
						<tr key={i.title}>
							<td className="py-2">{i.title}</td>
							<td className="py-2 text-right tabular">{i.quantity}</td>
							<td className="py-2 text-right">
								<Money amountMinor={i.unitMinor} currency={o.currency} />
							</td>
						</tr>
					))}
					<tr className="border-t border-border/70">
						<td className="pt-3 font-medium">Total</td>
						<td />
						<td className="pt-3 text-right font-medium">
							<Money amountMinor={o.amountMinor} currency={o.currency} />
						</td>
					</tr>
				</tbody>
			</table>
			<div className="grid gap-8 sm:grid-cols-2">
				<div>
					<h4 className="eyebrow mb-3">Ship-to address</h4>
					<p className="whitespace-pre-line">{addrLines(o.shippingAddress)}</p>
				</div>
				<div>
					<h4 className="eyebrow mb-3">PayPal-confirmed address</h4>
					<p className="whitespace-pre-line">
						{addrLines(o.paypalShippingAddress)}
					</p>
					<p
						className={cn(
							"mt-1 inline-flex items-center gap-1 text-xs",
							match ? "text-won" : "text-lost",
						)}
					>
						{match ? (
							<>
								<Check className="size-3.5" /> Matches PayPal address
							</>
						) : (
							"Differs from PayPal address"
						)}
					</p>
				</div>
			</div>
			<dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[180px_1fr]">
				<dt className="text-muted-foreground">Buyer</dt>
				<dd>{o.buyerName ?? "—"}</dd>
				<dt className="text-muted-foreground">Paid</dt>
				<dd>{formatDateTime(o.capturedAt ? String(o.capturedAt) : null)}</dd>
				<dt className="text-muted-foreground">PayPal order ID</dt>
				<dd className="tabular text-xs">{o.paypalOrderId ?? "—"}</dd>
				<dt className="text-muted-foreground">Capture ID</dt>
				<dd className="tabular text-xs">{o.captureId ?? "—"}</dd>
				<dt className="text-muted-foreground">Shipment</dt>
				<dd>
					{detail.shipment ? (
						<span className="inline-flex flex-wrap items-center gap-2">
							{detail.shipment.carrier}{" "}
							<span className="tabular text-xs">
								{detail.shipment.trackingNumber}
							</span>
							{detail.shipment.simulated && <SimulatedTag />}
							<span className="text-xs text-muted-foreground">
								{detail.shipment.uploadedToPaypalAt
									? `uploaded to PayPal ${formatDateTime(String(detail.shipment.uploadedToPaypalAt))}`
									: "not uploaded to PayPal"}
							</span>
						</span>
					) : (
						"Not shipped"
					)}
				</dd>
			</dl>
		</div>
	);
}

function PayPalLinks({ detail }: { detail: DisputeDetail }) {
	const links = detail.dispute.links ?? [];
	return (
		<div className="space-y-6">
			<p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
				PayPal's API returns the actions it allows right now as HATEOAS links.
				Counterclaim's agent can only propose actions from this list, and the
				executor checks it again before sending anything.
			</p>
			<ul className="flex flex-wrap gap-2">
				{links.map((l) => {
					const action = REL_TO_ACTION[normRel(l.rel)];
					const sandbox = SANDBOX_REL.has(normRel(l.rel));
					return (
						<li
							key={l.rel + l.href}
							className={cn(
								"inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 tabular text-xs",
								action
									? "bg-accent text-accent-foreground"
									: sandbox
										? "bg-simulated-soft text-simulated"
										: "bg-muted text-muted-foreground",
							)}
						>
							{l.method && <span className="opacity-60">{l.method}</span>}
							{l.rel}
							{action && (
								<Check className="size-3" aria-label="agent may propose" />
							)}
						</li>
					);
				})}
			</ul>
			<p className="text-xs text-muted-foreground">
				<span className="mr-3 inline-flex items-center gap-1">
					<span className="size-2 rounded-full bg-primary" /> agent may propose
				</span>
				<span className="mr-3 inline-flex items-center gap-1">
					<span className="size-2 rounded-full bg-simulated" /> sandbox-only
					(Lab)
				</span>
				<span className="inline-flex items-center gap-1">
					<span className="size-2 rounded-full bg-muted-foreground" /> read-only
				</span>
			</p>
			<p className="text-xs text-muted-foreground">
				Last synced {formatDateTime(String(detail.dispute.updatedAt))}. Amount{" "}
				{formatMoney(detail.dispute.amountMinor, detail.dispute.currency)}.
			</p>
		</div>
	);
}

function CaseSkeleton() {
	return (
		<Page wide>
			<div className="space-y-4">
				<Skeleton className="h-4 w-48" />
				<Skeleton className="h-14 w-2/3 rounded-xl" />
			</div>
			<div className="grid gap-14 xl:grid-cols-[3fr_2fr]">
				<Skeleton className="h-80 rounded-xl" />
				<Skeleton className="h-72 rounded-2xl" />
			</div>
		</Page>
	);
}
