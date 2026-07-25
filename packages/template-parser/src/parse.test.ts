import { describe, it, expect } from "vitest";
import { parseTemplateRows } from "./parse.js";

const goodRow = () => ({
  Date: "2026-07-15",
  Supplier: "Mercury Drug",
  TIN: "123-456-789-000",
  "OR Number": "OR-004512",
  Gross: "112.00",
  VAT: "12.00",
  Category: "Office Supplies",
});

describe("parseTemplateRows", () => {
  it("parses a clean batch to all-ok", () => {
    const res = parseTemplateRows([goodRow(), { ...goodRow(), "OR Number": "OR-004513" }]);
    expect(res.summary).toEqual({ total: 2, ok: 2, needsFix: 0, duplicates: 0 });
    expect(res.rows[0]?.draft.gross).toBe(11200);
    expect(res.rows[0]?.draft.vat).toBe(1200);
    expect(res.rows[0]?.rowNumber).toBe(1);
  });

  it("maps header aliases (Vendor, Amount)", () => {
    const res = parseTemplateRows([
      { Date: "07/15/2026", Vendor: "SM Store", Amount: "1,000.00" },
    ]);
    // no VAT column → vat null → still ok on required fields
    expect(res.rows[0]?.draft.supplierName).toBe("SM Store");
    expect(res.rows[0]?.draft.gross).toBe(100000);
    expect(res.rows[0]?.draft.date).toBe("2026-07-15");
    expect(res.rows[0]?.status).toBe("ok");
  });

  it("flags a missing gross without dropping the row", () => {
    const r = { ...goodRow(), Gross: "" };
    const res = parseTemplateRows([r]);
    expect(res.rows[0]?.status).toBe("needs_fix");
    expect(res.rows[0]?.errors).toContain("missing_gross");
    expect(res.summary.total).toBe(1);
  });

  it("flags an unparseable amount", () => {
    const res = parseTemplateRows([{ ...goodRow(), Gross: "one hundred" }]);
    expect(res.rows[0]?.errors).toContain("unparseable_gross");
    expect(res.rows[0]?.errors).toContain("missing_gross");
  });

  it("flags a VAT that does not reconcile", () => {
    const res = parseTemplateRows([{ ...goodRow(), VAT: "50.00" }]);
    expect(res.rows[0]?.errors).toContain("vat_mismatch");
    expect(res.rows[0]?.status).toBe("needs_fix");
  });

  it("flags an invalid TIN", () => {
    const res = parseTemplateRows([{ ...goodRow(), TIN: "000" }]);
    expect(res.rows[0]?.errors).toContain("invalid_tin");
  });

  it("marks the second identical row as a duplicate", () => {
    const res = parseTemplateRows([goodRow(), goodRow()]);
    expect(res.rows[0]?.status).toBe("ok");
    expect(res.rows[1]?.status).toBe("duplicate");
    expect(res.summary.duplicates).toBe(1);
  });

  it("respects an exempt VAT class (no VAT expected)", () => {
    const res = parseTemplateRows([
      { ...goodRow(), VAT: "0", "VAT Class": "exempt" },
    ]);
    expect(res.rows[0]?.errors).not.toContain("vat_mismatch");
    expect(res.rows[0]?.vatClass).toBe("vat_exempt");
    expect(res.rows[0]?.status).toBe("ok");
  });

  it("handles an empty batch", () => {
    expect(parseTemplateRows([]).summary).toEqual({ total: 0, ok: 0, needsFix: 0, duplicates: 0 });
  });
});
