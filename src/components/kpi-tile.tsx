import { Link } from "@tanstack/react-router";
import { cn } from "#/lib/utils";

/** KPI tile: label, display-font value, optional hint + sparkline. Top border, no card (DESIGN §6.1). */
export function KpiTile({
	label,
	value,
	hint,
	spark,
	to,
	className,
}: {
	label: string;
	value: React.ReactNode;
	hint?: React.ReactNode;
	spark?: number[];
	to?: string;
	className?: string;
}) {
	const body = (
		<div
			className={cn(
				"flex h-full flex-col gap-1 border-t-2 border-foreground/80 pt-3",
				to && "group",
				className,
			)}
		>
			<span className="text-[13px] text-muted-foreground">{label}</span>
			<span className="font-display text-[32px] leading-none font-medium tabular group-hover:text-primary">
				{value}
			</span>
			<div className="mt-1 flex items-end justify-between gap-2 text-xs text-muted-foreground">
				<span>{hint}</span>
				{spark && spark.length > 1 && <Sparkline values={spark} />}
			</div>
		</div>
	);
	return to ? (
		<Link to={to} className="block rounded-sm focus-visible:outline-2">
			{body}
		</Link>
	) : (
		body
	);
}

export function Sparkline({
	values,
	className,
}: {
	values: number[];
	className?: string;
}) {
	const w = 72;
	const h = 20;
	const max = Math.max(1, ...values);
	const step = w / (values.length - 1);
	const pts = values
		.map(
			(v, i) =>
				`${(i * step).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`,
		)
		.join(" ");
	return (
		<svg
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			className={cn("text-primary", className)}
			aria-hidden
		>
			<polyline
				points={pts}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}
