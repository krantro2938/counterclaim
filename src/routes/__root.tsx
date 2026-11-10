import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { ThemeProvider, themeScript } from "#/components/theme";
import { Toaster } from "#/components/ui/sonner";
import { TooltipProvider } from "#/components/ui/tooltip";
import appCss from "../styles.css?url";

interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Counterclaim — AI dispute agent for PayPal merchants" },
			{ name: "description", content: "Counterclaim defends small PayPal merchants against disputes, and prevents them before they happen." },
			{ name: "theme-color", content: "#f8f6f2" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
		],
	}),
	shellComponent: RootDocument,
	component: () => <Outlet />,
	notFoundComponent: NotFound,
});

function NotFound() {
	return (
		<div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
			<p className="font-display text-3xl">Nothing here.</p>
			<p className="text-muted-foreground">That page doesn't exist.</p>
			<a className="text-primary underline underline-offset-4" href="/app">
				Back to Counterclaim
			</a>
		</div>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap, avoids a flash of the wrong theme */}
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
				<HeadContent />
			</head>
			<body>
				<ThemeProvider>
					<TooltipProvider delayDuration={250}>
						{children}
						<Toaster position="bottom-right" closeButton />
					</TooltipProvider>
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
