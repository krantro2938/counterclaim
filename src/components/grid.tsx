import {
	AllCommunityModule,
	ModuleRegistry,
	themeQuartz,
} from "ag-grid-community";
import { useEffect, useState } from "react";
import { Skeleton } from "./ui/skeleton";

ModuleRegistry.registerModules([AllCommunityModule]);

/** AG Grid Theming API mapped to our shadcn tokens (DESIGN §10). Dark mode follows the CSS variables. */
export const counterclaimGrid = themeQuartz.withParams({
	fontFamily: "var(--font-sans)",
	fontSize: 13,
	headerFontSize: 12,
	headerFontWeight: 500,
	backgroundColor: "var(--card)",
	foregroundColor: "var(--foreground)",
	headerBackgroundColor: "var(--muted)",
	headerTextColor: "var(--muted-foreground)",
	borderColor: "var(--border)",
	rowHoverColor: "var(--accent)",
	selectedRowBackgroundColor: "var(--accent)",
	accentColor: "var(--primary)",
	rowHeight: 44,
	headerHeight: 36,
	wrapperBorderRadius: "var(--radius)",
	cellHorizontalPadding: 12,
	valueChangeValueHighlightBackgroundColor: "var(--accent)",
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
		<div className="w-full space-y-2 p-3" aria-busy="true" aria-label="Loading">
			{Array.from({ length: rows }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
				<Skeleton key={i} className="h-8 w-full" />
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
