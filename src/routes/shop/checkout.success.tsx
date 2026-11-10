import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/shop/checkout/success")({
	validateSearch: z.object({ order: z.coerce.number().optional() }),
	component: Success,
});

function Success() {
	const { order } = Route.useSearch();
	return (
		<div className="mx-auto max-w-xl px-4 py-20 text-center md:px-8">
			<p className="text-sm uppercase tracking-[0.18em] text-shop-accent">Thank you</p>
			<h1 className="mt-3 font-shop text-4xl font-semibold">Your order is in.</h1>
			{order && <p className="mt-4 text-lg">Order #{order}</p>}
			<p className="mt-4 text-shop-muted">We'll pack it carefully and send tracking as soon as it ships, usually within two business days.</p>
			<div className="mt-8 flex justify-center gap-6 text-sm">
				<Link to="/shop" className="text-shop-accent hover:underline">
					Keep browsing
				</Link>
				<a href="/app/orders" className="text-shop-muted hover:underline">
					Merchant view →
				</a>
			</div>
		</div>
	);
}
