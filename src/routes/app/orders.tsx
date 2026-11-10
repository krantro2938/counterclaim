import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type {
	ColDef,
	GetRowIdParams,
	GridApi,
	ICellRendererParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { ShieldAlert, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	ClientOnly,
	counterclaimGrid,
	GridEmpty,
	GridSkeleton,
	loadColumnState,
	saveColumnState,
} from "#/components/grid";
import { Money } from "#/components/money";
import { PageHeader } from "#/components/page";
import { ProtectionBadge, SimulatedTag } from "#/components/status";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { useFallbackInterval } from "#/hooks/use-live";
import { useIsMobile } from "#/hooks/use-mobile";
import { ApiError, api, post, qk } from "#/lib/api";
import { formatDateTime } from "#/lib/format";
import { PROTECTION_LABELS } from "#/lib/labels";
import type { OrderRowDto } from "#/server/queries";
import { ErrorBox } from "./disputes.index";

export const Route = createFileRoute("/app/orders")({ component: OrdersPage });

const PROTECTION_ORDER = [
	"at_risk",
	"not_eligible",
	"awaiting",
	"protected",
	"pending",
];

function OrdersPage() {
	const interval = useFallbackInterval();
	const q = useQuery({
		queryKey: qk.orders,
		queryFn: () => api<{ rows: OrderRowDto[] }>("/api/orders"),
		refetchInterval: interval,
	});
	const [quick, setQuick] = useState("");
	const isMobile = useIsMobile();
	const rows = q.data?.rows ?? [];
	const atRisk = rows.filter((r) => r.protectionStatus === "at_risk").length;

	return (
		<div className="flex flex-col gap-4 p-4 md:p-6">
			<PageHeader
				title="Orders & Protection"
				subtitle="Keep every order eligible for PayPal Seller Protection: tracking on file, shipped to the PayPal address."
			/>
			{atRisk > 0 && (
				<div
					role="status"
					className="flex items-center gap-3 rounded-lg border border-deadline/30 bg-deadline-soft px-4 py-3 text-sm"
				>
					<ShieldAlert className="size-4 shrink-0 text-deadline" />
					<span>
						<strong className="font-semibold">
							{atRisk} order{atRisk === 1 ? " isn't" : "s aren't"} protected
							yet.
						</strong>{" "}
						Add tracking to keep Seller Protection.
					</span>
				</div>
			)}
			<div className="flex items-center gap-2">
				<Input
					value={quick}
					onChange={(e) => setQuick(e.target.value)}
					placeholder="Filter orders…"
					className="h-9 w-full sm:w-64"
					aria-label="Quick filter"
				/>
			</div>
			{q.isError ? (
				<ErrorBox
					message={(q.error as Error).message}
					onRetry={() => q.refetch()}
				/>
			) : isMobile ? (
				<OrderCards rows={rows} loading={q.isLoading} quick={quick} />
			) : (
				<ClientOnly fallback={<GridSkeleton />}>
					<OrdersGrid rows={rows} loading={q.isLoading} quick={quick} />
				</ClientOnly>
			)}
		</div>
	);
}

export function ShipButton({
	order,
	size = "sm",
}: {
	order: OrderRowDto;
	size?: "sm" | "default";
}) {
	const qc = useQueryClient();
	const [open, setOpen] = useState(false);
	const [carrier, setCarrier] = useState("USPS");
	const [notify, setNotify] = useState(true);
	const ship = useMutation({
		mutationFn: () =>
			post<{ trackingNumber: string; via: string; debugId: string | null }>(
				`/api/orders/${order.id}/ship`,
				{ carrier, notifyPayer: notify },
			),
		onSuccess: (r) => {
			setOpen(false);
			toast.success(`Order #${order.number} is protected`, {
				description: `Tracking ${r.trackingNumber} sent to PayPal via ${r.via.replace("toolkit:", "Agent Toolkit ").replace("rest:", "")}.`,
			});
			qc.invalidateQueries({ queryKey: qk.orders });
			qc.invalidateQueries({ queryKey: qk.overview });
		},
		onError: (e: Error) =>
			toast.error("Couldn't add tracking", {
				description: `${e.message}${e instanceof ApiError && e.debugId ? ` · PayPal debug ID ${e.debugId}` : ""}`,
			}),
	});
	if (order.shipment?.uploadedToPaypalAt) {
		return (
			<Button variant="ghost" size={size} asChild>
				<Link to="/app/orders">View</Link>
			</Button>
		);
	}
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size={size}
					className="gap-1.5"
					onClick={(e) => e.stopPropagation()}
				>
					<Truck className="size-3.5" /> Mark shipped
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-72 space-y-3"
				onClick={(e) => e.stopPropagation()}
			>
				<div>
					<p className="text-sm font-medium">
						Mark order #{order.number} shipped
					</p>
					<p className="text-xs text-muted-foreground">
						Tracking is sent to PayPal so the order stays eligible for Seller
						Protection.
					</p>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor={`carrier-${order.id}`}>Carrier</Label>
					<Select value={carrier} onValueChange={setCarrier}>
						<SelectTrigger id={`carrier-${order.id}`} className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="USPS">USPS</SelectItem>
							<SelectItem value="UPS">UPS</SelectItem>
							<SelectItem value="FEDEX">FedEx</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
					<span>Generate tracking number</span>
					<SimulatedTag />
				</div>
				<div className="flex items-center justify-between">
					<Label htmlFor={`notify-${order.id}`} className="font-normal">
						Notify buyer
					</Label>
					<Switch
						id={`notify-${order.id}`}
						checked={notify}
						onCheckedChange={setNotify}
					/>
				</div>
				<Button
					className="w-full"
					onClick={() => ship.mutate()}
					disabled={ship.isPending}
				>
					{ship.isPending ? "Sending to PayPal…" : "Confirm and add tracking"}
				</Button>
				<p className="font-mono text-[11px] text-muted-foreground">
					Agent Toolkit create_shipment_tracking → POST
					/v1/shipping/trackers-batch
				</p>
			</PopoverContent>
		</Popover>
	);
}

function itemsText(o: OrderRowDto) {
	const first = o.items[0];
	if (!first) return "—";
	const count = o.items.reduce((s, i) => s + i.quantity, 0);
	return `${count} × ${first.title}${o.items.length > 1 ? ` +${o.items.length - 1}` : ""}`;
}

function OrdersGrid({
	rows,
	loading,
	quick,
}: {
	rows: OrderRowDto[];
	loading: boolean;
	quick: string;
}) {
	const apiRef = useRef<GridApi<OrderRowDto> | null>(null);
	const sorted = useMemo(
		() =>
			[...rows].sort(
				(a, b) =>
					PROTECTION_ORDER.indexOf(a.protectionStatus) -
						PROTECTION_ORDER.indexOf(b.protectionStatus) || b.number - a.number,
			),
		[rows],
	);
	const cols = useMemo<ColDef<OrderRowDto>[]>(
		() => [
			{
				colId: "number",
				headerName: "Order",
				field: "number",
				width: 90,
				pinned: "left",
				valueFormatter: (p) => `#${p.value}`,
				cellClass: "font-mono tabular",
			},
			{
				colId: "buyer",
				headerName: "Buyer",
				field: "buyer",
				flex: 1,
				minWidth: 130,
				valueFormatter: (p) => p.value ?? "—",
			},
			{
				colId: "items",
				headerName: "Items",
				flex: 1.2,
				minWidth: 180,
				valueGetter: (p) => (p.data ? itemsText(p.data) : ""),
			},
			{
				colId: "amount",
				headerName: "Amount",
				field: "amountMinor",
				width: 110,
				type: "rightAligned",
				cellRenderer: (p: ICellRendererParams<OrderRowDto>) =>
					p.data ? (
						<Money
							amountMinor={p.data.amountMinor}
							currency={p.data.currency}
						/>
					) : null,
			},
			{
				colId: "captured",
				headerName: "Captured",
				field: "capturedAt",
				width: 130,
				valueFormatter: (p) => formatDateTime(p.value),
				cellClass: "tabular text-muted-foreground",
			},
			{
				colId: "shipment",
				headerName: "Shipment",
				width: 230,
				valueGetter: (p) => p.data?.shipment?.trackingNumber ?? "",
				cellRenderer: (p: ICellRendererParams<OrderRowDto>) => {
					const s = p.data?.shipment;
					if (!s) return <span className="text-muted-foreground">—</span>;
					return (
						<span className="flex items-center gap-1.5">
							<span className="text-xs">{s.carrier}</span>
							<span className="truncate font-mono text-xs">
								{s.trackingNumber}
							</span>
							{s.simulated && <SimulatedTag label="Sim" />}
						</span>
					);
				},
			},
			{
				colId: "protection",
				headerName: "Protection",
				field: "protectionStatus",
				width: 170,
				enableCellChangeFlash: true,
				filterValueGetter: (p) =>
					PROTECTION_LABELS[p.data?.protectionStatus ?? ""] ?? "",
				cellRenderer: (p: ICellRendererParams<OrderRowDto>) =>
					p.data ? (
						<ProtectionBadge
							status={p.data.protectionStatus}
							reasons={p.data.reasons}
						/>
					) : null,
			},
			{
				colId: "reasons",
				headerName: "Reasons",
				flex: 1.4,
				minWidth: 220,
				valueGetter: (p) => p.data?.reasons.join(" · ") ?? "",
				cellClass: "text-xs text-muted-foreground",
				enableCellChangeFlash: true,
			},
			{
				colId: "dispute",
				headerName: "Dispute",
				field: "disputeId",
				width: 150,
				cellRenderer: (p: ICellRendererParams<OrderRowDto>) =>
					p.data?.disputeId ? (
						<Link
							to="/app/disputes/$disputeId"
							params={{ disputeId: p.data.disputeId }}
							className="font-mono text-xs text-primary hover:underline"
						>
							{p.data.disputeId}
						</Link>
					) : (
						<span className="text-muted-foreground">—</span>
					),
			},
			{
				colId: "action",
				headerName: "",
				width: 150,
				pinned: "right",
				sortable: false,
				cellRenderer: (p: ICellRendererParams<OrderRowDto>) =>
					p.data && !p.data.shipment?.uploadedToPaypalAt ? (
						<ShipButton order={p.data} />
					) : null,
			},
		],
		[],
	);

	useEffect(() => {
		apiRef.current?.setGridOption("rowData", sorted);
	}, [sorted]);

	return (
		<div
			className="w-full"
			style={{
				height: Math.min(640, Math.max(260, 38 + sorted.length * 44 + 18)),
			}}
		>
			<AgGridReact<OrderRowDto>
				theme={counterclaimGrid}
				columnDefs={cols}
				defaultColDef={{ sortable: true, resizable: true }}
				getRowId={(p: GetRowIdParams<OrderRowDto>) => p.data.id}
				onGridReady={(e) => {
					apiRef.current = e.api;
					const s = loadColumnState("orders");
					if (s)
						e.api.applyColumnState({ state: s as never, applyOrder: true });
					e.api.setGridOption("rowData", sorted);
				}}
				onColumnMoved={() =>
					apiRef.current &&
					saveColumnState("orders", apiRef.current.getColumnState())
				}
				onColumnResized={(e) =>
					e.finished &&
					apiRef.current &&
					saveColumnState("orders", apiRef.current.getColumnState())
				}
				quickFilterText={quick}
				loading={loading}
				loadingOverlayComponent={GridSkeleton}
				noRowsOverlayComponent={() => (
					<GridEmpty text="No paid orders yet. Orders appear here when a buyer pays in the demo shop." />
				)}
				animateRows
			/>
		</div>
	);
}

function OrderCards({
	rows,
	loading,
	quick,
}: {
	rows: OrderRowDto[];
	loading: boolean;
	quick: string;
}) {
	if (loading) return <GridSkeleton rows={4} />;
	const q = quick.trim().toLowerCase();
	const list = q
		? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q))
		: rows;
	if (!list.length)
		return (
			<p className="py-10 text-center text-sm text-muted-foreground">
				No paid orders yet.
			</p>
		);
	return (
		<ul className="divide-y rounded-lg border bg-card">
			{list.map((o) => (
				<li key={o.id} className="space-y-2 p-4">
					<div className="flex items-center justify-between gap-2">
						<span className="font-mono text-sm">#{o.number}</span>
						<Money amountMinor={o.amountMinor} currency={o.currency} />
					</div>
					<p className="text-sm">
						{o.buyer ?? "—"} ·{" "}
						<span className="text-muted-foreground">{itemsText(o)}</span>
					</p>
					<div className="flex items-center justify-between gap-2">
						<ProtectionBadge status={o.protectionStatus} reasons={o.reasons} />
						{!o.shipment?.uploadedToPaypalAt && <ShipButton order={o} />}
					</div>
					{o.shipment && (
						<p className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
							{o.shipment.carrier} {o.shipment.trackingNumber}{" "}
							<SimulatedTag label="Sim" />
						</p>
					)}
				</li>
			))}
		</ul>
	);
}
