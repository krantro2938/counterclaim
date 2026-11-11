import { formatMoney } from "#/lib/money";
import { cn } from "#/lib/utils";

/** Money: tabular figures, exact cents (DESIGN §6.1). */
export function Money({
	amountMinor,
	currency = "USD",
	signed,
	emphasis,
	className,
}: {
	amountMinor: number | null | undefined;
	currency?: string;
	signed?: boolean;
	emphasis?: boolean;
	className?: string;
}) {
	if (amountMinor == null)
		return <span className={cn("text-muted-foreground", className)}>—</span>;
	return (
		<span
			className={cn(
				"tabular whitespace-nowrap",
				emphasis ? "font-display text-2xl" : "font-medium",
				className,
			)}
		>
			{formatMoney(amountMinor, currency, { signed })}
		</span>
	);
}
