import { cn } from "#/lib/utils";

/** Page body: one width and rhythm for every app screen (DESIGN §4). */
export function Page({
	children,
	className,
	wide,
}: {
	children: React.ReactNode;
	className?: string;
	wide?: boolean;
}) {
	return (
		<div
			className={cn(
				"mx-auto flex w-full flex-col gap-12 px-5 pt-4 pb-16 md:gap-14 md:px-10 md:pt-6",
				wide ? "max-w-[1480px]" : "max-w-[1280px]",
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
				"flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
				className,
			)}
		>
			<div className="min-w-0">
				{eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
				<h1 className="font-display text-[44px] leading-[1.02] md:text-[56px]">
					{title}
				</h1>
				{subtitle && (
					<p className="mt-3 max-w-xl text-[15px] text-muted-foreground">
						{subtitle}
					</p>
				)}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
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
				"mb-5 flex items-baseline justify-between gap-2",
				className,
			)}
		>
			<h2 className="eyebrow">{children}</h2>
			{action}
		</div>
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
