/**
 * Money helpers. Amounts are integer minor units (cents) + ISO currency.
 * PayPal sends decimal strings ("20.00"); never parse them with parseFloat.
 */

const ZERO_DECIMAL = new Set(["JPY", "HUF", "TWD"]);

export function decimalsFor(currency: string): number {
	return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

/** "20.00" → 2000. Accepts "20", "20.5", "-3.10". Throws on garbage. */
export function toMinor(value: string | number, currency = "USD"): number {
	const s =
		typeof value === "number"
			? value.toFixed(decimalsFor(currency))
			: value.trim();
	const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s);
	if (!m) throw new Error(`Invalid money value: ${JSON.stringify(value)}`);
	const [, neg, whole, frac = ""] = m;
	const d = decimalsFor(currency);
	if (frac.length > d && /[1-9]/.test(frac.slice(d))) {
		throw new Error(`Too many decimals for ${currency}: ${s}`);
	}
	const fracPadded = (frac + "0".repeat(d)).slice(0, d);
	const minor = Number(whole) * 10 ** d + (d ? Number(fracPadded) : 0);
	if (!Number.isSafeInteger(minor))
		throw new Error(`Amount out of range: ${s}`);
	return neg ? -minor : minor;
}

/** 2000 → "20.00" (PayPal wire format). */
export function toDecimalString(minor: number, currency = "USD"): string {
	const d = decimalsFor(currency);
	const neg = minor < 0;
	const abs = Math.abs(Math.trunc(minor));
	if (d === 0) return `${neg ? "-" : ""}${abs}`;
	const whole = Math.floor(abs / 10 ** d);
	const frac = String(abs % 10 ** d).padStart(d, "0");
	return `${neg ? "-" : ""}${whole}.${frac}`;
}

/** 6400 → "$64.00" (display). */
export function formatMoney(
	minor: number,
	currency = "USD",
	opts: { signed?: boolean } = {},
): string {
	const d = decimalsFor(currency);
	const fmt = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: d,
		maximumFractionDigits: d,
	});
	const abs = fmt.format(Math.abs(minor) / 10 ** d);
	if (minor < 0) return `−${abs}`;
	if (opts.signed && minor > 0) return `+${abs}`;
	return abs;
}

/** PayPal money object → minor units. */
export function paypalMoneyToMinor(
	m: { value: string; currency_code: string } | undefined | null,
): {
	amountMinor: number;
	currency: string;
} {
	if (!m) return { amountMinor: 0, currency: "USD" };
	return {
		amountMinor: toMinor(m.value, m.currency_code),
		currency: m.currency_code,
	};
}

export function minorToPaypalMoney(minor: number, currency = "USD") {
	return { currency_code: currency, value: toDecimalString(minor, currency) };
}
