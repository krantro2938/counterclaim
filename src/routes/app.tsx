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
import { cn } from "#/lib/utils";
import type { DisputeRowDto } from "#/server/queries";

export const Route = createFileRoute("/app")({
	component: AppShell,
});

const GROUP_LABEL = "text-[10.5px] font-medium uppercase tracking-[0.14em]";
const NAV_BUTTON = "h-9 rounded-lg px-2.5 text-[14px]";

/** The mark: an open "C" holding a four-point star (DESIGN §2.1). Inherits the text colour. */
export function Logo({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 32 32"
			className={cn("size-7", className)}
			aria-hidden
			fill="none"
		>
			<path
				d="M21.4 9.6A9 9 0 1 0 21.4 22.4"
				stroke="currentColor"
				strokeWidth="2.4"
				strokeLinecap="round"
			/>
			<path
				d="M23 10.5c.5 3.3 1.2 4.9 4.5 5.5-3.3.6-4 2.2-4.5 5.5-.5-3.3-1.2-4.9-4.5-5.5 3.3-.6 4-2.2 4.5-5.5Z"
				fill="currentColor"
			/>
		</svg>
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
			<Sidebar collapsible="icon" variant="inset">
				<SidebarHeader className="pt-4 pb-6">
					<Link
						to="/app"
						className="flex items-center gap-2.5 rounded-md px-1 py-1 text-primary"
					>
						<Logo className="shrink-0" />
						<span className="wordmark text-foreground group-data-[collapsible=icon]:hidden">
							Counterclaim
						</span>
					</Link>
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel className={GROUP_LABEL}>Work</SidebarGroupLabel>
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
						<SidebarGroupLabel className={GROUP_LABEL}>Setup</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								<NavItem to="/app/settings" icon={Settings} label="Settings" />
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
					<SidebarGroup>
						<SidebarGroupLabel className={GROUP_LABEL}>
							Sandbox
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								<NavItem to="/app/lab" icon={FlaskConical} label="Lab" dot />
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										tooltip="Kiln & Thread shop"
										className={NAV_BUTTON}
									>
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
				<SidebarFooter className="pb-4">
					<div className="flex items-center gap-2.5 px-1.5 py-1 group-data-[collapsible=icon]:hidden">
						<span className="flex size-8 items-center justify-center rounded-full bg-sage text-xs font-semibold text-sage-foreground">
							M
						</span>
						<span className="leading-tight">
							<span className="block text-sm">Maya</span>
							<span className="block text-xs text-muted-foreground">
								Kiln &amp; Thread
							</span>
						</span>
					</div>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>
			<SidebarInset className="min-w-0 md:peer-data-[variant=inset]:shadow-none">
				<header className="sticky top-0 z-20 flex h-16 items-center gap-3 rounded-t-xl bg-background/85 px-5 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-10">
					<SidebarTrigger
						className="-ml-1.5 text-muted-foreground"
						aria-label="Toggle sidebar"
					/>
					<Crumbs />
					<div className="ml-auto flex items-center gap-3">
						<Button
							variant="secondary"
							size="sm"
							className="hidden h-9 w-56 justify-start gap-2 px-3.5 font-normal text-muted-foreground sm:inline-flex"
							onClick={() => setCmdOpen(true)}
						>
							<Search className="size-3.5" />
							Search
							<Kbd className="ml-auto bg-background">⌘K</Kbd>
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
			<SidebarMenuButton
				asChild
				isActive={active}
				tooltip={label}
				className={NAV_BUTTON}
			>
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
				<SidebarMenuBadge className="top-2 rounded-full bg-deadline-soft px-2 text-deadline">
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
			className="flex min-w-0 items-center gap-2 text-sm"
		>
			{parts.map((p, i) => (
				<span key={p.label} className="flex min-w-0 items-center gap-1.5">
					{i > 0 && <span className="text-muted-foreground/50">/</span>}
					{p.to ? (
						<Link
							to={p.to}
							className="text-muted-foreground hover:text-foreground"
						>
							{p.label}
						</Link>
					) : (
						<span
							className={
								i > 0 ? "truncate font-mono text-xs" : "text-muted-foreground"
							}
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
