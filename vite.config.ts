import { existsSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Server code reads process.env; load .env in dev so SSR and server routes see it.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
	resolve: { tsconfigPaths: true },
	server: { port: 3000 },
	ssr: {
		// keep heavy server-only deps out of the SSR bundle; they are resolved from node_modules at runtime
		external: [
			"@react-pdf/renderer",
			"postgres",
			"pino",
			"@paypal/agent-toolkit",
		],
	},
	plugins: [
		// React-PDF resolves its built-in fonts through package.json "imports" ("#standard-fonts/…"),
		// which breaks when Nitro inlines it into _libs: ship it as real node_modules packages instead.
		nitro({
			traceDeps: ["@react-pdf/renderer*", "@react-pdf/font*", "pdfkit*"],
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});
