import { cn } from "#/lib/utils";

function toneFor(score: number) {
	return score >= 70
		? "bg-score-high"
		: score >= 40
			? "bg-score-mid"
			: "bg-score-low";
}
function textToneFor(score: number) {
	return score >= 70 ? "text-won" : score >= 40 ? "text-deadline" : "text-lost";
}

/** Win likelihood: big number + bar, plus the two thin bars that explain the hybrid score. */
export function ScoreMeter({
	final,
	rubric,
	llm,
	className,
}: {
	final: number | null;
	rubric?: number | null;
	llm?: number | null;
	className?: string;
}) {
	if (final == null)
		return (
			<div className={cn("text-muted-foreground", className)}>No score yet</div>
		);
	return (
		<div className={cn("space-y-3", className)}>
			<div className="flex items-end justify-between gap-3">
				<span className="eyebrow pb-1.5">Win likelihood</span>
				<span
					className={cn(
						"font-display text-[56px] leading-none tabular",
						textToneFor(final),
					)}
				>
					{Math.round(final)}%
				</span>
			</div>
			<div
				className="relative h-1.5 overflow-hidden rounded-full bg-muted"
				role="meter"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(final)}
				aria-label="Win likelihood"
			>
				<div
					className={cn(
						"h-full rounded-full transition-[width] duration-300 ease-[var(--ease-desk)]",
						toneFor(final),
					)}
					style={{ width: `${final}%` }}
				/>
			</div>
			{(rubric != null || llm != null) && (
				<div className="grid grid-cols-2 gap-6 pt-2">
					<ThinBar
						label="Rules"
						value={rubric}
						hint="Deterministic rubric (60%)"
					/>
					<ThinBar label="AI" value={llm} hint="Model assessment (40%)" />
				</div>
			)}
		</div>
	);
}

function ThinBar({
	label,
	value,
	hint,
}: {
	label: string;
	value?: number | null;
	hint: string;
}) {
	return (
		<div title={hint}>
			<div className="flex justify-between text-xs text-muted-foreground">
				<span>{label}</span>
				<span className="tabular font-mono">
					{value == null ? "—" : Math.round(value)}
				</span>
			</div>
			<div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-foreground/40"
					style={{ width: `${value ?? 0}%` }}
				/>
			</div>
		</div>
	);
}

export function MiniScore({
	value,
	className,
}: {
	value: number | null | undefined;
	className?: string;
}) {
	if (value == null)
		return (
			<span className={cn("text-xs text-muted-foreground", className)}>—</span>
		);
	return (
		<span
			className={cn(
				"inline-flex w-full max-w-28 items-center gap-2",
				className,
			)}
		>
			<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
				<span
					className={cn("block h-full rounded-full", toneFor(value))}
					style={{ width: `${value}%` }}
				/>
			</span>
			<span
				className={cn(
					"w-9 text-right font-mono text-xs tabular",
					textToneFor(value),
				)}
			>
				{Math.round(value)}%
			</span>
		</span>
	);
}
