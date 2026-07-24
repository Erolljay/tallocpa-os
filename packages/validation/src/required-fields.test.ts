import { describe, it, expect } from "vitest";
import {
  validateRequiredFields,
  checkBirValidity,
  type IntakeDraft,
} from "./required-fields.js";

const good: IntakeDraft = {
  date: "2026-07-15",
  supplierName: "Mercury Drug",
  gross: 11200,
  vat: 1200,
  tin: "123-456-789-000",
  orNumber: "OR-004512",
  docType: "official_receipt",
};

describe("validateRequiredFields", () => {
  it("passes a complete draft", () => {
    expect(validateRequiredFields(good)).toEqual({ ok: true, missing: [] });
  });

  it("flags a missing date", () => {
    expect(validateRequiredFields({ ...good, date: null }).missing).toContain("date");
  });

  it("flags a malformed date", () => {
    expect(validateRequiredFields({ ...good, date: "2026/07/15" }).missing).toContain("date");
  });

  it("flags an impossible calendar date", () => {
    expect(validateRequiredFields({ ...good, date: "2026-02-31" }).missing).toContain("date");
  });

  it("flags an empty supplier name", () => {
    expect(validateRequiredFields({ ...good, supplierName: "   " }).missing).toContain("supplierName");
  });

  it("flags zero or negative gross", () => {
    expect(validateRequiredFields({ ...good, gross: 0 }).missing).toContain("gross");
    expect(validateRequiredFields({ ...good, gross: -100 }).missing).toContain("gross");
  });

  it("flags a non-integer gross", () => {
    expect(validateRequiredFields({ ...good, gross: 112.5 }).missing).toContain("gross");
  });

  it("reports every missing field at once", () => {
    const r = validateRequiredFields({});
    expect(r.ok).toBe(false);
    expect(r.missing.sort()).toEqual(["date", "gross", "supplierName"]);
  });
});

describe("checkBirValidity", () => {
  it("passes a valid official receipt", () => {
    expect(checkBirValidity(good)).toEqual({ valid: true, reasons: [] });
  });

  it("flags a missing/invalid TIN", () => {
    expect(checkBirValidity({ ...good, tin: "000" }).reasons).toContain("missing_or_invalid_tin");
  });

  it("flags a missing OR number", () => {
    expect(checkBirValidity({ ...good, orNumber: "" }).reasons).toContain("missing_or_number");
  });

  it("flags an unknown document type", () => {
    expect(checkBirValidity({ ...good, docType: "unknown" }).reasons).toContain("unknown_doc_type");
  });

  it("accumulates multiple reasons", () => {
    expect(checkBirValidity({}).reasons.sort()).toEqual([
      "missing_or_invalid_tin",
      "missing_or_number",
      "unknown_doc_type",
    ]);
  });
});
