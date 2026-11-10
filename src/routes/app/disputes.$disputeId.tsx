import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangle,
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
import {
	DeadlineChip,
	ProtectionBadge,
	ReasonLabel,
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
import { normRel, REL_TO_ACTION, stageLabel } from "#/lib/labels";
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
						description: `${(a.error as { message?: string } | null)?.message ?? ""}${(a.error as { debugId?: string } | null)?.debugId ? ` · debug ${(a.error as { debugId?: string }).debugId}` : ""}`,
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
		<div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
			{/* Header strip */}
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-4">
				<CopyId id={dispute.id} />
				<StatusBadge status={dispute.status} outcome={dispute.outcome} />
				<span className="text-xs text-muted-foreground">
					{stageLabel(dispute.stage)}
				</span>
				<ReasonLabel reason={dispute.reason} className="text-sm" />
				<Money
					amountMinor={dispute.amountMinor}
					currency={dispute.currency}
					emphasis
				/>
				<DeadlineChip
					dueAt={
						dispute.sellerResponseDueAt
							? String(dispute.sellerResponseDueAt)
							: null
					}
					resolved={resolved}
				/>
				<div className="ml-auto flex items-center gap-1">
					<Button variant="ghost" size="sm" asChild>
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
								variant="ghost"
								size="icon"
								className="size-8"
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
			</div>

			<div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
				{/* Right column first in DOM order on small screens: verdict stays on top */}
				<aside className="order-first space-y-4 xl:sticky xl:top-16 xl:order-last xl:self-start">
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
							<h3 className="eyebrow">Proposed actions</h3>
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

				<div className="min-w-0">
					<Tabs defaultValue="timeline">
						<TabsList className="w-full justify-start overflow-x-auto">
							<TabsTrigger value="timeline">Timeline</TabsTrigger>
							<TabsTrigger value="reasoning">Reasoning</TabsTrigger>
							<TabsTrigger value="order">Order</TabsTrigger>
							<TabsTrigger value="trace">Trace</TabsTrigger>
							<TabsTrigger value="paypal">PayPal</TabsTrigger>
						</TabsList>
						<TabsContent value="timeline" className="pt-4">
							<CaseTimeline detail={d} />
						</TabsContent>
						<TabsContent value="reasoning" className="pt-4">
							<Reasoning detail={d} facts={facts} />
						</TabsContent>
						<TabsContent value="order" className="pt-4">
							<OrderTab detail={d} />
						</TabsContent>
						<TabsContent value="trace" className="pt-4">
							<h3 className="mb-3 font-display text-xl">
								How Counterclaim reached this
							</h3>
							<TraceViewer detail={d} />
						</TabsContent>
						<TabsContent value="paypal" className="pt-4">
							<PayPalLinks detail={d} />
						</TabsContent>
					</Tabs>
				</div>
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
					<pre className="max-h-[70vh] overflow-auto rounded bg-muted p-3 font-mono text-[11px]">
						{JSON.stringify(dispute.raw, null, 2)}
					</pre>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function CopyId({ id }: { id: string }) {
	const [done, setDone] = useState(false);
	return (
		<button
			type="button"
			className="group inline-flex items-center gap-1.5 font-mono text-sm"
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
		<div className="space-y-6">
			<ol className="space-y-3">
				{(a.reasoning ?? []).map((r, i) => (
					<li key={r.point} className="flex gap-3">
						<span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-xs text-accent-foreground">
							{i + 1}
						</span>
						<p className="text-sm leading-relaxed">
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
					<h4 className="eyebrow mb-2">Risks</h4>
					<ul className="space-y-1.5 text-sm text-muted-foreground">
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
					<h4 className="eyebrow mb-2">Missing evidence</h4>
					<ul className="list-inside list-disc text-sm text-muted-foreground">
						{a.missing?.map((m) => (
							<li key={m}>{m}</li>
						))}
					</ul>
				</div>
			)}
			<div>
				<h4 className="eyebrow mb-2">Rule score · {a.rubricScore}/100</h4>
				<ul className="divide-y rounded-md border text-sm">
					{rubric.map((r) => (
						<li key={r.label} className="flex items-center gap-3 px-3 py-2">
							<span
								className={cn(
									"font-mono text-xs tabular",
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
				<h4 className="eyebrow mb-2">Case file facts</h4>
				<ul className="space-y-1.5 text-sm">
					{facts.map((f) => (
						<li key={f.id} className="flex gap-2">
							<span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
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
		<div className="space-y-6 text-sm">
			<div className="flex flex-wrap items-center gap-3">
				<span className="font-display text-xl">Order #{o.number}</span>
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
					<tr className="border-b text-left text-xs text-muted-foreground">
						<th className="py-2 font-medium">Item</th>
						<th className="py-2 text-right font-medium">Qty</th>
						<th className="py-2 text-right font-medium">Price</th>
					</tr>
				</thead>
				<tbody>
					{o.items.map((i) => (
						<tr key={i.title} className="border-b">
							<td className="py-2">{i.title}</td>
							<td className="py-2 text-right font-mono tabular">
								{i.quantity}
							</td>
							<td className="py-2 text-right">
								<Money amountMinor={i.unitMinor} currency={o.currency} />
							</td>
						</tr>
					))}
					<tr>
						<td className="py-2 font-medium">Total</td>
						<td />
						<td className="py-2 text-right font-medium">
							<Money amountMinor={o.amountMinor} currency={o.currency} />
						</td>
					</tr>
				</tbody>
			</table>
			<div className="grid gap-6 sm:grid-cols-2">
				<div>
					<h4 className="eyebrow mb-1">Ship-to address</h4>
					<p className="whitespace-pre-line">{addrLines(o.shippingAddress)}</p>
				</div>
				<div>
					<h4 className="eyebrow mb-1">PayPal-confirmed address</h4>
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
			<dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[180px_1fr]">
				<dt className="text-muted-foreground">Buyer</dt>
				<dd>{o.buyerName ?? "—"}</dd>
				<dt className="text-muted-foreground">Paid</dt>
				<dd>{formatDateTime(o.capturedAt ? String(o.capturedAt) : null)}</dd>
				<dt className="text-muted-foreground">PayPal order ID</dt>
				<dd className="font-mono text-xs">{o.paypalOrderId ?? "—"}</dd>
				<dt className="text-muted-foreground">Capture ID</dt>
				<dd className="font-mono text-xs">{o.captureId ?? "—"}</dd>
				<dt className="text-muted-foreground">Shipment</dt>
				<dd>
					{detail.shipment ? (
						<span className="inline-flex flex-wrap items-center gap-2">
							{detail.shipment.carrier}{" "}
							<span className="font-mono text-xs">
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
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
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
								"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs",
								action
									? "border-primary/40 bg-accent text-accent-foreground"
									: sandbox
										? "border-simulated/40 bg-simulated-soft text-simulated"
										: "text-muted-foreground",
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
		<div className="mx-auto grid max-w-[1400px] gap-6 p-6 xl:grid-cols-[3fr_2fr]">
			<div className="space-y-3">
				<Skeleton className="h-8 w-2/3" />
				<Skeleton className="h-64" />
			</div>
			<div className="space-y-3">
				<Skeleton className="h-56" />
				<Skeleton className="h-40" />
			</div>
		</div>
	);
}
