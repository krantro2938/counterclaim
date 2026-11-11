import {
	CheckCircle2,
	FileText,
	Gavel,
	HandCoins,
	Loader2,
	MessageSquare,
	Undo2,
	XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ACTION_ENDPOINT } from "#/lib/labels";
import { formatMoney, toMinor } from "#/lib/money";
import { cn } from "#/lib/utils";
import { Pill } from "../status";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import type { ActionDto, DisputeDetail } from "./types";
import { primaryLabel } from "./verdict";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
	provide_evidence: FileText,
	make_offer: HandCoins,
	accept_claim: Undo2,
	send_message: MessageSquare,
	escalate: Gavel,
};

/** What an approval will do in PayPal, in human words (DESIGN §12). */
export function effectText(
	a: { type: string; params: Record<string, unknown> },
	detail: DisputeDetail,
): string {
	const cur = detail.dispute.currency;
	const amt =
		typeof a.params.amountMinor === "number"
			? formatMoney(a.params.amountMinor as number, cur)
			: formatMoney(detail.dispute.amountMinor, cur);
	const s = detail.shipment;
	switch (a.type) {
		case "provide_evidence":
			return `Sends ${String(a.params.evidenceType ?? "PROOF_OF_FULFILLMENT")} to PayPal${s && a.params.includeTracking !== false ? ` with tracking ${s.carrier} ${s.trackingNumber}` : ""}${a.params.includePdf !== false ? " and the evidence PDF" : ""}.`;
		case "make_offer":
			return `Offers the buyer a ${amt} refund (${String(
				a.params.offerType ?? "REFUND",
			)
				.replace(/_/g, " ")
				.toLowerCase()}). They keep the item; if they accept, the case closes.`;
		case "accept_claim":
			return `Accepts the claim and refunds ${a.params.acceptClaimType === "PARTIAL_REFUND" ? amt : formatMoney(detail.dispute.amountMinor, cur)} to the buyer. The case closes.`;
		case "send_message":
			return "Posts this message to the buyer in the PayPal dispute thread.";
		case "escalate":
			return "Asks PayPal to review the case as a claim.";
		default:
			return a.type;
	}
}

export function ActionProposal({
	action,
	detail,
	highlight,
	requestApprove,
	onReject,
	onCancel,
	busy,
}: {
	action: ActionDto;
	detail: DisputeDetail;
	highlight?: boolean;
	requestApprove: (a: ActionDto, edits?: Record<string, unknown>) => void;
	onReject: (a: ActionDto) => void;
	onCancel: (a: ActionDto) => void;
	busy: boolean;
}) {
	const Icon = ICON[action.type] ?? FileText;
	const p = action.params as Record<string, unknown>;
	const editable =
		action.status === "needs_approval" ||
		action.status === "proposed" ||
		action.status === "failed";
	const textKey =
		action.type === "send_message"
			? "message"
			: action.type === "provide_evidence"
				? "notes"
				: "note";
	const [text, setText] = useState(String(p[textKey] ?? ""));
	const [amount, setAmount] = useState(
		typeof p.amountMinor === "number"
			? ((p.amountMinor as number) / 100).toFixed(2)
			: "",
	);
	const [amountErr, setAmountErr] = useState<string | null>(null);
	const ref = useRef<HTMLDivElement>(null);
	const paramsKey = `${action.id}:${JSON.stringify(action.params)}`;
	// Reset local edits only when the proposal itself changes (not on every SSE refetch).
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the serialized params
	useEffect(() => {
		setText(String(p[textKey] ?? ""));
		setAmount(
			typeof p.amountMinor === "number"
				? ((p.amountMinor as number) / 100).toFixed(2)
				: "",
		);
	}, [paramsKey, textKey]);

	const edits = (): Record<string, unknown> | null => {
		const e: Record<string, unknown> = {};
		if (text !== String(p[textKey] ?? "")) e[textKey] = text;
		if ("amountMinor" in p || action.type === "make_offer") {
			try {
				const m = toMinor(amount.replace(/[$,\s]/g, "") || "0");
				if (m <= 0) throw new Error("Enter an amount");
				if (m > detail.dispute.amountMinor)
					throw new Error(
						`At most ${formatMoney(detail.dispute.amountMinor, detail.dispute.currency)}`,
					);
				if (m !== p.amountMinor) e.amountMinor = m;
				setAmountErr(null);
			} catch (err) {
				setAmountErr((err as Error).message);
				return null;
			}
		}
		return e;
	};

	const status = action.status;
	return (
		<div
			ref={ref}
			className={cn(
				"field space-y-4 p-5 transition-shadow",
				highlight && "ring-2 ring-primary/30",
			)}
		>
			<div className="flex items-start gap-3">
				<span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
					<Icon className="size-4" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-[15px] font-medium">
							{primaryLabel(action, detail.dispute.currency)}
						</p>
						{action.source === "autopilot" && (
							<Pill tone="primary">Autopilot</Pill>
						)}
						{action.source === "merchant" && (
							<Pill tone="muted">Edited by you</Pill>
						)}
						<StatusPill status={status} />
					</div>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						{effectText(
							{
								type: action.type,
								params: {
									...p,
									amountMinor: amount
										? Math.round(Number(amount) * 100)
										: p.amountMinor,
								},
							},
							detail,
						)}
					</p>
				</div>
			</div>

			{action.type !== "accept_claim" ||
			p.acceptClaimType === "PARTIAL_REFUND" ||
			text ? (
				<div className="space-y-1.5">
					<Label
						htmlFor={`t-${action.id}`}
						className="text-xs text-muted-foreground"
					>
						{action.type === "send_message"
							? "Message to buyer"
							: action.type === "provide_evidence"
								? "Notes for PayPal's reviewer"
								: "Note"}
					</Label>
					<Textarea
						id={`t-${action.id}`}
						value={text}
						onChange={(e) => setText(e.target.value)}
						rows={action.type === "send_message" ? 4 : 3}
						disabled={!editable || busy}
						maxLength={2000}
						className="text-sm"
					/>
				</div>
			) : null}
			{("amountMinor" in p || action.type === "make_offer") && (
				<div className="space-y-1.5">
					<Label
						htmlFor={`a-${action.id}`}
						className="text-xs text-muted-foreground"
					>
						Amount (max{" "}
						{formatMoney(detail.dispute.amountMinor, detail.dispute.currency)})
					</Label>
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground">$</span>
						<Input
							id={`a-${action.id}`}
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							inputMode="decimal"
							className="w-32 tabular"
							disabled={!editable || busy}
							aria-invalid={Boolean(amountErr)}
						/>
						{amountErr && (
							<span className="text-xs text-lost">{amountErr}</span>
						)}
					</div>
				</div>
			)}
			{action.rationale && (
				<p className="text-xs text-muted-foreground">Why: {action.rationale}</p>
			)}
			<p className="tabular text-[11px] text-muted-foreground">
				{ACTION_ENDPOINT[action.type]}
			</p>

			{status === "failed" && action.error ? (
				<div
					role="alert"
					className="rounded-lg bg-lost-soft px-4 py-3 text-sm text-lost"
				>
					<p className="font-medium">
						{String((action.error as { name?: string }).name ?? "Failed")}
					</p>
					<p>{String((action.error as { message?: string }).message ?? "")}</p>
					{(action.error as { debugId?: string }).debugId && (
						<p className="tabular text-xs">
							PayPal debug ID {(action.error as { debugId?: string }).debugId}
						</p>
					)}
				</div>
			) : null}
			{(status === "executing" || status === "approved") &&
				action.decidedAt &&
				Date.now() - new Date(action.decidedAt).getTime() > 120_000 && (
					<p
						role="status"
						className="rounded-lg bg-deadline-soft px-4 py-3 text-sm text-deadline"
					>
						Outcome unknown: PayPal hasn't confirmed this yet. Check the dispute
						in PayPal before trying again; Counterclaim never re-sends
						automatically.
					</p>
				)}
			{status === "succeeded" && (
				<p className="flex items-center gap-1.5 text-sm text-won">
					<CheckCircle2 className="size-4" /> Accepted by PayPal
					{action.paypalDebugId ? (
						<span className="tabular text-xs text-muted-foreground">
							{" "}
							· debug {action.paypalDebugId}
						</span>
					) : null}
				</p>
			)}

			{editable && (
				<div className="flex flex-wrap gap-2">
					<Button
						onClick={() => {
							const e = edits();
							if (e) requestApprove(action, e);
						}}
						disabled={busy}
					>
						{status === "failed" ? "Retry as a new action" : "Approve"}
					</Button>
					{status !== "failed" && (
						<Button
							variant="ghost"
							onClick={() => onReject(action)}
							disabled={busy}
						>
							Reject
						</Button>
					)}
				</div>
			)}
			{status === "auto_scheduled" && (
				<div className="flex items-center gap-2 text-sm">
					<span className="text-muted-foreground">
						Sends automatically{" "}
						{action.executeAfter
							? `at ${new Date(action.executeAfter).toLocaleTimeString()}`
							: "soon"}
						.
					</span>
					<Button size="sm" variant="outline" onClick={() => onCancel(action)}>
						Undo
					</Button>
				</div>
			)}
		</div>
	);
}

function StatusPill({ status }: { status: string }) {
	switch (status) {
		case "approved":
		case "executing":
			return (
				<span className="inline-flex items-center gap-1 text-xs text-review">
					<Loader2 className="size-3 animate-spin" /> Sending to PayPal…
				</span>
			);
		case "succeeded":
			return <Pill tone="won">Sent</Pill>;
		case "failed":
			return <Pill tone="lost">Failed</Pill>;
		case "rejected":
			return (
				<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
					<XCircle className="size-3" /> Rejected
				</span>
			);
		case "cancelled":
			return <Pill tone="muted">Undone</Pill>;
		case "auto_scheduled":
			return <Pill tone="primary">Scheduled</Pill>;
		default:
			return null;
	}
}

/** Confirm step for money-moving actions: restates the effect and amount. Focus defaults to Cancel. */
export function ApproveDialog({
	pending,
	detail,
	onConfirm,
	onClose,
}: {
	pending: { action: ActionDto; edits: Record<string, unknown> } | null;
	detail: DisputeDetail;
	onConfirm: () => void;
	onClose: () => void;
}) {
	const cancelRef = useRef<HTMLButtonElement>(null);
	if (!pending) return null;
	const merged = {
		type: pending.action.type,
		params: { ...pending.action.params, ...pending.edits },
	};
	const moneyMoves =
		merged.type === "accept_claim" || merged.type === "make_offer";
	const amt =
		typeof merged.params.amountMinor === "number"
			? (merged.params.amountMinor as number)
			: merged.type === "accept_claim"
				? detail.dispute.amountMinor
				: null;
	return (
		<AlertDialog open onOpenChange={(o) => !o && onClose()}>
			<AlertDialogContent
				onOpenAutoFocus={(e) => {
					e.preventDefault();
					cancelRef.current?.focus();
				}}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{primaryLabel(
							{ ...pending.action, params: merged.params },
							detail.dispute.currency,
						)}
						?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-2">
							<p>{effectText(merged, detail)}</p>
							{moneyMoves && amt != null && (
								<p className="font-display text-2xl text-foreground tabular">
									{formatMoney(amt, detail.dispute.currency)}
								</p>
							)}
							<p className="tabular text-xs">{ACTION_ENDPOINT[merged.type]}</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel ref={cancelRef}>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>
						Approve and send
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
