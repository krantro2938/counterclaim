import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { Monitor, Moon, Search, Store, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LiveIndicator } from "#/components/status";
import { useTheme } from "#/components/theme";
import { Button } from "#/components/ui/button";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import { useFallbackInterval, useLiveEvents } from "#/hooks/use-live";
import { api, qk } from "#/lib/api";
import { reasonLabel } from "#/lib/labels";
import { formatMoney } from "#/lib/money";
import { cn } from "#/lib/utils";
import type { DisputeRowDto } from "#/server/queries";

export const Route = createFileRoute("/app")({
	component: AppShell,
});

/** The mark: an open "C" holding a four-point star, on a forest tile (DESIGN §2.1). */
export function Logo({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground",
				className,
			)}
		>
			<svg viewBox="0 0 32 32" className="size-6" aria-hidden fill="none">
				<path
					d="M21.4 9.6A9 9 0 1 0 21.4 22.4"
					stroke="currentColor"
					strokeWidth="2.6"
					strokeLinecap="round"
				/>
				<path
					d="M23 10.5c.5 3.3 1.2 4.9 4.5 5.5-3.3.6-4 2.2-4.5 5.5-.5-3.3-1.2-4.9-4.5-5.5 3.3-.6 4-2.2 4.5-5.5Z"
					fill="currentColor"
				/>
			</svg>
		</span>
	);
}

function useDisputeRows() {
	const interval = useFallbackInterval();
	return useQuery({
		queryKey: qk.disputes,
		queryFn: () => api<{ rows: DisputeRowDto[] }>("/api/disputes"),
		refetchInterval: interval,
	});
}

const NAV: { to: string; label: string; exact?: boolean; lab?: boolean }[] = [
	{ to: "/app", label: "Overview", exact: true },
	{ to: "/app/disputes", label: "Disputes" },
	{ to: "/app/orders", label: "Orders" },
	{ to: "/app/settings", label: "Settings" },
	{ to: "/app/lab", label: "Lab", lab: true },
];

/** App frame: a rounded panel on the sage canvas, top bar with pill navigation (DESIGN §4). */
function AppShell() {
	const navigate = useNavigate();
	const goDispute = useCallback(
		(id: string) =>
			navigate({ to: "/app/disputes/$disputeId", params: { disputeId: id } }),
		[navigate],
	);
	useLiveEvents(goDispute);
	const disputes = useDisputeRows();
	const needs = disputes.data?.rows.filter((r) => r.needsDecision).length ?? 0;
	const [cmdOpen, setCmdOpen] = useState(false);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setCmdOpen((v) => !v);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const nav = (
		<>
			{NAV.map((n) => (
				<NavPill
					key={n.to}
					{...n}
					badge={n.to === "/app/disputes" ? needs : undefined}
				/>
			))}
		</>
	);

	return (
		<div className="min-h-svh bg-canvas p-0 sm:p-3 lg:p-5">
			<div className="mx-auto flex min-h-svh max-w-[1600px] flex-col bg-background sm:min-h-[calc(100svh-1.5rem)] sm:rounded-[36px] sm:ring-4 sm:ring-white/50 lg:min-h-[calc(100svh-2.5rem)] dark:sm:ring-white/5">
				<header className="flex h-[68px] items-center gap-4 px-4 sm:px-5 md:h-[76px] md:px-8">
					<Link to="/app" className="flex items-center gap-2.5">
						<Logo />
						<span className="font-display text-[17px]">Counterclaim</span>
					</Link>
					<nav
						aria-label="Main"
						className="mx-auto hidden items-center gap-1.5 md:flex"
					>
						{nav}
					</nav>
					<div className="ml-auto flex items-center gap-2 md:ml-0">
						<LiveIndicator className="mr-1 hidden lg:inline-flex" />
						<IconPill label="Search (⌘K)" onClick={() => setCmdOpen(true)}>
							<Search className="size-4" />
						</IconPill>
						<IconPill label="Demo shop" href="/shop">
							<Store className="size-4" />
						</IconPill>
						<ThemeMenu />
						<span
							className="ml-1 flex size-9 items-center justify-center rounded-full bg-sage text-xs font-semibold text-sage-foreground"
							title="Maya · Kiln & Thread"
						>
							M
						</span>
					</div>
				</header>
				<nav
					aria-label="Main"
					className="no-scrollbar -mt-2 flex gap-1.5 overflow-x-auto px-3 pb-3 sm:px-5 md:hidden"
				>
					{nav}
				</nav>
				<main className="min-w-0 flex-1">
					<Outlet />
				</main>
			</div>
			<CommandPalette
				open={cmdOpen}
				onOpenChange={setCmdOpen}
				rows={disputes.data?.rows ?? []}
			/>
		</div>
	);
}

function NavPill({
	to,
	label,
	exact,
	lab,
	badge,
}: {
	to: string;
	label: string;
	exact?: boolean;
	lab?: boolean;
	badge?: number;
}) {
	const pathname = useRouterState({
		select: (s) => s.location.pathname,
	}).replace(/\/$/, "");
	const active = exact
		? pathname === to
		: pathname === to || pathname.startsWith(`${to}/`);
	return (
		<Link
			to={to}
			aria-current={active ? "page" : undefined}
			className={cn(
				"inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-[13.5px] transition-colors",
				active
					? "border-transparent bg-card font-medium text-foreground"
					: "border-transparent text-muted-foreground hover:bg-card/70 hover:text-foreground",
			)}
		>
			{label}
			{badge ? (
				<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground tabular">
					{badge}
				</span>
			) : null}
			{lab && (
				<span aria-hidden className="size-1.5 rounded-full bg-simulated" />
			)}
		</Link>
	);
}

function IconPill({
	label,
	onClick,
	href,
	children,
}: {
	label: string;
	onClick?: () => void;
	href?: string;
	children: React.ReactNode;
}) {
	const cls =
		"flex size-9 items-center justify-center rounded-full bg-card text-muted-foreground transition-colors hover:text-foreground";
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{href ? (
					<a
						href={href}
						target="_blank"
						rel="noreferrer"
						className={cls}
						aria-label={label}
					>
						{children}
					</a>
				) : (
					<button
						type="button"
						className={cls}
						onClick={onClick}
						aria-label={label}
					>
						{children}
					</button>
				)}
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function ThemeMenu() {
	const { theme, setTheme, resolved } = useTheme();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					className="size-9 text-muted-foreground"
					aria-label="Theme"
				>
					{resolved === "dark" ? (
						<Moon className="size-4" />
					) : (
						<Sun className="size-4" />
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-40">
				<DropdownMenuLabel>Theme</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={theme}
					onValueChange={(v) => setTheme(v as "light" | "dark" | "system")}
				>
					<DropdownMenuRadioItem value="light">
						<Sun className="size-4" /> Light
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="dark">
						<Moon className="size-4" /> Dark
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="system">
						<Monitor className="size-4" /> System
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function CommandPalette({
	open,
	onOpenChange,
	rows,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	rows: DisputeRowDto[];
}) {
	const navigate = useNavigate();
	const go = (to: string, params?: Record<string, string>) => {
		onOpenChange(false);
		navigate({ to, params } as never);
	};
	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Search Counterclaim"
			description="Jump to a page or a dispute"
		>
			<CommandInput placeholder="Search disputes, orders, pages…" />
			<CommandList>
				<CommandEmpty>No results.</CommandEmpty>
				<CommandGroup heading="Pages">
					<CommandItem onSelect={() => go("/app")}>Overview</CommandItem>
					<CommandItem onSelect={() => go("/app/disputes")}>
						Disputes
					</CommandItem>
					<CommandItem onSelect={() => go("/app/orders")}>
						Orders &amp; Protection
					</CommandItem>
					<CommandItem onSelect={() => go("/app/settings")}>
						Settings
					</CommandItem>
					<CommandItem onSelect={() => go("/app/lab")}>
						Lab (sandbox controls)
					</CommandItem>
				</CommandGroup>
				{rows.length > 0 && (
					<CommandGroup heading="Disputes">
						{rows.slice(0, 30).map((r) => (
							<CommandItem
								key={r.id}
								value={`${r.id} ${r.orderNumber ?? ""} ${r.buyer ?? ""} ${reasonLabel(r.reason)}`}
								onSelect={() =>
									go("/app/disputes/$disputeId", { disputeId: r.id })
								}
							>
								<span className="text-xs">{r.id}</span>
								<span className="text-muted-foreground">
									#{r.orderNumber ?? "—"} · {reasonLabel(r.reason)} ·{" "}
									{formatMoney(r.amountMinor, r.currency)}
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}
			</CommandList>
		</CommandDialog>
	);
}
