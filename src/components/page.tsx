import { cn } from "#/lib/utils";

/** Page body: inside the app frame, cards sit 16 px apart (DESIGN §4). */
export function Page({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
	wide?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex w-full flex-col gap-4 px-3 pb-8 sm:px-5 md:px-8",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function PageHeader({
	title,
	eyebrow,
	subtitle,
	actions,
	className,
}: {
	title: React.ReactNode;
	eyebrow?: React.ReactNode;
	subtitle?: React.ReactNode;
	actions?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-1 pt-2 pb-2",
				className,
			)}
		>
			<div className="min-w-0">
				{eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
				<h1 className="font-display text-[26px]">{title}</h1>
				{subtitle && (
					<p className="mt-1 max-w-2xl text-muted-foreground">{subtitle}</p>
				)}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
	);
}

/** Card: white, rounded, one soft hairline. Title row optional. */
export function Card({
	title,
	action,
	children,
	className,
	id,
}: {
	title?: React.ReactNode;
	action?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	id?: string;
}) {
	return (
		<section
			className={cn("field min-w-0 p-5 sm:p-6", className)}
			aria-labelledby={id}
		>
			{(title || action) && (
				<div className="mb-4 flex min-h-8 items-center justify-between gap-3">
					{title && (
						<h2 id={id} className="text-[15px] font-semibold">
							{title}
						</h2>
					)}
					{action}
				</div>
			)}
			{children}
		</section>
	);
}

export function SectionHeading({
	children,
	action,
	className,
}: {
	children: React.ReactNode;
	action?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"mb-4 flex min-h-8 items-center justify-between gap-2",
				className,
			)}
		>
			<h2 className="text-[15px] font-semibold">{children}</h2>
			{action}
		</div>
	);
}

/** Initials avatar with a calm tint picked from the name. */
export function Avatar({
	name,
	className,
}: {
	name?: string | null;
	className?: string;
}) {
	const n = (name ?? "?").trim();
	const initials =
		n
			.split(/\s+/)
			.map((w) => w[0])
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?";
	const tints = [
		"bg-sage text-sage-foreground",
		"bg-review-soft text-review",
		"bg-deadline-soft text-deadline",
		"bg-simulated-soft text-simulated",
		"bg-won-soft text-won",
	];
	let h = 0;
	for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return (
		<span
			aria-hidden
			className={cn(
				"flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
				tints[h % tints.length],
				className,
			)}
		>
			{initials}
		</span>
	);
}

export function ActorDot({ actor }: { actor: string }) {
	const color: Record<string, string> = {
		buyer: "bg-deadline",
		merchant: "bg-foreground",
		paypal: "bg-review",
		agent: "bg-primary",
		simulated: "bg-simulated",
		system: "bg-muted-foreground",
	};
	return (
		<span
			aria-hidden
			className={cn(
				"mt-1.5 size-2 shrink-0 rounded-full",
				color[actor] ?? "bg-muted-foreground",
			)}
		/>
	);
}

export const ACTOR_LABEL: Record<string, string> = {
	buyer: "Buyer",
	merchant: "You",
	paypal: "PayPal",
	agent: "Counterclaim",
	simulated: "Simulator",
	system: "System",
};
