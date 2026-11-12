import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
	Document,
	Font,
	Page,
	renderToBuffer,
	StyleSheet,
	Text,
	View,
} from "@react-pdf/renderer";
import { formatMoney } from "#/lib/money";
import type { CaseFile } from "../casefile";

/** Evidence packet (SPEC §8): one or two A4 pages, designed with the Counterclaim fonts. Generated in the worker. */

const require = createRequire(import.meta.url);
let fontsReady = false;
function registerFonts() {
	if (fontsReady) return;
	Font.register({
		family: "Bricolage",
		fonts: [
			{
				src: require.resolve(
					"@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-400-normal.woff",
				),
				fontWeight: 400,
			},
			{
				src: require.resolve(
					"@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-500-normal.woff",
				),
				fontWeight: 500,
			},
			{
				src: require.resolve(
					"@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-600-normal.woff",
				),
				fontWeight: 600,
			},
			{
				src: require.resolve(
					"@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff",
				),
				fontWeight: 700,
			},
		],
	});
	Font.registerHyphenationCallback((w) => [w]);
	fontsReady = true;
}

// Colours from the app's tokens (src/styles.css), so the packet reads as part of the product.
const ink = "#232a25";
const muted = "#737a73";
const line = "#e4e7df";
const paper = "#f3f4ee";
const green = "#2e6b4c";
const greenSoft = "#e7f0e7";
const sim = "#7b55a8";

const s = StyleSheet.create({
	page: {
		padding: 32,
		paddingBottom: 54,
		backgroundColor: paper,
		fontFamily: "Bricolage",
		fontSize: 9.5,
		color: ink,
		lineHeight: 1.45,
	},
	brand: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
	brandDot: {
		width: 16,
		height: 16,
		borderRadius: 8,
		backgroundColor: green,
		marginRight: 6,
	},
	brandName: { fontWeight: 600, fontSize: 10.5 },
	brandMeta: { color: muted, fontSize: 8.5, marginLeft: "auto" },
	card: {
		backgroundColor: "#ffffff",
		borderRadius: 12,
		borderWidth: 1,
		borderColor: line,
		padding: 16,
		marginBottom: 10,
	},
	hero: { flexDirection: "row", justifyContent: "space-between" },
	eyebrow: { color: muted, fontSize: 8.5, marginBottom: 3 },
	title: { fontWeight: 600, fontSize: 19, lineHeight: 1.2 },
	sub: { color: muted, fontSize: 8.5, marginTop: 5 },
	amount: { fontWeight: 600, fontSize: 19, textAlign: "right" },
	pill: {
		alignSelf: "flex-end",
		backgroundColor: greenSoft,
		color: green,
		borderRadius: 10,
		paddingVertical: 2,
		paddingHorizontal: 7,
		fontSize: 8,
		marginTop: 6,
	},
	summary: {
		backgroundColor: greenSoft,
		borderRadius: 12,
		padding: 16,
		marginBottom: 10,
	},
	h2: { fontWeight: 600, fontSize: 11.5, marginBottom: 8 },
	point: { flexDirection: "row", marginTop: 5 },
	pointNo: {
		width: 15,
		height: 15,
		borderRadius: 7.5,
		backgroundColor: "#ffffff",
		alignItems: "center",
		justifyContent: "center",
		marginRight: 7,
	},
	pointNoText: { color: green, fontSize: 7.5, fontWeight: 600, lineHeight: 1 },
	grid: { flexDirection: "row", flexWrap: "wrap" },
	cell: { width: "50%", marginBottom: 8, paddingRight: 8 },
	full: { width: "100%", marginBottom: 8 },
	label: { color: muted, fontSize: 8, marginBottom: 1 },
	mono: { fontSize: 8.5 },
	event: { flexDirection: "row", paddingBottom: 7 },
	rail: { width: 14, alignItems: "center" },
	dot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 3 },
	eventTime: { color: muted, fontSize: 8 },
	bubbleIn: {
		backgroundColor: paper,
		borderRadius: 10,
		padding: 9,
		marginBottom: 6,
		marginRight: 60,
	},
	bubbleOut: {
		backgroundColor: greenSoft,
		borderRadius: 10,
		padding: 9,
		marginBottom: 6,
		marginLeft: 60,
	},
	footnote: {
		position: "absolute",
		bottom: 24,
		left: 32,
		right: 32,
		fontSize: 7.5,
		color: muted,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	simTag: { color: sim },
});

const d = (iso?: string | null) =>
	iso
		? `${new Date(iso).toLocaleString("en-GB", {
				day: "numeric",
				month: "short",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
				timeZone: "UTC",
			})} UTC`
		: "Not recorded";
const addr = (
	a?: {
		name?: string;
		line1?: string;
		line2?: string;
		city?: string;
		state?: string;
		postalCode?: string;
		countryCode?: string;
	} | null,
) =>
	a
		? [
				a.name,
				a.line1,
				a.line2,
				[a.city, a.state, a.postalCode].filter(Boolean).join(" "),
				a.countryCode,
			]
				.filter(Boolean)
				.join(", ")
		: "Not recorded";

export type EvidenceInput = {
	cf: CaseFile;
	merchantName: string;
	summary: string;
	points: string[];
	generatedAt: Date;
};

function Field({
	label,
	children,
	wide,
}: {
	label: string;
	children: React.ReactNode;
	wide?: boolean;
}) {
	return (
		<View style={wide ? s.full : s.cell}>
			<Text style={s.label}>{label}</Text>
			<Text>{children}</Text>
		</View>
	);
}

function Packet({
	cf,
	merchantName,
	summary,
	points,
	generatedAt,
}: EvidenceInput) {
	const o = cf.order;
	const sh = cf.shipment;
	const anySim = Boolean(
		sh?.simulated || cf.carrierEvents.some((e) => e.simulated),
	);
	const events = cf.carrierEvents;
	return (
		<Document
			title={`Evidence ${cf.disputeId}`}
			author={merchantName}
			creator="Counterclaim"
			producer="Counterclaim"
		>
			<Page size="A4" style={s.page}>
				<View style={s.brand}>
					<View style={s.brandDot} />
					<Text style={s.brandName}>{merchantName}</Text>
					<Text style={s.brandMeta}>
						Prepared {d(generatedAt.toISOString())}
					</Text>
				</View>

				<View style={[s.card, s.hero]}>
					<View style={{ maxWidth: "70%" }}>
						<Text style={s.eyebrow}>Seller response to a PayPal dispute</Text>
						<Text style={s.title}>{cf.dispute.reasonLabel}</Text>
						<Text style={s.sub}>Case {cf.disputeId}</Text>
					</View>
					<View>
						<Text style={s.amount}>
							{formatMoney(cf.dispute.amountMinor, cf.dispute.currency)}
						</Text>
						<Text style={s.pill}>Order #{o?.number ?? "?"}</Text>
					</View>
				</View>

				<View style={s.summary}>
					<Text style={s.h2}>Why this order was fulfilled</Text>
					<Text>{summary}</Text>
					{points.slice(0, 4).map((p, i) => (
						<View key={p} style={s.point}>
							<View style={s.pointNo}>
								<Text style={s.pointNoText}>{i + 1}</Text>
							</View>
							<Text style={{ flex: 1 }}>{p}</Text>
						</View>
					))}
				</View>

				<View style={s.card} wrap={false}>
					<Text style={s.h2}>Order</Text>
					<View style={s.grid}>
						<Field label="Paid">{d(o?.capturedAt)}</Field>
						<Field label="Items">
							{o
								? o.items
										.map(
											(i) =>
												`${i.quantity} × ${i.title} (${formatMoney(i.unitMinor, o.currency)})`,
										)
										.join(", ")
								: "Not recorded"}
						</Field>
						<Field label="PayPal order ID">
							{o?.paypalOrderId ?? "Not recorded"}
						</Field>
						<Field label="Transaction ID">
							{o?.captureId ?? "Not recorded"}
						</Field>
						<Field label="Ship-to address confirmed by PayPal" wide>
							{addr(o?.paypalShippingAddress)}
							{cf.paypalShippingMatchesOrder
								? ". Same as the address the parcel was sent to."
								: ". Differs from the address the parcel was sent to."}
						</Field>
					</View>
				</View>

				<View style={s.card} wrap={false}>
					<Text style={s.h2}>Delivery</Text>
					{sh ? (
						<>
							<View style={s.grid}>
								<Field label="Carrier and tracking">
									{sh.carrier} {sh.trackingNumber}
									{sh.simulated ? <Text style={s.simTag}> *</Text> : null}
								</Field>
								<Field label="Tracking shared with PayPal">
									{d(sh.uploadedToPaypalAt)}
								</Field>
							</View>
							<View style={{ marginTop: 4 }}>
								{events.map((e, i) => (
									<View key={`${e.code}-${e.at}`} style={s.event}>
										<View style={s.rail}>
											<View
												style={[
													s.dot,
													{
														backgroundColor:
															i === events.length - 1 ? green : line,
													},
												]}
											/>
										</View>
										<View style={{ flex: 1 }}>
											<Text
												style={
													i === events.length - 1 ? { fontWeight: 600 } : {}
												}
											>
												{e.description}
												{e.simulated ? <Text style={s.simTag}> *</Text> : null}
											</Text>
											<Text style={s.eventTime}>
												{d(e.at)}
												{e.location ? `  ·  ${e.location}` : ""}
											</Text>
										</View>
									</View>
								))}
							</View>
						</>
					) : (
						<Text>No shipment recorded.</Text>
					)}
				</View>

				{cf.messages.length > 0 && (
					<View style={s.card} wrap={false}>
						<Text style={s.h2}>Messages with the buyer</Text>
						{cf.messages.slice(-5).map((m) => (
							<View
								key={m.at + m.body.slice(0, 10)}
								style={m.direction === "in" ? s.bubbleIn : s.bubbleOut}
							>
								<Text style={s.eventTime}>
									{m.direction === "in" ? "Buyer" : merchantName} · {d(m.at)}
								</Text>
								<Text>
									{m.body.length > 220 ? `${m.body.slice(0, 220)}…` : m.body}
								</Text>
							</View>
						))}
					</View>
				)}

				<View style={s.card} wrap={false}>
					<Text style={s.h2}>Store policy</Text>
					{cf.storePolicy
						.filter((p) =>
							cf.dispute.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"
								? p.section !== "shipping"
								: p.section !== "handmade_variation",
						)
						.map((p) => (
							<View key={p.section} style={{ marginBottom: 6 }}>
								<Text style={{ fontWeight: 600 }}>{p.title}</Text>
								<Text style={{ color: muted }}>{p.body}</Text>
							</View>
						))}
				</View>

				<View style={s.footnote} fixed>
					<Text>
						{anySim
							? "* Tracking and carrier scans come from the sandbox carrier simulator."
							: `Prepared for PayPal's dispute review by ${merchantName}.`}
					</Text>
					<Text
						render={({ pageNumber, totalPages }) =>
							`${pageNumber} of ${totalPages}`
						}
					/>
				</View>
			</Page>
		</Document>
	);
}

/** Fact-ID citations are for the UI; PayPal's reviewer gets clean prose. */
const stripCitations = (t: string) =>
	t
		.replace(/\s*\((?:(?:F\d+|PP:[^)]+)(?:,\s*)?)+\)/g, "")
		.replace(/\s*\[(?:F\d+(?:,\s*)?)+\]/g, "");

export async function renderEvidencePdf(
	input: EvidenceInput,
): Promise<{ bytes: Buffer; sha256: string; filename: string }> {
	registerFonts();
	const clean = {
		...input,
		summary: stripCitations(input.summary),
		points: input.points.map(stripCitations),
	};
	const bytes = await renderToBuffer(<Packet {...clean} />);
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	const filename = `evidence-${input.cf.disputeId}.pdf`;
	return { bytes, sha256, filename };
}
