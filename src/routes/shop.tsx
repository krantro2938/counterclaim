import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/shop")({
	component: ShopLayout,
	head: () => ({ meta: [{ title: "Kiln & Thread — handmade ceramics" }] }),
});

function ShopLayout() {
	useEffect(() => {
		document.documentElement.classList.remove("dark");
	}, []);
	return (
		<div className="min-h-screen bg-shop-bg text-[16px] text-shop-ink" style={{ fontSize: 16 }}>
			<header className="border-b border-shop-line">
				<div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-8">
					<Link to="/shop" className="font-shop text-2xl font-semibold tracking-tight">
						Kiln &amp; Thread
					</Link>
					<nav className="flex items-center gap-6 text-sm text-shop-muted">
						<Link to="/shop" className="hover:text-shop-ink">
							Shop
						</Link>
						<a href="#about" className="hidden hover:text-shop-ink sm:inline">
							Our studio
						</a>
					</nav>
				</div>
			</header>
			<main>
				<Outlet />
			</main>
			<footer id="about" className="mt-20 border-t border-shop-line">
				<div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-shop-muted md:grid-cols-3 md:px-8">
					<div>
						<p className="font-shop text-lg text-shop-ink">Kiln &amp; Thread</p>
						<p className="mt-2">A two-person studio in San Francisco making wheel-thrown stoneware and printed linen.</p>
					</div>
					<div>
						<p className="font-medium text-shop-ink">Shipping & returns</p>
						<p className="mt-2">Ships in 2 business days with USPS tracking. 30-day returns on unused items.</p>
					</div>
					<div className="md:text-right">
						<p className="text-xs uppercase tracking-wide">Sandbox demo store</p>
						<a href="/app" className="mt-2 inline-block font-medium text-shop-accent hover:underline">
							Merchant? Open Counterclaim →
						</a>
					</div>
				</div>
			</footer>
		</div>
	);
}
