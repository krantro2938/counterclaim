/** Demo content for Kiln & Thread (the storefront) — products and store policies. */

export const HANDMADE_DISCLAIMER =
	"Each piece is hand-thrown and hand-glazed in our studio, so glaze colour, speckling and size vary slightly from the photos. No two are identical.";

export const PRODUCTS = [
	{
		slug: "speckled-stoneware-vase",
		title: "Speckled Stoneware Vase",
		description:
			"A tall, hand-thrown vase in our oatmeal speckle glaze. Holds fresh stems or stands alone on a shelf. 24 cm tall, watertight, food-safe glaze.",
		priceMinor: 6400,
		imageUrl: "/products/vase.svg",
		sortOrder: 1,
	},
	{
		slug: "celadon-serving-bowl",
		title: "Celadon Serving Bowl",
		description:
			"A wide serving bowl in a pale celadon glaze that pools darker in the throwing lines. 28 cm across. Dishwasher safe.",
		priceMinor: 4800,
		imageUrl: "/products/bowl.svg",
		sortOrder: 2,
	},
	{
		slug: "morning-mug-pair",
		title: "Morning Mugs, Pair",
		description:
			"Two 350 ml mugs with a generous handle, glazed in warm ash on the outside and cream inside. Sold as a pair.",
		priceMinor: 3600,
		imageUrl: "/products/mugs.svg",
		sortOrder: 3,
	},
	{
		slug: "linen-tea-towels",
		title: "Linen Tea Towels, Set of 2",
		description:
			"Stonewashed linen towels, hand-printed with our kiln-stripe pattern. 50 × 70 cm. Softens with every wash.",
		priceMinor: 2200,
		imageUrl: "/products/towels.svg",
		sortOrder: 4,
	},
	{
		slug: "ash-glaze-tea-cup",
		title: "Tea Cup, Ash Glaze",
		description: "A small handleless tea cup that sits warm in the palm. 180 ml.",
		priceMinor: 1150,
		imageUrl: "/products/cup.svg",
		sortOrder: 5,
	},
	{
		slug: "mini-bud-vase",
		title: "Mini Bud Vase",
		description: "A palm-sized bud vase for a single stem. 9 cm tall.",
		priceMinor: 940,
		imageUrl: "/products/budvase.svg",
		sortOrder: 6,
	},
] as const;

export const POLICIES = [
	{
		section: "shipping",
		title: "Shipping",
		body: "Orders ship within 2 business days from our studio in San Francisco via USPS Ground Advantage. Every parcel has tracking, and we upload the tracking number to PayPal as soon as the label is printed. Delivery usually takes 3–5 business days in the US. We ship to the address you confirm in PayPal.",
	},
	{
		section: "returns",
		title: "Returns & refunds",
		body: "You can return unused items within 30 days of delivery for a full refund of the item price. If a piece arrives damaged, send us a photo within 7 days and we will replace it or refund it in full, including shipping. Return shipping for change-of-mind returns is paid by the buyer.",
	},
	{
		section: "handmade_variation",
		title: "Handmade variation",
		body: `${HANDMADE_DISCLAIMER} Variations in glaze colour are part of the handmade process and are not considered defects. If the colour is very different from what you expected, contact us and we will help, usually with a partial refund or an exchange.`,
	},
] as const;
