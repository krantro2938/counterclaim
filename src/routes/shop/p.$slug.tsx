import {
	PayPalOneTimePaymentButton,
	PayPalProvider,
} from "@paypal/react-paypal-js/sdk-v6";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ClientOnly } from "#/components/grid";
import { api, post } from "#/lib/api";
import { formatMoney } from "#/lib/money";
import { useProducts } from "./index";

export const Route = createFileRoute("/shop/p/$slug")({
	component: ProductPage,
});

const DISCLAIMER =
	"Each piece is hand-thrown and hand-glazed in our studio, so glaze colour, speckling and size vary slightly from the photos. No two are identical.";

function ProductPage() {
	const { slug } = Route.useParams();
	const q = useProducts();
	const p = q.data?.products.find((x) => x.slug === slug);
	if (q.isLoading)
		return <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">Loading…</div>;
	if (!p)
		return (
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
				Not found. <Link to="/shop">Back to the shop</Link>
			</div>
		);
	return (
		<div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:grid-cols-2 md:px-8 md:py-14">
			<div className="aspect-square overflow-hidden rounded-2xl bg-[#eadfcf]">
				<img
					src={p.imageUrl}
					alt={p.title}
					className="h-full w-full object-cover"
				/>
			</div>
			<div>
				<Link
					to="/shop"
					className="text-sm text-shop-muted hover:text-shop-ink"
				>
					← All pieces
				</Link>
				<h1 className="mt-3 font-shop text-4xl leading-tight font-semibold">
					{p.title}
				</h1>
				<p className="mt-2 text-2xl tabular">
					{formatMoney(p.priceMinor, p.currency)}
				</p>
				<p className="mt-6 leading-relaxed text-shop-muted">{p.description}</p>
				<p className="mt-4 rounded-lg border border-shop-line bg-white/50 p-4 text-sm leading-relaxed">
					<span className="font-medium">Handmade variation.</span> {DISCLAIMER}
				</p>
				<div className="mt-8 max-w-sm">
					<ClientOnly
						fallback={<div className="h-12 rounded-full bg-[#eadfcf]" />}
					>
						<Checkout slug={p.slug} />
					</ClientOnly>
					<p className="mt-3 text-xs text-shop-muted">
						Ships in 2 business days via USPS with tracking. Sandbox store: use
						a PayPal sandbox buyer account.
					</p>
				</div>
			</div>
		</div>
	);
}

function Checkout({ slug }: { slug: string }) {
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const cfg = useQuery({
		queryKey: ["shop-config"],
		queryFn: () =>
			api<{
				paypalClientId: string | null;
				environment: "sandbox" | "production";
			}>("/api/shop/config"),
		staleTime: Number.POSITIVE_INFINITY,
	});
	if (cfg.isLoading) return <div className="h-12 rounded-full bg-[#eadfcf]" />;
	if (!cfg.data?.paypalClientId) {
		return (
			<p className="rounded-lg border border-shop-line p-4 text-sm text-shop-muted">
				Checkout is unavailable: the PayPal sandbox is not configured for this
				deployment.
			</p>
		);
	}
	return (
		<div>
			<PayPalProvider
				clientId={cfg.data.paypalClientId}
				environment={cfg.data.environment}
				components={["paypal-payments"]}
				pageType="product-details"
			>
				<PayPalOneTimePaymentButton
					createOrder={async () => {
						setError(null);
						const r = await post<{ paypalOrderId: string }>(
							"/api/shop/orders",
							{ slug, quantity: 1 },
						);
						return { orderId: r.paypalOrderId };
					}}
					onApprove={async (data: { orderId: string }) => {
						setBusy(true);
						try {
							const r = await post<{ orderNumber: number }>(
								`/api/shop/orders/${data.orderId}/capture`,
							);
							navigate({
								to: "/shop/checkout/success",
								search: { order: r.orderNumber },
							});
						} catch (e) {
							setError((e as Error).message);
						} finally {
							setBusy(false);
						}
					}}
					onCancel={() => setError("Payment cancelled.")}
					onError={(e: Error) => setError(e.message)}
				/>
			</PayPalProvider>
			{busy && (
				<p className="mt-2 text-sm text-shop-muted">Confirming your payment…</p>
			)}
			{error && (
				<p role="alert" className="mt-2 text-sm text-[oklch(0.5_0.17_28)]">
					{error}
				</p>
			)}
		</div>
	);
}
