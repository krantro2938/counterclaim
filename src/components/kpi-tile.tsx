import { Link } from "@tanstack/react-router";
import { cn } from "#/lib/utils";

/** KPI card: label + small badge on top, value and a quiet comparison below (DESIGN §6.1). */
export function KpiTile({
	label,
	value,
	hint,
	badge,
	badgeTone = "muted",
	to,
	hash,
	className,
}: {
	label: string;
	value: React.ReactNode;
	hint?: React.ReactNode;
	badge?: React.ReactNode;
	badgeTone?: "won" | "lost" | "deadline" | "muted";
	spark?: number[];
	to?: string;
	/** Scroll target on the destination page (an element id). */
	hash?: string;
	className?: string;
}) {
	const tone = {
		won: "bg-won-soft text-won",
		lost: "bg-lost-soft text-lost",
		deadline: "bg-deadline-soft text-deadline",
		muted: "bg-muted text-muted-foreground",
	}[badgeTone];
	const body = (
		<div
			className={cn(
				"field flex h-full flex-col justify-between gap-4 p-5 transition-colors sm:gap-5 sm:p-6",
				to && "hover:bg-accent/60",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium">{label}</span>
				{badge != null && (
					<span
						className={cn(
							"rounded-full px-2 py-0.5 text-xs font-medium tabular",
							tone,
						)}
					>
						{badge}
					</span>
				)}
			</div>
			<div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
				<span className="font-display text-[22px] leading-none tabular sm:text-[26px]">
					{value}
				</span>
				{hint && (
					<span className="hidden text-xs text-muted-foreground sm:inline">
						{hint}
					</span>
				)}
			</div>
		</div>
	);
	return to ? (
		<Link
			to={to}
			hash={hash}
			className="block rounded-[28px] focus-visible:outline-2"
		>
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
