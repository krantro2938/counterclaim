import { createHash } from "node:crypto";
import {
	Document,
	Page,
	renderToBuffer,
	StyleSheet,
	Text,
	View,
} from "@react-pdf/renderer";
import { formatMoney } from "#/lib/money";
import type { CaseFile } from "../casefile";

/**
 * Evidence packet (SPEC §8): a plain, formal A4 report for PayPal's dispute reviewer.
 * Built-in Helvetica, numbered sections, ruled tables, no decoration. Generated in the worker.
 */

const ink = "#111111";
const grey = "#555555";
const rule = "#c8c8c8";
const faint = "#ebebeb";

const s = StyleSheet.create({
	page: {
		paddingTop: 44,
		paddingHorizontal: 50,
		paddingBottom: 60,
		fontFamily: "Helvetica",
		fontSize: 9.5,
		color: ink,
		lineHeight: 1.4,
	},
	masthead: {
		flexDirection: "row",
		justifyContent: "space-between",
		fontSize: 8,
		color: grey,
		marginBottom: 18,
	},
	title: {
		fontFamily: "Helvetica-Bold",
		fontSize: 16,
		lineHeight: 1.25,
		marginBottom: 6,
	},
	subtitle: { fontSize: 10, color: grey, marginBottom: 14 },
	refTable: {
		borderTopWidth: 1,
		borderTopColor: ink,
		borderBottomWidth: 1,
		borderBottomColor: ink,
		marginBottom: 18,
	},
	refRow: { flexDirection: "row", paddingVertical: 3.5 },
	refLabel: { width: "28%", color: grey },
	refValue: { width: "72%" },
	h2: {
		fontFamily: "Helvetica-Bold",
		fontSize: 10.5,
		marginTop: 6,
		marginBottom: 6,
		paddingBottom: 3,
		borderBottomWidth: 0.75,
		borderBottomColor: rule,
	},
	section: { marginBottom: 12 },
	para: { marginBottom: 5 },
	item: { flexDirection: "row", marginBottom: 3 },
	itemNo: { width: 18, color: grey },
	row: {
		flexDirection: "row",
		paddingVertical: 3,
		borderBottomWidth: 0.5,
		borderBottomColor: faint,
	},
	head: {
		flexDirection: "row",
		paddingVertical: 3,
		borderBottomWidth: 0.75,
		borderBottomColor: rule,
		fontFamily: "Helvetica-Bold",
		fontSize: 8.5,
	},
	label: { width: "32%", color: grey },
	value: { width: "68%" },
	small: { fontSize: 8, color: grey },
	footer: {
		position: "absolute",
		bottom: 28,
		left: 50,
		right: 50,
		flexDirection: "row",
		justifyContent: "space-between",
		fontSize: 7.5,
		color: grey,
		borderTopWidth: 0.5,
		borderTopColor: rule,
		paddingTop: 5,
	},
});

const d = (iso?: string | null) =>
	iso
		? `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`
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

function KV({ k, v }: { k: string; v: string }) {
	return (
		<View style={s.row} wrap={false}>
			<Text style={s.label}>{k}</Text>
			<Text style={s.value}>{v}</Text>
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
	let n = 0;
	const H = ({ children }: { children: string }) => (
		<Text style={s.h2}>
			{++n}. {children}
		</Text>
	);
	return (
		<Document
			title={`Evidence ${cf.disputeId}`}
			author={merchantName}
			creator="Counterclaim"
			producer="Counterclaim"
		>
			<Page size="A4" style={s.page}>
				<View style={s.masthead}>
					<Text>{merchantName}</Text>
					<Text>Seller evidence submission</Text>
				</View>

				<Text style={s.title}>Response to PayPal dispute {cf.disputeId}</Text>
				<Text style={s.subtitle}>
					{cf.dispute.reasonLabel},{" "}
					{formatMoney(cf.dispute.amountMinor, cf.dispute.currency)}
				</Text>

				<View style={s.refTable}>
					{[
						["Dispute ID", cf.disputeId],
						["Order", o ? `#${o.number}` : "Not recorded"],
						["Transaction ID", o?.captureId ?? "Not recorded"],
						[
							"Amount in dispute",
							formatMoney(cf.dispute.amountMinor, cf.dispute.currency),
						],
						["Prepared", d(generatedAt.toISOString())],
					].map(([k, v]) => (
						<View key={k} style={s.refRow}>
							<Text style={s.refLabel}>{k}</Text>
							<Text style={s.refValue}>{v}</Text>
						</View>
					))}
				</View>

				<View style={s.section}>
					<H>Statement</H>
					<Text style={s.para}>{summary}</Text>
					{points.slice(0, 4).map((p, i) => (
						<View key={p} style={s.item}>
							<Text style={s.itemNo}>{String.fromCharCode(97 + i)})</Text>
							<Text style={{ flex: 1 }}>{p}</Text>
						</View>
					))}
				</View>

				<View style={s.section} wrap={false}>
					<H>Order details</H>
					<KV k="Date paid" v={d(o?.capturedAt)} />
					<KV
						k="Items"
						v={
							o
								? o.items
										.map(
											(i) =>
												`${i.quantity} x ${i.title} (${formatMoney(i.unitMinor, o.currency)})`,
										)
										.join("; ")
								: "Not recorded"
						}
					/>
					<KV k="PayPal order ID" v={o?.paypalOrderId ?? "Not recorded"} />
					<KV
						k="Shipping address on PayPal"
						v={addr(o?.paypalShippingAddress)}
					/>
					<KV
						k="Address check"
						v={
							cf.paypalShippingMatchesOrder
								? "The parcel was sent to the address confirmed by PayPal."
								: "The parcel was sent to a different address than the one confirmed by PayPal."
						}
					/>
				</View>

				<View style={s.section} wrap={false}>
					<H>Proof of shipment and delivery</H>
					{sh ? (
						<>
							<KV
								k="Carrier and tracking number"
								v={`${sh.carrier} ${sh.trackingNumber}${sh.simulated ? " *" : ""}`}
							/>
							<KV
								k="Tracking shared with PayPal"
								v={d(sh.uploadedToPaypalAt)}
							/>
							<View style={[s.head, { marginTop: 8 }]}>
								<Text style={{ width: "28%" }}>Date and time</Text>
								<Text style={{ width: "44%" }}>Carrier event</Text>
								<Text style={{ width: "28%" }}>Location</Text>
							</View>
							{cf.carrierEvents.map((e) => (
								<View key={`${e.code}-${e.at}`} style={s.row}>
									<Text style={{ width: "28%" }}>{d(e.at)}</Text>
									<Text style={{ width: "44%" }}>
										{e.description}
										{e.simulated ? " *" : ""}
									</Text>
									<Text style={{ width: "28%" }}>{e.location ?? ""}</Text>
								</View>
							))}
						</>
					) : (
						<Text>No shipment recorded.</Text>
					)}
				</View>

				{cf.messages.length > 0 && (
					<View style={s.section} wrap={false}>
						<H>Correspondence with the buyer</H>
						<View style={s.head}>
							<Text style={{ width: "28%" }}>Date and time</Text>
							<Text style={{ width: "14%" }}>From</Text>
							<Text style={{ width: "58%" }}>Message</Text>
						</View>
						{cf.messages.slice(-5).map((m) => (
							<View key={m.at + m.body.slice(0, 10)} style={s.row}>
								<Text style={{ width: "28%" }}>{d(m.at)}</Text>
								<Text style={{ width: "14%" }}>
									{m.direction === "in" ? "Buyer" : "Seller"}
								</Text>
								<Text style={{ width: "58%" }}>
									{m.body.length > 220 ? `${m.body.slice(0, 220)}...` : m.body}
								</Text>
							</View>
						))}
					</View>
				)}

				<View style={s.section} wrap={false}>
					<H>Store policy</H>
					{cf.storePolicy
						.filter((p) =>
							cf.dispute.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"
								? p.section !== "shipping"
								: p.section !== "handmade_variation",
						)
						.map((p) => (
							<KV key={p.section} k={p.title} v={p.body} />
						))}
				</View>

				{anySim && (
					<Text style={s.small}>
						* Generated by the sandbox carrier simulator used for this
						demonstration.
					</Text>
				)}

				<View style={s.footer} fixed>
					<Text>
						{merchantName} · Dispute {cf.disputeId}
					</Text>
					<Text
						render={({ pageNumber, totalPages }) =>
							`Page ${pageNumber} of ${totalPages}`
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
