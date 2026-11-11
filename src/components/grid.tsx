import type { ICellRendererParams } from "ag-grid-community";
import {
	AllCommunityModule,
	ModuleRegistry,
	themeQuartz,
} from "ag-grid-community";
import { useEffect, useState } from "react";
import { Avatar } from "./page";
import { Skeleton } from "./ui/skeleton";

ModuleRegistry.registerModules([AllCommunityModule]);

/** AG Grid Theming API mapped to our tokens (DESIGN §10): no outer frame, no column lines,
 * hairline rows, airy row height. Dark mode follows the CSS variables. */
export const counterclaimGrid = themeQuartz.withParams({
	fontFamily: "var(--font-sans)",
	fontSize: 13.5,
	headerFontSize: 12,
	headerFontWeight: 500,
	backgroundColor: "var(--card)",
	foregroundColor: "var(--foreground)",
	headerBackgroundColor: "var(--card)",
	headerTextColor: "var(--muted-foreground)",
	borderColor: "color-mix(in oklch, var(--border) 70%, transparent)",
	wrapperBorder: false,
	columnBorder: false,
	headerColumnBorder: false,
	headerColumnResizeHandleColor: "transparent",
	headerRowBorder: true,
	rowBorder: true,
	pinnedColumnBorder: false,
	rowHoverColor: "var(--muted)",
	selectedRowBackgroundColor: "var(--accent)",
	accentColor: "var(--primary)",
	rowHeight: 56,
	headerHeight: 40,
	wrapperBorderRadius: 0,
	cellHorizontalPadding: 16,
	valueChangeValueHighlightBackgroundColor: "var(--accent)",
	browserColorScheme: "inherit",
});

/** AG Grid renders client-side only (no SSR markup to hydrate). */
export function ClientOnly({
	children,
	fallback = null,
}: {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}) {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	return mounted ? <>{children}</> : <>{fallback}</>;
}

export function GridSkeleton({ rows = 6 }: { rows?: number }) {
	return (
		<div
			className="w-full space-y-3 py-3"
			aria-busy="true"
			aria-label="Loading"
		>
			{Array.from({ length: rows }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
				<Skeleton key={i} className="h-11 w-full rounded-lg" />
			))}
		</div>
	);
}

export function GridEmpty({ text }: { text: string }) {
	return (
		<div className="max-w-sm px-6 text-center text-sm text-muted-foreground">
			{text}
		</div>
	);
}

const COL_STATE_PREFIX = "cc-grid-cols:";

export function loadColumnState(key: string): unknown[] | null {
	try {
		const v = localStorage.getItem(COL_STATE_PREFIX + key);
		return v ? (JSON.parse(v) as unknown[]) : null;
	} catch {
		return null;
	}
}

export function saveColumnState(key: string, state: unknown[]) {
	try {
		localStorage.setItem(COL_STATE_PREFIX + key, JSON.stringify(state));
	} catch {}
}

/** Grid cell: initials avatar + name, like a contact list. */
export function BuyerCell({ value }: ICellRendererParams) {
	if (!value) return <span className="text-muted-foreground">—</span>;
	return (
		<span className="flex min-w-0 items-center gap-2.5">
			<Avatar name={String(value)} className="size-7 text-[10px]" />
			<span className="truncate font-medium">{String(value)}</span>
		</span>
	);
}
