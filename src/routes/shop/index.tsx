import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api, qk } from "#/lib/api";
import { formatMoney } from "#/lib/money";

type Product = {
	id: number;
	slug: string;
	title: string;
	description: string;
	priceMinor: number;
	currency: string;
	imageUrl: string;
};

export const Route = createFileRoute("/shop/")({ component: ShopHome });

export function useProducts() {
	return useQuery({
		queryKey: qk.products,
		queryFn: () => api<{ products: Product[] }>("/api/shop/products"),
		staleTime: 60_000,
	});
}

function ShopHome() {
	const q = useProducts();
	return (
		<div className="mx-auto max-w-6xl px-4 md:px-8">
			<section className="grid items-center gap-8 py-12 md:grid-cols-2 md:py-16">
				<div>
					<p className="text-sm uppercase tracking-[0.18em] text-shop-accent">
						Autumn firing · small batch
					</p>
					<h1 className="mt-3 font-shop text-4xl leading-[1.05] font-semibold md:text-6xl">
						Pots for slow mornings.
					</h1>
					<p className="mt-4 max-w-md text-shop-muted">
						Every piece is thrown, trimmed and glazed by hand in our studio.
						Glazes move in the kiln, so no two are quite the same.
					</p>
				</div>
				<div className="aspect-[4/3] overflow-hidden rounded-2xl bg-[#eadfcf]">
					<img
						src="/products/vase.svg"
						alt="Speckled stoneware vase"
						className="h-full w-full object-cover"
					/>
				</div>
			</section>
			<section
				aria-label="Products"
				className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3"
			>
				{(q.data?.products ?? Array.from({ length: 6 }, () => null)).map(
					(p, i) =>
						p ? (
							<Link
								key={p.slug}
								to="/shop/p/$slug"
								params={{ slug: p.slug }}
								className="group block"
							>
								<div className="aspect-square overflow-hidden rounded-xl bg-[#eadfcf]">
									<img
										src={p.imageUrl}
										alt={p.title}
										className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
										loading="lazy"
									/>
								</div>
								<div className="mt-3 flex items-baseline justify-between gap-2">
									<h2 className="font-shop text-lg leading-tight">{p.title}</h2>
									<span className="tabular whitespace-nowrap text-shop-muted">
										{formatMoney(p.priceMinor, p.currency)}
									</span>
								</div>
							</Link>
						) : (
							// biome-ignore lint/suspicious/noArrayIndexKey: loading placeholders
							<div
								key={i}
								className="aspect-square animate-pulse rounded-xl bg-[#eadfcf]"
							/>
						),
				)}
			</section>
		</div>
	);
}
