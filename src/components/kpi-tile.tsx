import { Link } from "@tanstack/react-router";
import { cn } from "#/lib/utils";

/** KPI tile: eyebrow label, big serif value, quiet hint + sparkline. No border, no card (DESIGN §6.1). */
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
		<div className={cn("flex h-full flex-col gap-3", to && "group", className)}>
			<span className="eyebrow">{label}</span>
			<span className="font-display text-[52px] leading-none tabular transition-colors group-hover:text-primary">
				{value}
			</span>
			<div className="flex items-end justify-between gap-2 text-[13px] text-muted-foreground">
				<span>{hint}</span>
				{spark && spark.length > 1 && <Sparkline values={spark} />}
			</div>
		</div>
	);
	return to ? (
		<Link to={to} className="block rounded-md focus-visible:outline-2">
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
