import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	useMatches,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import {
	FlaskConical,
	Gavel,
	LayoutDashboard,
	Monitor,
	Moon,
	Package,
	Search,
	Settings,
	Store,
	Sun,
} from "lucide-react";
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
import { Kbd } from "#/components/ui/kbd";
import { Separator } from "#/components/ui/separator";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
} from "#/components/ui/sidebar";
import { useFallbackInterval, useLiveEvents } from "#/hooks/use-live";
import { api, qk } from "#/lib/api";
import { reasonLabel } from "#/lib/labels";
import { formatMoney } from "#/lib/money";
import type { DisputeRowDto } from "#/server/queries";

export const Route = createFileRoute("/app")({
	component: AppShell,
});

export function Logo({ className }: { className?: string }) {
	return (
		<span className={className}>
			<svg viewBox="0 0 32 32" className="size-7" aria-hidden>
				<rect width="32" height="32" rx="8" className="fill-primary" />
				<path
					d="M21.5 11.2a7 7 0 1 0 0 9.6"
					className="stroke-primary-foreground"
					strokeWidth="3"
					fill="none"
					strokeLinecap="round"
				/>
				<circle cx="22" cy="16" r="2" className="fill-primary-foreground" />
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

	return (
		<SidebarProvider>
			<Sidebar collapsible="icon">
				<SidebarHeader>
					<Link
						to="/app"
						className="flex items-center gap-2 rounded-md px-1.5 py-1.5"
					>
						<Logo />
						<span className="font-display text-lg font-semibold group-data-[collapsible=icon]:hidden">
							Counterclaim
						</span>
					</Link>
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>Work</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								<NavItem
									to="/app"
									exact
									icon={LayoutDashboard}
									label="Overview"
								/>
								<NavItem
									to="/app/disputes"
									icon={Gavel}
									label="Disputes"
									badge={needs || undefined}
								/>
								<NavItem to="/app/orders" icon={Package} label="Orders" />
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
					<SidebarGroup>
						<SidebarGroupLabel>Setup</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								<NavItem to="/app/settings" icon={Settings} label="Settings" />
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
					<SidebarGroup>
						<SidebarGroupLabel>Sandbox</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								<NavItem to="/app/lab" icon={FlaskConical} label="Lab" dot />
								<SidebarMenuItem>
									<SidebarMenuButton asChild tooltip="Kiln & Thread shop">
										<a href="/shop" target="_blank" rel="noreferrer">
											<Store />
											<span>Demo shop</span>
										</a>
									</SidebarMenuButton>
								</SidebarMenuItem>
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
				<SidebarFooter>
					<div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
						<span className="flex size-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
							M
						</span>
						<span>Maya · Kiln &amp; Thread</span>
					</div>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>
			<SidebarInset className="min-w-0">
				<header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
					<SidebarTrigger className="-ml-1" aria-label="Toggle sidebar" />
					<Separator orientation="vertical" className="mx-1 h-4" />
					<Crumbs />
					<div className="ml-auto flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							className="hidden h-8 gap-2 text-muted-foreground sm:inline-flex"
							onClick={() => setCmdOpen(true)}
						>
							<Search className="size-3.5" />
							Search
							<Kbd>⌘K</Kbd>
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 sm:hidden"
							aria-label="Search"
							onClick={() => setCmdOpen(true)}
						>
							<Search className="size-4" />
						</Button>
						<LiveIndicator className="hidden sm:inline-flex" />
						<ThemeMenu />
					</div>
				</header>
				<div className="min-w-0 flex-1">
					<Outlet />
				</div>
			</SidebarInset>
			<CommandPalette
				open={cmdOpen}
				onOpenChange={setCmdOpen}
				rows={disputes.data?.rows ?? []}
			/>
		</SidebarProvider>
	);
}

function NavItem({
	to,
	icon: Icon,
	label,
	badge,
	exact,
	dot,
}: {
	to: string;
	icon: React.ComponentType;
	label: string;
	badge?: number;
	exact?: boolean;
	dot?: boolean;
}) {
	const pathname = useRouterState({
		select: (s) => s.location.pathname,
	}).replace(/\/$/, "");
	const active = exact
		? pathname === to
		: pathname === to || pathname.startsWith(`${to}/`);
	return (
		<SidebarMenuItem>
			<SidebarMenuButton asChild isActive={active} tooltip={label}>
				<Link to={to}>
					<Icon />
					<span>{label}</span>
					{dot && (
						<span
							aria-hidden
							className="ml-auto size-1.5 rounded-full bg-simulated"
						/>
					)}
				</Link>
			</SidebarMenuButton>
			{badge ? (
				<SidebarMenuBadge className="bg-deadline-soft text-deadline">
					{badge}
				</SidebarMenuBadge>
			) : null}
		</SidebarMenuItem>
	);
}

const CRUMB: Record<string, string> = {
	"/app": "Overview",
	"/app/disputes": "Disputes",
	"/app/orders": "Orders & Protection",
	"/app/settings": "Settings",
	"/app/lab": "Lab",
};

function Crumbs() {
	const matches = useMatches();
	const last = matches[matches.length - 1];
	const path = last?.pathname.replace(/\/$/, "") || "/app";
	const parts: { label: string; to?: string }[] = [];
	if (path.startsWith("/app/disputes/")) {
		parts.push({ label: "Disputes", to: "/app/disputes" });
		parts.push({ label: decodeURIComponent(path.split("/")[3] ?? "") });
	} else {
		parts.push({ label: CRUMB[path] ?? "Counterclaim" });
	}
	return (
		<nav
			aria-label="Breadcrumb"
			className="flex min-w-0 items-center gap-1.5 text-sm"
		>
			{parts.map((p, i) => (
				<span key={p.label} className="flex min-w-0 items-center gap-1.5">
					{i > 0 && <span className="text-muted-foreground">/</span>}
					{p.to ? (
						<Link
							to={p.to}
							className="text-muted-foreground hover:text-foreground"
						>
							{p.label}
						</Link>
					) : (
						<span
							className={i > 0 ? "truncate font-mono text-xs" : "font-medium"}
						>
							{p.label}
						</span>
					)}
				</span>
			))}
		</nav>
	);
}

function ThemeMenu() {
	const { theme, setTheme, resolved } = useTheme();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-8"
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
								<span className="font-mono text-xs">{r.id}</span>
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
