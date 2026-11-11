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

const ink = "#2b2620";
const muted = "#7a7166";
const line = "#e3ddd3";
const seal = "#1f5c55";
const sim = "#7b55a8";

const s = StyleSheet.create({
	page: {
		padding: 40,
		paddingBottom: 56,
		fontFamily: "Bricolage",
		fontSize: 9.5,
		color: ink,
		lineHeight: 1.45,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
		borderBottomWidth: 2,
		borderBottomColor: seal,
		paddingBottom: 10,
		marginBottom: 14,
	},
	title: {
		fontFamily: "Bricolage",
		fontWeight: 600,
		fontSize: 20,
		lineHeight: 1.25,
	},
	sub: { color: muted, fontSize: 8.5, marginTop: 4 },
	mono: { fontFamily: "Bricolage", fontSize: 8.5 },
	h2: {
		fontFamily: "Bricolage",
		fontWeight: 600,
		fontSize: 12.5,
		marginTop: 14,
		marginBottom: 6,
	},
	grid: { flexDirection: "row", flexWrap: "wrap" },
	cell: { width: "50%", marginBottom: 5 },
	label: {
		color: muted,
		fontSize: 7.5,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	summary: {
		backgroundColor: "#f4f1ec",
		padding: 10,
		borderLeftWidth: 3,
		borderLeftColor: seal,
	},
	row: {
		flexDirection: "row",
		borderBottomWidth: 0.5,
		borderBottomColor: line,
		paddingVertical: 4,
	},
	th: { color: muted, fontSize: 7.5, textTransform: "uppercase" },
	footnote: {
		position: "absolute",
		bottom: 28,
		left: 40,
		right: 40,
		fontSize: 7.5,
		color: muted,
		borderTopWidth: 0.5,
		borderTopColor: line,
		paddingTop: 6,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	simTag: { color: sim },
});

const d = (iso?: string | null) =>
	iso
		? `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`
		: "—";
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
		: "—";

export type EvidenceInput = {
	cf: CaseFile;
	merchantName: string;
	summary: string;
	points: string[];
	generatedAt: Date;
};

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
	return (
		<Document
			title={`Evidence ${cf.disputeId}`}
			author={merchantName}
			creator="Counterclaim"
			producer="Counterclaim"
		>
			<Page size="A4" style={s.page}>
				<View style={s.header}>
					<View>
						<Text style={s.title}>
							Seller evidence: {cf.dispute.reasonLabel}
						</Text>
						<Text style={s.sub}>
							{merchantName} · PayPal dispute{" "}
							<Text style={s.mono}>{cf.disputeId}</Text>
						</Text>
					</View>
					<View style={{ alignItems: "flex-end" }}>
						<Text
							style={{
								fontFamily: "Bricolage",
								fontWeight: 600,
								fontSize: 16,
							}}
						>
							{formatMoney(cf.dispute.amountMinor, cf.dispute.currency)}
						</Text>
						<Text style={s.sub}>Generated {d(generatedAt.toISOString())}</Text>
					</View>
				</View>

				<View style={s.summary}>
					<Text style={{ fontWeight: 600, marginBottom: 3 }}>Summary</Text>
					<Text>{summary}</Text>
					{points.slice(0, 4).map((p) => (
						<Text key={p} style={{ marginTop: 2 }}>
							• {p}
						</Text>
					))}
				</View>

				<Text style={s.h2}>Order</Text>
				<View style={s.grid}>
					<View style={s.cell}>
						<Text style={s.label}>Order</Text>
						<Text>#{o?.number ?? "—"}</Text>
					</View>
					<View style={s.cell}>
						<Text style={s.label}>Paid</Text>
						<Text>{d(o?.capturedAt)}</Text>
					</View>
					<View style={s.cell}>
						<Text style={s.label}>PayPal order ID</Text>
						<Text style={s.mono}>{o?.paypalOrderId ?? "—"}</Text>
					</View>
					<View style={s.cell}>
						<Text style={s.label}>Capture (transaction) ID</Text>
						<Text style={s.mono}>{o?.captureId ?? "—"}</Text>
					</View>
					<View style={{ width: "100%", marginBottom: 5 }}>
						<Text style={s.label}>Items</Text>
						<Text>
							{o
								? o.items
										.map(
											(i) =>
												`${i.quantity} × ${i.title} (${formatMoney(i.unitMinor, o.currency)})`,
										)
										.join(", ")
								: "—"}
						</Text>
					</View>
					<View style={{ width: "100%", marginBottom: 5 }}>
						<Text style={s.label}>Shipping address confirmed by PayPal</Text>
						<Text>
							{addr(o?.paypalShippingAddress)}{" "}
							{cf.paypalShippingMatchesOrder
								? "— matches the ship-to address"
								: "— DIFFERS from the ship-to address"}
						</Text>
					</View>
				</View>

				<Text style={s.h2}>Fulfilment</Text>
				{sh ? (
					<>
						<View style={s.grid}>
							<View style={s.cell}>
								<Text style={s.label}>Carrier · tracking</Text>
								<Text>
									{sh.carrier} <Text style={s.mono}>{sh.trackingNumber}</Text>
									{sh.simulated ? <Text style={s.simTag}> *</Text> : null}
								</Text>
							</View>
							<View style={s.cell}>
								<Text style={s.label}>Tracking uploaded to PayPal</Text>
								<Text>{d(sh.uploadedToPaypalAt)}</Text>
							</View>
						</View>
						<View style={[s.row, { borderBottomWidth: 1 }]}>
							<Text style={[s.th, { width: "30%" }]}>Time</Text>
							<Text style={[s.th, { width: "40%" }]}>Event</Text>
							<Text style={[s.th, { width: "30%" }]}>Location</Text>
						</View>
						{cf.carrierEvents.map((e) => (
							<View key={`${e.code}-${e.at}`} style={s.row}>
								<Text style={[s.mono, { width: "30%" }]}>{d(e.at)}</Text>
								<Text style={{ width: "40%" }}>
									{e.description}
									{e.simulated ? <Text style={s.simTag}> *</Text> : null}
								</Text>
								<Text style={{ width: "30%" }}>{e.location ?? "—"}</Text>
							</View>
						))}
					</>
				) : (
					<Text>No shipment recorded.</Text>
				)}

				{cf.messages.length > 0 && (
					<>
						<Text style={s.h2}>Communication with the buyer</Text>
						{cf.messages.slice(-5).map((m) => (
							<View key={m.at + m.body.slice(0, 10)} style={s.row}>
								<Text style={[s.mono, { width: "26%" }]}>{d(m.at)}</Text>
								<Text style={{ width: "14%", color: muted }}>
									{m.direction === "in" ? "Buyer" : "Merchant"}
								</Text>
								<Text style={{ width: "60%" }}>
									{m.body.length > 160 ? `${m.body.slice(0, 160)}…` : m.body}
								</Text>
							</View>
						))}
					</>
				)}

				<Text style={s.h2}>Store policy</Text>
				{cf.storePolicy
					.filter((p) =>
						cf.dispute.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"
							? p.section !== "shipping"
							: p.section !== "handmade_variation",
					)
					.map((p) => (
						<View key={p.section} style={{ marginBottom: 5 }}>
							<Text style={{ fontWeight: 600 }}>{p.title}</Text>
							<Text>{p.body}</Text>
						</View>
					))}

				<View style={s.footnote} fixed>
					<Text>
						{anySim
							? "* Tracking number and carrier events generated by the sandbox carrier simulator (CarrierSim)."
							: "Prepared by Counterclaim for PayPal dispute review."}
					</Text>
					<Text
						render={({ pageNumber, totalPages }) =>
							`${pageNumber} / ${totalPages}`
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
