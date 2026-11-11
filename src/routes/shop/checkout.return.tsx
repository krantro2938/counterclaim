import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { post } from "#/lib/api";

// Same-tab checkout: PayPal's approval page sends the buyer back here with
// `?token=<PayPal order id>&PayerID=…`. We capture, then show the receipt.
export const Route = createFileRoute("/shop/checkout/return")({
	validateSearch: z.object({ token: z.string().optional() }),
	component: Return,
});

function Return() {
	const { token } = Route.useSearch();
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const started = useRef(false);
	useEffect(() => {
		if (!token || started.current) return;
		started.current = true;
		post<{ orderNumber: number }>(
			`/api/shop/orders/${encodeURIComponent(token)}/capture`,
		)
			.then((r) =>
				navigate({
					to: "/shop/checkout/success",
					search: { order: r.orderNumber },
					replace: true,
				}),
			)
			.catch((e: Error) => setError(e.message));
	}, [token, navigate]);
	return (
		<div className="mx-auto max-w-xl px-4 py-20 text-center md:px-8">
			{!token || error ? (
				<>
					<h1 className="font-shop text-3xl font-semibold">
						We couldn't confirm your payment
					</h1>
					<p role="alert" className="mt-4 text-shop-muted">
						{error ?? "The PayPal order reference is missing."}
					</p>
					<Link
						to="/shop"
						className="mt-8 inline-block text-sm text-shop-accent hover:underline"
					>
						Back to the shop
					</Link>
				</>
			) : (
				<p className="text-lg text-shop-muted">Confirming your payment…</p>
			)}
		</div>
	);
}
