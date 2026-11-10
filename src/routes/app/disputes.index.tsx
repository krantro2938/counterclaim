import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ColDef, GetRowIdParams, GridApi, GridReadyEvent, ICellRendererParams, RowClassParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { Copy, Layers, RefreshCw, Rows3, Rows4 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ClientOnly, counterclaimGrid, GridEmpty, GridSkeleton, loadColumnState, saveColumnState } from "#/components/grid";
import { Money } from "#/components/money";
import { PageHeader } from "#/components/page";
import { MiniScore } from "#/components/score-meter";
import { DeadlineChip, Pill, ReasonLabel, StatusBadge } from "#/components/status";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { useIsMobile } from "#/hooks/use-mobile";
import { useFallbackInterval } from "#/hooks/use-live";
import { api, post, qk } from "#/lib/api";
import { relativeTime } from "#/lib/format";
import { actionLabel, REASON_LABELS, statusInfo } from "#/lib/labels";
import { cn } from "#/lib/utils";
import type { DisputeRowDto } from "#/server/queries";

export const Route = createFileRoute("/app/disputes/")({ component: DisputesInbox });

type Segment = "all" | "yours" | "paypal" | "resolved";
type GroupRow = { __group: string; count: number; id: string };
type Row = DisputeRowDto | GroupRow;
const isGroup = (r: Row | undefined): r is GroupRow => Boolean(r && "__group" in r);

function segmentOf(r: DisputeRowDto): Segment {
	if (r.status === "RESOLVED") return "resolved";
	if (r.status === "WAITING_FOR_SELLER_RESPONSE" || r.needsDecision) return "yours";
	return "paypal";
}

const GROUP_ORDER = ["Your move", "With PayPal", "Waiting on buyer", "Open", "Won", "Lost", "Settled", "Resolved"];

function DisputesInbox() {
	const interval = useFallbackInterval();
	const q = useQuery({ queryKey: qk.disputes, queryFn: () => api<{ rows: DisputeRowDto[] }>("/api/disputes"), refetchInterval: interval });
	const [quick, setQuick] = useState("");
	const [segment, setSegment] = useState<Segment>("all");
	const [reason, setReason] = useState("all");
	const [grouped, setGrouped] = useState(false);
	const [dense, setDense] = useState(false);
	const isMobile = useIsMobile();
	const sync = useMutation({
		mutationFn: () => post("/api/lab/sync"),
		onSuccess: () => toast("Sync queued", { description: "Polling PayPal for dispute updates." }),
		onError: (e: Error) => toast.error("Sync failed", { description: e.message }),
	});

	const rows = useMemo(() => {
		const all = q.data?.rows ?? [];
		return all.filter((r) => (segment === "all" || segmentOf(r) === segment) && (reason === "all" || r.reason === reason));
	}, [q.data, segment, reason]);

	const counts = useMemo(() => {
		const all = q.data?.rows ?? [];
		return {
			all: all.length,
			yours: all.filter((r) => segmentOf(r) === "yours").length,
			paypal: all.filter((r) => segmentOf(r) === "paypal").length,
			resolved: all.filter((r) => segmentOf(r) === "resolved").length,
		};
	}, [q.data]);

	return (
		<div className="flex flex-col gap-4 p-4 md:p-6">
			<PageHeader title="Disputes" subtitle="Every PayPal dispute on your account, scored and ready for a decision." />
			<div className="flex flex-wrap items-center gap-2">
				<Input
					value={quick}
					onChange={(e) => setQuick(e.target.value)}
					placeholder="Filter by buyer, order, ID…"
					className="h-9 w-full sm:w-64"
					aria-label="Quick filter"
				/>
				<ToggleGroup
					type="single"
					value={segment}
					onValueChange={(v) => v && setSegment(v as Segment)}
					variant="outline"
					size="sm"
					className="overflow-x-auto"
				>
					<ToggleGroupItem value="all">All {counts.all ? <Count n={counts.all} /> : null}</ToggleGroupItem>
					<ToggleGroupItem value="yours">Your move {counts.yours ? <Count n={counts.yours} /> : null}</ToggleGroupItem>
					<ToggleGroupItem value="paypal">With PayPal {counts.paypal ? <Count n={counts.paypal} /> : null}</ToggleGroupItem>
					<ToggleGroupItem value="resolved">Resolved {counts.resolved ? <Count n={counts.resolved} /> : null}</ToggleGroupItem>
				</ToggleGroup>
				<Select value={reason} onValueChange={setReason}>
					<SelectTrigger size="sm" className="w-44" aria-label="Reason">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All reasons</SelectItem>
						{Object.entries(REASON_LABELS).map(([k, v]) => (
							<SelectItem key={k} value={k}>
								{v}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className="ml-auto flex items-center gap-1">
					{!isMobile && (
						<>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button variant={grouped ? "secondary" : "ghost"} size="icon" className="size-9" aria-label="Group by status" aria-pressed={grouped} onClick={() => setGrouped((g) => !g)}>
										<Layers className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Group by status</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button variant="ghost" size="icon" className="size-9" aria-label="Toggle density" onClick={() => setDense((d) => !d)}>
										{dense ? <Rows3 className="size-4" /> : <Rows4 className="size-4" />}
									</Button>
								</TooltipTrigger>
								<TooltipContent>{dense ? "Comfortable rows" : "Compact rows"}</TooltipContent>
							</Tooltip>
						</>
					)}
					<Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending} className="gap-1.5">
						<RefreshCw className={cn("size-3.5", sync.isPending && "animate-spin")} />
						Sync now
					</Button>
				</div>
			</div>
			{q.isError ? (
				<ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />
			) : isMobile ? (
				<DisputeCards rows={rows} loading={q.isLoading} quick={quick} />
			) : (
				<ClientOnly fallback={<GridSkeleton />}>
					<DisputesGrid rows={rows} loading={q.isLoading} quick={quick} grouped={grouped} dense={dense} />
				</ClientOnly>
			)}
			<p className="text-xs text-muted-foreground">
				Tip: <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> to move, <kbd className="font-mono">Enter</kbd> to open.
			</p>
		</div>
	);
}

function Count({ n }: { n: number }) {
	return <span className="ml-1 rounded bg-muted px-1 font-mono text-[11px] tabular text-muted-foreground">{n}</span>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
	return (
		<div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-lost/30 bg-lost-soft px-4 py-3 text-sm text-lost">
			<span>Couldn't load data: {message}</span>
			{onRetry && (
				<Button size="sm" variant="outline" onClick={onRetry}>
					Retry
				</Button>
			)}
		</div>
	);
}

// ── Cell renderers ──────────────────────────────────────────────────────────

function StatusCell({ data }: ICellRendererParams<Row>) {
	if (!data || isGroup(data)) return null;
	return (
		<span className="flex items-center gap-1.5">
			<StatusBadge status={data.status} outcome={data.outcome} />
			{data.needsDecision && <span className="size-1.5 rounded-full bg-deadline" title="Needs your decision" />}
		</span>
	);
}

function IdCell({ value }: ICellRendererParams<Row, string>) {
	if (!value) return null;
	return (
		<span className="group/id flex items-center gap-1">
			<span className="truncate font-mono text-xs">{value}</span>
			<button
				type="button"
				className="invisible rounded p-0.5 text-muted-foreground hover:text-foreground group-hover/id:visible"
				aria-label="Copy dispute ID"
				onClick={(e) => {
					e.stopPropagation();
					navigator.clipboard?.writeText(value).then(() => toast("Copied", { description: value }));
				}}
			>
				<Copy className="size-3" />
			</button>
		</span>
	);
}

function GroupHeader({ data }: ICellRendererParams<Row>) {
	if (!isGroup(data)) return null;
	return (
		<div className="flex h-full items-center gap-2 bg-muted/60 px-3 text-xs font-medium text-muted-foreground">
			<span className="uppercase tracking-wide">{data.__group}</span>
			<span className="font-mono tabular">{data.count}</span>
		</div>
	);
}

function DisputesGrid({ rows, loading, quick, grouped, dense }: { rows: DisputeRowDto[]; loading: boolean; quick: string; grouped: boolean; dense: boolean }) {
	const navigate = useNavigate();
	const apiRef = useRef<GridApi<Row> | null>(null);
	const current = useRef<Map<string, DisputeRowDto>>(new Map());
	const lastMode = useRef<boolean | null>(null);

	const columnDefs = useMemo<ColDef<Row>[]>(
		() => [
			{ colId: "status", headerName: "Status", field: "status" as never, pinned: "left", width: 150, cellRenderer: StatusCell, enableCellChangeFlash: true },
			{ colId: "id", headerName: "Dispute", field: "id", width: 170, cellRenderer: IdCell },
			{ colId: "orderNumber", headerName: "Order", field: "orderNumber" as never, width: 90, valueFormatter: (p) => (p.value ? `#${p.value}` : "—"), cellClass: "font-mono tabular" },
			{ colId: "buyer", headerName: "Buyer", field: "buyer" as never, flex: 1, minWidth: 130, valueFormatter: (p) => p.value ?? "—" },
			{ colId: "reason", headerName: "Reason", field: "reason" as never, width: 180, cellRenderer: (p: ICellRendererParams<Row>) => (p.data && !isGroup(p.data) ? <ReasonLabel reason={p.data.reason} /> : null) },
			{
				colId: "amount",
				headerName: "Amount",
				field: "amountMinor" as never,
				width: 110,
				type: "rightAligned",
				cellRenderer: (p: ICellRendererParams<Row>) => (p.data && !isGroup(p.data) ? <Money amountMinor={p.data.amountMinor} currency={p.data.currency} /> : null),
			},
			{
				colId: "due",
				headerName: "Due",
				field: "dueAt" as never,
				width: 130,
				cellRenderer: (p: ICellRendererParams<Row>) => (p.data && !isGroup(p.data) ? <DeadlineChip dueAt={p.data.dueAt} resolved={p.data.status === "RESOLVED"} /> : null),
			},
			{
				colId: "score",
				headerName: "Win likelihood",
				field: "finalScore" as never,
				width: 150,
				enableCellChangeFlash: true,
				cellRenderer: (p: ICellRendererParams<Row>) =>
					p.data && !isGroup(p.data) ? p.data.assessing && p.data.finalScore == null ? <span className="text-xs text-muted-foreground">Assessing…</span> : <MiniScore value={p.data.finalScore} /> : null,
			},
			{
				colId: "recommended",
				headerName: "Recommended",
				field: "recommendedAction" as never,
				width: 170,
				enableCellChangeFlash: true,
				cellRenderer: (p: ICellRendererParams<Row>) =>
					p.data && !isGroup(p.data) && p.data.recommendedAction && p.data.status !== "RESOLVED" ? (
						<Pill tone="primary" dot={false}>
							{actionLabel(p.data.recommendedAction)}
						</Pill>
					) : (
						<span className="text-muted-foreground">—</span>
					),
			},
			{ colId: "next", headerName: "Next step", field: "nextStep" as never, flex: 1, minWidth: 180, enableCellChangeFlash: true, cellClass: "text-muted-foreground" },
			{ colId: "updated", headerName: "Updated", field: "updatedAt" as never, width: 110, valueFormatter: (p) => relativeTime(p.value), cellClass: "text-muted-foreground tabular", sort: "desc" },
		],
		[],
	);

	const withGroups = useCallback((list: DisputeRowDto[]): Row[] => {
		const by = new Map<string, DisputeRowDto[]>();
		for (const r of list) {
			const label = statusInfo(r.status, r.outcome).label;
			by.set(label, [...(by.get(label) ?? []), r]);
		}
		const keys = [...by.keys()].sort((a, b) => (GROUP_ORDER.indexOf(a) + 99) % 99 - (GROUP_ORDER.indexOf(b) + 99) % 99);
		return keys.flatMap((k) => [{ __group: k, count: by.get(k)?.length ?? 0, id: `group:${k}` } as GroupRow, ...(by.get(k) ?? [])]);
	}, []);

	// Live updates: grouped mode re-sets rowData (delta-applied via getRowId); flat mode uses the transaction API.
	useEffect(() => {
		const gapi = apiRef.current;
		if (!gapi) return;
		if (grouped || lastMode.current !== grouped) {
			gapi.setGridOption("rowData", grouped ? withGroups(rows) : rows);
			current.current = new Map(rows.map((r) => [r.id, r]));
			lastMode.current = grouped;
			return;
		}
		const next = new Map(rows.map((r) => [r.id, r]));
		const add: DisputeRowDto[] = [];
		const update: DisputeRowDto[] = [];
		const remove: DisputeRowDto[] = [];
		for (const [id, r] of next) {
			const prev = current.current.get(id);
			if (!prev) add.push(r);
			else if (JSON.stringify(prev) !== JSON.stringify(r)) update.push(r);
		}
		for (const [id, r] of current.current) if (!next.has(id)) remove.push(r);
		if (add.length || update.length || remove.length) gapi.applyTransaction({ add, update, remove, addIndex: 0 });
		current.current = next;
	}, [rows, grouped, withGroups]);

	useEffect(() => {
		apiRef.current?.setGridOption("loading", loading);
	}, [loading]);

	useEffect(() => {
		apiRef.current?.resetRowHeights();
	}, [dense]);

	// j / k / Enter keyboard navigation (DESIGN §14)
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement;
			if (t.closest("input, textarea, [contenteditable=true], [role=dialog]")) return;
			const gapi = apiRef.current;
			if (!gapi || !["j", "k", "Enter"].includes(e.key)) return;
			const count = gapi.getDisplayedRowCount();
			if (!count) return;
			const focused = gapi.getFocusedCell();
			let idx = focused?.rowIndex ?? -1;
			if (e.key === "Enter") {
				const node = idx >= 0 ? gapi.getDisplayedRowAtIndex(idx) : null;
				if (node?.data && !isGroup(node.data)) navigate({ to: "/app/disputes/$disputeId", params: { disputeId: node.data.id } });
				return;
			}
			const dir = e.key === "j" ? 1 : -1;
			do {
				idx = Math.min(count - 1, Math.max(0, idx + dir));
			} while (isGroup(gapi.getDisplayedRowAtIndex(idx)?.data) && idx > 0 && idx < count - 1);
			gapi.ensureIndexVisible(idx);
			gapi.setFocusedCell(idx, "id");
			e.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [navigate]);

	const onGridReady = useCallback(
		(e: GridReadyEvent<Row>) => {
			apiRef.current = e.api;
			const state = loadColumnState("disputes");
			if (state) e.api.applyColumnState({ state: state as never, applyOrder: true });
			e.api.setGridOption("rowData", grouped ? withGroups(rows) : rows);
			current.current = new Map(rows.map((r) => [r.id, r]));
			lastMode.current = grouped;
		},
		// biome-ignore lint/correctness/useExhaustiveDependencies: initial data only; later updates go through transactions
		[],
	);

	const persist = useCallback(() => {
		const s = apiRef.current?.getColumnState();
		if (s) saveColumnState("disputes", s);
	}, []);

	return (
		<div className="h-[min(640px,calc(100vh-240px))] min-h-[360px] w-full">
			<AgGridReact<Row>
				theme={counterclaimGrid}
				columnDefs={columnDefs}
				defaultColDef={{ sortable: true, resizable: true, suppressMovable: false }}
				getRowId={(p: GetRowIdParams<Row>) => p.data.id}
				onGridReady={onGridReady}
				quickFilterText={quick}
				isFullWidthRow={(p) => isGroup(p.rowNode.data)}
				fullWidthCellRenderer={GroupHeader}
				getRowHeight={(p) => (isGroup(p.data) ? 32 : dense ? 36 : 44)}
				getRowClass={(p: RowClassParams<Row>) => (isGroup(p.data) ? undefined : "cursor-pointer")}
				onRowClicked={(e) => {
					if (e.data && !isGroup(e.data)) navigate({ to: "/app/disputes/$disputeId", params: { disputeId: e.data.id } });
				}}
				onColumnMoved={persist}
				onColumnResized={(e) => e.finished && persist()}
				onSortChanged={persist}
				onColumnPinned={persist}
				loading={loading}
				loadingOverlayComponent={GridSkeleton}
				noRowsOverlayComponent={() => <GridEmpty text="No disputes yet. Disputes appear here within a minute of a buyer opening one." />}
				animateRows
				suppressCellFocus={false}
				ensureDomOrder
			/>
		</div>
	);
}

function DisputeCards({ rows, loading, quick }: { rows: DisputeRowDto[]; loading: boolean; quick: string }) {
	const q = quick.trim().toLowerCase();
	const list = q ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : rows;
	if (loading) return <GridSkeleton rows={4} />;
	if (!list.length) return <p className="py-10 text-center text-sm text-muted-foreground">No disputes yet. Disputes appear here within a minute of a buyer opening one.</p>;
	return (
		<ul className="divide-y rounded-lg border bg-card">
			{list.map((r) => (
				<li key={r.id}>
					<Link to="/app/disputes/$disputeId" params={{ disputeId: r.id }} className="flex min-h-10 flex-col gap-2 p-4 active:bg-accent">
						<div className="flex items-center justify-between gap-2">
							<StatusBadge status={r.status} outcome={r.outcome} />
							<Money amountMinor={r.amountMinor} currency={r.currency} className="font-medium" />
						</div>
						<div className="flex items-center justify-between gap-2 text-sm">
							<ReasonLabel reason={r.reason} />
							<span className="text-muted-foreground">{r.buyer ?? "—"}</span>
						</div>
						<div className="flex items-center justify-between gap-2">
							<MiniScore value={r.finalScore} />
							<DeadlineChip dueAt={r.dueAt} resolved={r.status === "RESOLVED"} />
						</div>
						{r.headline && <p className="text-sm text-muted-foreground">{r.headline}</p>}
					</Link>
				</li>
			))}
		</ul>
	);
}
