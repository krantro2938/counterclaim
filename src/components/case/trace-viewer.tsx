import { useQuery } from "@tanstack/react-query";
import { Brain, Check, ChevronRight, Info, Wrench, X } from "lucide-react";
import { useState } from "react";
import { api, qk } from "#/lib/api";
import { cn } from "#/lib/utils";
import { Skeleton } from "../ui/skeleton";
import type { DisputeDetail } from "./types";

type StepDto = {
	id: number;
	seq: number;
	kind: string;
	payload: Record<string, unknown>;
};

/** "How Counterclaim reached this": a first-class view of the agent loop (DESIGN §6.1). */
export function TraceViewer({ detail }: { detail: DisputeDetail }) {
	const a = detail.assessment;
	const q = useQuery({
		queryKey: qk.trace(a?.id ?? 0),
		queryFn: () =>
			api<{ steps: StepDto[] }>(
				`/api/disputes/${detail.dispute.id}/trace?assessment=${a?.id}`,
			),
		enabled: Boolean(a),
	});
	if (!a)
		return (
			<p className="py-6 text-sm text-muted-foreground">No assessment yet.</p>
		);
	const toolCalls = q.data?.steps.filter((s) => s.kind === "tool_call") ?? [];
	const paypalCalls = toolCalls.filter(
		(s) => s.payload.source === "paypal_agent_toolkit",
	).length;
	return (
		<div className="space-y-3">
			<div className="field flex flex-wrap gap-x-5 gap-y-1 px-4 py-3 text-xs text-muted-foreground">
				<span>
					Model{" "}
					<span className="font-mono text-foreground">
						{a.model ?? "rules only"}
					</span>
				</span>
				<span>Mode {a.mode}</span>
				<span>
					{a.latencyMs != null ? `${(a.latencyMs / 1000).toFixed(1)} s` : ""}
				</span>
				{a.tokensIn != null && (
					<span className="font-mono">
						{a.tokensIn.toLocaleString()} in /{" "}
						{(a.tokensOut ?? 0).toLocaleString()} out tokens
					</span>
				)}
				<span>
					{toolCalls.length} tool calls · {paypalCalls} via PayPal Agent Toolkit
				</span>
			</div>
			{q.isLoading ? (
				<Skeleton className="h-48" />
			) : (
				<ol className="space-y-1.5">
					{(q.data?.steps ?? []).map((s) => (
						<StepRow key={s.id} step={s} />
					))}
				</ol>
			)}
		</div>
	);
}

function StepRow({ step }: { step: StepDto }) {
	const [open, setOpen] = useState(false);
	const p = step.payload;
	let icon = <Info className="size-3.5" />;
	let title: React.ReactNode = String(p.detail ?? "");
	let body: string | null = null;
	let tone = "text-muted-foreground";
	if (step.kind === "model") {
		icon = <Brain className="size-3.5" />;
		const calls = (p.calls as string[] | undefined) ?? [];
		title = calls.length
			? `Model decided to call ${calls.join(", ")}`
			: String(p.text || "Model step");
		body =
			[
				p.reasoning ? `Reasoning summary: ${p.reasoning}` : "",
				p.text ? String(p.text) : "",
			]
				.filter(Boolean)
				.join("\n\n") || null;
		tone = "text-primary";
	} else if (step.kind === "tool_call") {
		icon = <Wrench className="size-3.5" />;
		title = (
			<span>
				<span className="font-mono">{String(p.tool)}</span>
				<span className="text-muted-foreground">
					({JSON.stringify(p.input ?? {})})
				</span>
				{p.source === "paypal_agent_toolkit" && (
					<span className="ml-2 rounded bg-review-soft px-1.5 py-0.5 text-[10px] text-review">
						PayPal Agent Toolkit
					</span>
				)}
			</span>
		);
		tone = "text-foreground";
	} else if (step.kind === "tool_result") {
		icon = p.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />;
		title = `${String(p.tool)} → ${p.ok ? "result" : "error"}`;
		body = String(p.result ?? p.error ?? "");
		tone = p.ok ? "text-muted-foreground" : "text-lost";
	} else if (step.kind === "validation") {
		icon = p.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />;
		title = (
			<span>
				<span className="font-medium">{p.ok ? "Kept" : "Dropped"}</span> ·{" "}
				{String(p.detail ?? p.what)}
			</span>
		);
		tone = p.ok ? "text-won" : "text-lost";
	} else if (step.kind === "info" && Array.isArray(p.rubric)) {
		body = (
			p.rubric as {
				label: string;
				earned: number;
				points: number;
				met: boolean;
			}[]
		)
			.map((r) => `${r.met ? "✓" : "·"} ${r.label}  ${r.earned}/${r.points}`)
			.join("\n");
	}
	const expandable = Boolean(body);
	return (
		<li
			className={cn(
				"rounded-lg",
				step.kind === "tool_call" || step.kind === "model"
					? "bg-card"
					: "bg-transparent",
			)}
		>
			<button
				type="button"
				className={cn(
					"flex w-full items-start gap-2.5 px-4 py-2.5 text-left text-sm",
					!expandable && "cursor-default",
				)}
				onClick={() => expandable && setOpen((o) => !o)}
				aria-expanded={expandable ? open : undefined}
			>
				<span className={cn("mt-0.5 shrink-0", tone)}>{icon}</span>
				<span className="min-w-0 flex-1 break-words">{title}</span>
				{expandable && (
					<ChevronRight
						className={cn(
							"mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform",
							open && "rotate-90",
						)}
					/>
				)}
			</button>
			{open && body && (
				<pre className="mx-4 mb-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 font-mono text-[11px] leading-relaxed">
					{body}
				</pre>
			)}
		</li>
	);
}
