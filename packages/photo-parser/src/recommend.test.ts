import { describe, expect, test } from "vitest";
import { mapExtraction } from "./extract.js";
import { recommend } from "./recommend.js";
import { rawInvoice as raw } from "./testing.js";
import type { RawInvoiceExtraction } from "./types.js";

const rec = (over: Partial<RawInvoiceExtraction> = {}) => recommend(mapExtraction(raw(over)));

describe("recommend", () => {
  test("approves a clean, confident invoice", () => {
    expect(rec().recommendation).toBe("approve");
  });

  test("approves a clean non-VAT receipt too (valid for income tax)", () => {
    const r = rec({ sellerVatRegistered: false, vatablePesos: null, vatPesos: null });
    expect(r.recommendation).toBe("approve");
  });

  test("rejects a non-BIR document with the reason", () => {
    const r = rec({ isBirDocument: false, nonBirReason: "delivery receipt" });
    expect(r.recommendation).toBe("reject");
    expect(r.reasons.join(" ")).toMatch(/delivery receipt/);
  });

  test("rejects an unreadable document", () => {
    const r = rec({
      date: null,
      supplierName: null,
      amountVatInclusivePesos: null,
      vatablePesos: null,
      vatPesos: null,
    });
    expect(r.recommendation).toBe("reject");
  });

  test("asks for review when anything is flagged", () => {
    const r = rec({ vatPesos: 200, amountVatInclusivePesos: 1200 });
    expect(r.recommendation).toBe("review");
    expect(r.reasons.join(" ")).toMatch(/VAT does not compute/);
  });

  test("asks for review on low confidence or an unclear category", () => {
    expect(rec({ confidence: 0.6 }).reasons.join(" ")).toMatch(/low AI confidence \(60%\)/);
    expect(rec({ ledger: "other" }).recommendation).toBe("review");
  });
});
