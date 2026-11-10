import { createFileRoute } from "@tanstack/react-router";
import { handle, json } from "#/server/http";
import { listProducts } from "#/server/shop";

export const Route = createFileRoute("/api/shop/products")({
	server: {
		handlers: {
			GET: handle(async () => json({ products: await listProducts() })),
		},
	},
});
