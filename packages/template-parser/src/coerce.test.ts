import { describe, it, expect } from "vitest";
import { parseMoneyToCentavos, parseDateToIso, parseVatClass } from "./coerce.js";

describe("parseMoneyToCentavos", () => {
  it("parses plain and formatted amounts", () => {
    expect(parseMoneyToCentavos("100")).toEqual({ value: 10000, ok: true });
    expect(parseMoneyToCentavos("1,234.50")).toEqual({ value: 123450, ok: true });
    expect(parseMoneyToCentavos("19.99")).toEqual({ value: 1999, ok: true });
  });

  it("strips currency symbols and PHP", () => {
    expect(parseMoneyToCentavos("₱100.00")).toEqual({ value: 10000, ok: true });
    expect(parseMoneyToCentavos("PHP 1,000")).toEqual({ value: 100000, ok: true });
  });

  it("reads accountant parentheses and minus as negative", () => {
    expect(parseMoneyToCentavos("(500)")).toEqual({ value: -50000, ok: true });
    expect(parseMoneyToCentavos("-250.00")).toEqual({ value: -25000, ok: true });
  });

  it("fails on empty or non-numeric input", () => {
    expect(parseMoneyToCentavos("")).toEqual({ value: null, ok: false });
    expect(parseMoneyToCentavos("abc")).toEqual({ value: null, ok: false });
    expect(parseMoneyToCentavos(null)).toEqual({ value: null, ok: false });
  });
});

describe("parseDateToIso", () => {
  it("accepts ISO and YYYY/MM/DD", () => {
    expect(parseDateToIso("2026-07-15")).toEqual({ value: "2026-07-15", ok: true });
    expect(parseDateToIso("2026/7/5")).toEqual({ value: "2026-07-05", ok: true });
  });

  it("reads MM/DD/YYYY", () => {
    expect(parseDateToIso("07/15/2026")).toEqual({ value: "2026-07-15", ok: true });
  });

  it("swaps to DD/MM when the first number cannot be a month", () => {
    expect(parseDateToIso("15/07/2026")).toEqual({ value: "2026-07-15", ok: true });
  });

  it("rejects impossible and unparseable dates", () => {
    expect(parseDateToIso("2026-02-31")).toEqual({ value: null, ok: false });
    expect(parseDateToIso("13/13/2026")).toEqual({ value: null, ok: false });
    expect(parseDateToIso("last tuesday")).toEqual({ value: null, ok: false });
    expect(parseDateToIso("")).toEqual({ value: null, ok: false });
  });
});

describe("parseVatClass", () => {
  it("detects exempt and zero-rated, defaults to vatable", () => {
    expect(parseVatClass("VAT Exempt")).toBe("vat_exempt");
    expect(parseVatClass("zero-rated")).toBe("zero_rated");
    expect(parseVatClass("Vatable")).toBe("vatable");
    expect(parseVatClass("")).toBe("vatable");
    expect(parseVatClass(null)).toBe("vatable");
  });
});
