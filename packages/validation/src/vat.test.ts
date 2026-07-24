import { describe, it, expect } from "vitest";
import {
  breakdownFromInclusiveGross,
  breakdownFromExclusiveNet,
  reconcileVat,
} from "./vat.js";

describe("breakdownFromInclusiveGross", () => {
  it("splits a clean VAT-inclusive gross exactly", () => {
    // ₱112.00 inclusive → ₱100.00 net + ₱12.00 VAT
    const b = breakdownFromInclusiveGross(11200);
    expect(b.net).toBe(10000);
    expect(b.vat).toBe(1200);
    expect(b.net + b.vat).toBe(b.gross);
  });

  it("keeps net + vat === gross even when rounding is involved", () => {
    // ₱100.00 inclusive does not divide evenly
    const b = breakdownFromInclusiveGross(10000);
    expect(b.net).toBe(8929);
    expect(b.vat).toBe(1071);
    expect(b.net + b.vat).toBe(10000);
  });

  it("treats vat-exempt and zero-rated as no VAT", () => {
    expect(breakdownFromInclusiveGross(11200, "vat_exempt").vat).toBe(0);
    expect(breakdownFromInclusiveGross(11200, "zero_rated").vat).toBe(0);
    expect(breakdownFromInclusiveGross(11200, "vat_exempt").net).toBe(11200);
  });

  it("handles zero gross", () => {
    const b = breakdownFromInclusiveGross(0);
    expect(b).toMatchObject({ gross: 0, net: 0, vat: 0 });
  });

  it("rejects negative or non-integer gross", () => {
    expect(() => breakdownFromInclusiveGross(-1)).toThrow(RangeError);
    expect(() => breakdownFromInclusiveGross(10.5)).toThrow(RangeError);
  });
});

describe("breakdownFromExclusiveNet", () => {
  it("adds 12% on top of a net amount", () => {
    const b = breakdownFromExclusiveNet(10000);
    expect(b.vat).toBe(1200);
    expect(b.gross).toBe(11200);
  });

  it("carries no VAT when exempt", () => {
    expect(breakdownFromExclusiveNet(10000, "vat_exempt").vat).toBe(0);
  });
});

describe("reconcileVat", () => {
  it("accepts a correct VAT figure", () => {
    const r = reconcileVat({ gross: 11200, providedVat: 1200 });
    expect(r.ok).toBe(true);
    expect(r.expectedVat).toBe(1200);
    expect(r.diff).toBe(0);
  });

  it("tolerates a one-centavo rounding difference by default", () => {
    const r = reconcileVat({ gross: 10000, providedVat: 1070 }); // expected 1071
    expect(r.ok).toBe(true);
  });

  it("rejects a materially wrong VAT (the hallucinated-amount guard)", () => {
    const r = reconcileVat({ gross: 11200, providedVat: 100 });
    expect(r.ok).toBe(false);
    expect(r.diff).toBe(100 - 1200);
    expect(r.reason).toContain("does not reconcile");
  });

  it("expects zero VAT for exempt items", () => {
    expect(reconcileVat({ gross: 11200, providedVat: 0, vatClass: "vat_exempt" }).ok).toBe(true);
    expect(reconcileVat({ gross: 11200, providedVat: 1200, vatClass: "vat_exempt" }).ok).toBe(false);
  });

  it("respects a custom tolerance", () => {
    const r = reconcileVat({ gross: 11200, providedVat: 1195, toleranceCentavos: 10 });
    expect(r.ok).toBe(true);
  });
});
