import { describe, expect, it } from "vitest";
import { formatMoney, paypalMoneyToMinor, toDecimalString, toMinor } from "../src/lib/money";

describe("money", () => {
	it("parses PayPal decimal strings without floats", () => {
		expect(toMinor("20.00")).toBe(2000);
		expect(toMinor("64")).toBe(6400);
		expect(toMinor("9.4")).toBe(940);
		expect(toMinor("0.10")).toBe(10);
		expect(toMinor("-3.10")).toBe(-310);
		expect(toMinor("1234567.89")).toBe(123456789);
		expect(toMinor("19.990")).toBe(1999);
	});
	it("rejects garbage and sub-cent amounts", () => {
		expect(() => toMinor("abc")).toThrow();
		expect(() => toMinor("1.234")).toThrow();
		expect(() => toMinor("")).toThrow();
	});
	it("handles zero-decimal currencies", () => {
		expect(toMinor("500", "JPY")).toBe(500);
		expect(toDecimalString(500, "JPY")).toBe("500");
	});
	it("formats to the PayPal wire format", () => {
		expect(toDecimalString(6400)).toBe("64.00");
		expect(toDecimalString(5)).toBe("0.05");
		expect(toDecimalString(-310)).toBe("-3.10");
	});
	it("formats for display", () => {
		expect(formatMoney(6400)).toBe("$64.00");
		expect(formatMoney(150000)).toBe("$1,500.00");
		expect(formatMoney(1500, "USD", { signed: true })).toBe("+$15.00");
		expect(formatMoney(-1500)).toBe("−$15.00");
	});
	it("round-trips PayPal money objects", () => {
		expect(paypalMoneyToMinor({ value: "11.50", currency_code: "USD" })).toEqual({
			amountMinor: 1150,
			currency: "USD",
		});
	});
});
