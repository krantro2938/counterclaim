import { cn } from "#/lib/utils";

export function PageHeader({ title, subtitle, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
	return (
		<div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
			<div className="min-w-0">
				<h1 className="font-display text-[32px] font-medium leading-tight">{title}</h1>
				{subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
	);
}

export function SectionHeading({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
	return (
		<div className={cn("flex items-center justify-between gap-2 border-b pb-2", className)}>
			<h2 className="text-sm font-semibold">{children}</h2>
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
	return <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", color[actor] ?? "bg-muted-foreground")} />;
}

export const ACTOR_LABEL: Record<string, string> = {
	buyer: "Buyer",
	merchant: "You",
	paypal: "PayPal",
	agent: "Counterclaim",
	simulated: "Simulator",
	system: "System",
};
