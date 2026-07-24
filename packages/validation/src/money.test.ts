import { describe, it, expect } from "vitest";
import {
  isCentavos,
  pesosToCentavos,
  centavosToPesos,
  formatPeso,
} from "./money.js";

describe("money", () => {
  it("recognizes integer centavos", () => {
    expect(isCentavos(1200)).toBe(true);
    expect(isCentavos(0)).toBe(true);
    expect(isCentavos(-500)).toBe(true);
  });

  it("rejects non-integers and non-numbers", () => {
    expect(isCentavos(12.5)).toBe(false);
    expect(isCentavos(NaN)).toBe(false);
    expect(isCentavos("1200")).toBe(false);
    expect(isCentavos(null)).toBe(false);
  });

  it("converts pesos to centavos with rounding", () => {
    expect(pesosToCentavos(100)).toBe(10000);
    expect(pesosToCentavos(12.34)).toBe(1234);
    // classic float trap: 19.99 * 100 = 1998.9999... → rounds to 1999
    expect(pesosToCentavos(19.99)).toBe(1999);
  });

  it("converts centavos back to pesos", () => {
    expect(centavosToPesos(1234)).toBeCloseTo(12.34, 5);
  });

  it("formats peso strings with thousands and two decimals", () => {
    expect(formatPeso(123450)).toBe("₱1,234.50");
    expect(formatPeso(5)).toBe("₱0.05");
    expect(formatPeso(0)).toBe("₱0.00");
    expect(formatPeso(-1200)).toBe("-₱12.00");
  });
});
