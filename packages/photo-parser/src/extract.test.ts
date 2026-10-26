import { describe, expect, test } from "vitest";
import { mapExtraction, taxValidity, type ValidityInput } from "./extract.js";
import { rawInvoice as raw } from "./testing.js";

describe("mapExtraction — printed amounts are kept and checked", () => {
  test("keeps the printed lines of a clean VAT invoice, no flags", () => {
    const r = mapExtraction(raw());
    expect(r.draft).toMatchObject({ gross: 112_000, vatable: 100_000, vat: 12_000, net: 100_000 });
    expect(r.flags).toEqual([]);
    expect(r.status).toBe("needs_review");
  });

  test("flags VAT that is not 12% of VATable, and keeps the printed VAT", () => {
    const r = mapExtraction(raw({ vatPesos: 200, amountVatInclusivePesos: 1200 }));
    expect(r.draft.vat).toBe(20_000);
    expect(r.flags.join(" ")).toMatch(/VAT does not compute/);
    expect(r.status).toBe("flagged");
  });

  test("allows ₱1 of rounding between printed figures", () => {
    expect(mapExtraction(raw({ vatPesos: 120.9, amountVatInclusivePesos: 1120.9 })).flags).toEqual([]);
  });

  test("flags lines that don't add up to the total", () => {
    const r = mapExtraction(raw({ amountVatInclusivePesos: 1500 }));
    expect(r.flags.join(" ")).toMatch(/add up/);
  });

  test("a mixed invoice (VATable + exempt) adds up", () => {
    const r = mapExtraction(raw({ vatExemptPesos: 500, amountVatInclusivePesos: 1620 }));
    expect(r.flags).toEqual([]);
    expect(r.draft.vatExempt).toBe(50_000);
  });

  test("flags a VATable line with no VAT amount", () => {
    const r = mapExtraction(raw({ vatPesos: null, amountVatInclusivePesos: 1000 }));
    expect(r.flags).toContain("missing VAT amount");
  });

  test("derives the split only for a VAT-registered seller that printed just a total", () => {
    const r = mapExtraction(raw({ vatablePesos: null, vatPesos: null }));
    expect(r.draft).toMatchObject({ gross: 112_000, vatable: 100_000, vat: 12_000 });
    expect(r.notes.join(" ")).toMatch(/derived/);
    expect(r.flags).toEqual([]);
  });

  test("a non-VAT seller's total carries no VAT", () => {
    const r = mapExtraction(raw({ sellerVatRegistered: false, vatablePesos: null, vatPesos: null }));
    expect(r.draft.vat).toBe(0);
    expect(r.draft.vatable).toBeNull();
  });

  test("flags a bare total when the seller's VAT status is unknown", () => {
    const r = mapExtraction(raw({ sellerVatRegistered: null, vatablePesos: null, vatPesos: null }));
    expect(r.flags.join(" ")).toMatch(/VAT status unknown/);
  });

  test("withholding needs its ATC", () => {
    expect(mapExtraction(raw({ whtPesos: 20 })).flags).toContain("withholding without ATC");
    expect(mapExtraction(raw({ whtPesos: 20, atc: "WC158" })).draft).toMatchObject({ wht: 2_000, atc: "WC158" });
  });
});

describe("mapExtraction — required fields, TIN, branch", () => {
  test("flags missing required fields", () => {
    const r = mapExtraction(raw({ orNumber: null, counterpartyAddress: null, tin: null }));
    expect(r.flags).toEqual(
      expect.arrayContaining(["missing invoice/OR number", "missing address", "missing TIN"]),
    );
  });

  test("flags an invalid TIN format and keeps it verbatim", () => {
    const r = mapExtraction(raw({ tin: "12-345" }));
    expect(r.flags).toContain("TIN format invalid");
    expect(r.draft.tin).toBe("12-345");
  });

  test("reads the branch code from the TIN", () => {
    expect(mapExtraction(raw()).draft.branch).toBe("00001");
    expect(mapExtraction(raw({ tin: "123-456-789" })).draft.branch).toBeNull();
  });

  test("an empty extraction is unreadable", () => {
    const r = mapExtraction(
      raw({ date: null, supplierName: null, amountVatInclusivePesos: null, vatablePesos: null, vatPesos: null }),
    );
    expect(r.status).toBe("unreadable");
  });

  test("clamps confidence into 0..1", () => {
    expect(mapExtraction(raw({ confidence: 5 })).confidence).toBe(1);
    expect(mapExtraction(raw({ confidence: NaN })).confidence).toBe(0);
  });
});

describe("mapExtraction — ledger", () => {
  const client = { name: "Tallo Client Inc.", tin: "987-654-321-00000" };

  test("a document issued under the client's TIN is a sale, whatever the AI said", () => {
    const r = mapExtraction(raw({ sellerTin: "987654321000" }), client);
    expect(r.draft.ledger).toBe("sales");
    expect(r.notes.join(" ")).toMatch(/classified as sales/);
  });

  test("a walk-in sale needs no buyer TIN or address", () => {
    const r = mapExtraction(
      raw({ sellerTin: "987-654-321-00000", tin: null, counterpartyAddress: null, supplierName: "Walk-in" }),
      client,
    );
    expect(r.flags).toEqual([]);
    expect(r.taxValidity).toBe("valid_vat_and_it");
  });
});

describe("taxValidity", () => {
  const base: ValidityInput = {
    isBirDocument: true,
    sellerTin: "123-456-789-00001",
    sellerName: "ACME",
    sellerVatRegistered: true,
    ledger: "purchases",
    date: "2026-07-15",
    orNumber: "SI-1",
    docTypeKnown: true,
    counterpartyAddress: "Manila",
    vat: 12_000,
    amountFlags: 0,
  };

  test("complete VAT invoice from a VAT-registered seller → valid for VAT and IT", () => {
    expect(taxValidity(base)).toBe("valid_vat_and_it");
  });
  test("non-VAT seller → valid for income tax only", () => {
    expect(taxValidity({ ...base, sellerVatRegistered: false, vat: 0 })).toBe("valid_it_only");
  });
  test("VAT that doesn't compute → income tax only", () => {
    expect(taxValidity({ ...base, amountFlags: 1 })).toBe("valid_it_only");
  });
  test("missing invoice elements → income tax only", () => {
    expect(taxValidity({ ...base, counterpartyAddress: null })).toBe("valid_it_only");
    expect(taxValidity({ ...base, orNumber: null })).toBe("valid_it_only");
  });
  test("not a BIR document, or no valid issuer → not valid", () => {
    expect(taxValidity({ ...base, isBirDocument: false })).toBe("not_valid");
    expect(taxValidity({ ...base, sellerTin: "12-34" })).toBe("not_valid");
    expect(taxValidity({ ...base, sellerName: null })).toBe("not_valid");
  });
  test("a quotation is flagged and not valid end to end", () => {
    const r = mapExtraction(raw({ isBirDocument: false, nonBirReason: "quotation" }));
    expect(r.taxValidity).toBe("not_valid");
    expect(r.flags).toContain("not a BIR invoice/receipt (quotation)");
    expect(r.status).toBe("flagged");
  });
});
