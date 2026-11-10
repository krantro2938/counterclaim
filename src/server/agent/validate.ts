import { toMinor } from "#/lib/money";
import type { CaseFile } from "../casefile";
import { validateActionParams } from "../policy/params";
import type { Assessment, ProposedAction } from "./schema";

/** Model output is untrusted. This decides what survives (SPEC §7.3 "Validation"). */

export type ValidationEntry = { ok: boolean; what: string; detail: string };
export type ValidAction = {
	type: string;
	params: Record<string, unknown>;
	rationale: string;
};
export type ValidatedAssessment = {
	reasoning: { point: string; factIds: string[] }[];
	risks: string[];
	missing: string[];
	actions: ValidAction[];
	log: ValidationEntry[];
	headline: string;
	recommended: Assessment["recommended_action"];
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;

function piiProblem(text: string, cf: CaseFile): string | null {
	const known = JSON.stringify(cf).toLowerCase();
	for (const m of text.match(EMAIL) ?? [])
		if (!known.includes(m.toLowerCase())) return `unknown email address ${m}`;
	for (const m of text.match(PHONE) ?? []) {
		const digits = m.replace(/\D/g, "");
		// tracking numbers are long digit strings that do appear in the case file
		if (digits.length >= 9 && !known.includes(digits))
			return `unknown phone/number ${m.trim()}`;
	}
	return null;
}

function normalise(
	p: ProposedAction,
	cf: CaseFile,
): { type: string; params: Record<string, unknown> } {
	const x = p.params;
	switch (p.type) {
		case "send_message":
			return { type: p.type, params: { message: x.message ?? x.note ?? "" } };
		case "provide_evidence":
			return {
				type: p.type,
				params: {
					evidenceType: cf.shipment ? "PROOF_OF_FULFILLMENT" : "OTHER",
					notes: x.evidence_notes ?? x.note ?? p.rationale,
					includeTracking: Boolean(cf.shipment),
					includePdf: true,
				},
			};
		case "make_offer":
			return {
				type: p.type,
				params: {
					offerType: x.offer_type ?? "REFUND",
					amountMinor: x.amount
						? toMinor(x.amount.replace(/[$,\s]/g, ""), cf.dispute.currency)
						: undefined,
					note: x.note ?? x.message ?? p.rationale,
				},
			};
		case "accept_claim": {
			const partial = x.accept_claim_type === "PARTIAL_REFUND";
			return {
				type: p.type,
				params: {
					note:
						x.note ??
						x.message ??
						"We have accepted your claim and issued a refund.",
					acceptClaimType: x.accept_claim_type ?? "REFUND",
					...(partial && x.amount
						? {
								amountMinor: toMinor(
									x.amount.replace(/[$,\s]/g, ""),
									cf.dispute.currency,
								),
							}
						: {}),
				},
			};
		}
		case "escalate":
			return { type: p.type, params: { note: x.note ?? p.rationale } };
	}
}

export function validateAssessment(
	out: Assessment,
	cf: CaseFile,
	paypalOutputs: Map<string, unknown>,
): ValidatedAssessment {
	const log: ValidationEntry[] = [];
	const factIds = new Set(cf.facts.map((f) => f.id));
	const citationOk = (id: string) => {
		if (factIds.has(id)) return true;
		// PP:<tool>:<field> is accepted only if that toolkit tool ran in this assessment
		// AND the cited field actually appears in what it returned.
		const m = /^PP:([a-z_]+):(.+)$/.exec(id);
		if (!m || !paypalOutputs.has(m[1])) return false;
		const leaf = m[2].split(".").pop() ?? "";
		return JSON.stringify(paypalOutputs.get(m[1]) ?? {}).includes(`"${leaf}"`);
	};

	const reasoning: ValidatedAssessment["reasoning"] = [];
	for (const r of out.reasoning) {
		const ids = r.fact_ids.map((s) => s.trim());
		const good = ids.filter(citationOk);
		const bad = ids.filter((i) => !citationOk(i));
		if (bad.length)
			log.push({
				ok: false,
				what: `citation ${bad.join(", ")}`,
				detail: `Dropped unknown fact IDs from "${r.point.slice(0, 60)}…"`,
			});
		if (!good.length) {
			log.push({
				ok: false,
				what: "reasoning point",
				detail: `Dropped uncited point: "${r.point.slice(0, 80)}"`,
			});
			continue;
		}
		reasoning.push({ point: r.point, factIds: good });
	}
	if (reasoning.length)
		log.push({
			ok: true,
			what: "reasoning",
			detail: `${reasoning.length} point(s) kept, all citing case-file facts`,
		});

	const allowed = new Set(cf.allowedActions);
	const actions: ValidAction[] = [];
	const seen = new Set<string>();
	for (const p of out.proposed_actions) {
		if (seen.has(p.type)) {
			log.push({
				ok: false,
				what: p.type,
				detail: "Duplicate proposal of the same type dropped",
			});
			continue;
		}
		if (!allowed.has(p.type)) {
			log.push({
				ok: false,
				what: p.type,
				detail: `Rejected: PayPal does not currently allow "${p.type.replace(/_/g, "-")}" (allowed: ${[...allowed].join(", ") || "none"})`,
			});
			continue;
		}
		let norm: { type: string; params: Record<string, unknown> };
		try {
			norm = normalise(p, cf);
			if (p.type === "provide_evidence" && !cf.shipment)
				throw new Error("no shipment on file to prove fulfilment");
			norm.params = validateActionParams(norm.type, norm.params, {
				amountMinor: cf.dispute.amountMinor,
				currency: cf.dispute.currency,
			});
		} catch (err) {
			log.push({
				ok: false,
				what: p.type,
				detail: `Rejected: ${(err as Error).message}`,
			});
			continue;
		}
		const text = String(
			norm.params.message ?? norm.params.note ?? norm.params.notes ?? "",
		);
		const pii = piiProblem(text, cf);
		if (pii) {
			log.push({ ok: false, what: p.type, detail: `Rejected: ${pii}` });
			continue;
		}
		seen.add(p.type);
		actions.push({ ...norm, rationale: p.rationale });
		log.push({
			ok: true,
			what: p.type,
			detail: `Kept: maps to PayPal link "${p.type.replace(/_/g, "-")}"${typeof norm.params.amountMinor === "number" ? `, amount within the disputed ${cf.dispute.amountMinor / 100} ${cf.dispute.currency}` : ""}`,
		});
	}

	const recTypeMap: Record<string, string> = {
		fight_with_evidence: "provide_evidence",
		make_offer: "make_offer",
		accept_claim: "accept_claim",
		send_message: "send_message",
	};
	let recommended = out.recommended_action;
	const recType = recTypeMap[recommended];
	if (recType && !actions.some((a) => a.type === recType)) {
		const first = actions[0];
		const back = first
			? (Object.entries(recTypeMap).find(([, t]) => t === first.type)?.[0] as
					| Assessment["recommended_action"]
					| undefined)
			: undefined;
		log.push({
			ok: false,
			what: "recommended_action",
			detail: `"${recommended}" has no valid proposal; using ${back ?? "wait"}`,
		});
		recommended = back ?? "wait";
	}
	// Put the recommended action first.
	const order = recTypeMap[recommended];
	actions.sort((a, b) => (a.type === order ? -1 : b.type === order ? 1 : 0));

	return {
		reasoning,
		risks: out.risks.slice(0, 6),
		missing: out.missing_evidence.slice(0, 6),
		actions,
		log,
		headline: out.headline.trim().slice(0, 120),
		recommended,
	};
}
