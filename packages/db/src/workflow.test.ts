import { describe, expect, test } from "vitest";
import { canAutoClear, holdNeedsSignOff, holdPeriodError, postingPeriod, quarterOf } from "./workflow.js";

describe("canAutoClear", () => {
  const clean = {
    review_status: "needs_review" as const,
    ai_recommendation: "approve" as const,
    tax_validity: "valid_vat_and_it" as const,
    ledger: "purchases" as const,
  };

  test("clears a clean, recommended, valid item", () => {
    expect(canAutoClear(clean)).toBe(true);
    expect(canAutoClear({ ...clean, tax_validity: "valid_it_only" })).toBe(true);
  });

  test("never clears flagged, not-valid, unrecommended, or uncategorized items", () => {
    expect(canAutoClear({ ...clean, review_status: "flagged" })).toBe(false);
    expect(canAutoClear({ ...clean, tax_validity: "not_valid" })).toBe(false);
    expect(canAutoClear({ ...clean, tax_validity: null })).toBe(false);
    expect(canAutoClear({ ...clean, ai_recommendation: "review" })).toBe(false);
    expect(canAutoClear({ ...clean, ledger: "other" })).toBe(false);
  });
});

describe("holdPeriodError", () => {
  test("allows a later month in the same year", () => {
    expect(holdPeriodError("2026-07-15", "2026-09")).toBeNull();
  });
  test("blocks crossing the taxable year", () => {
    expect(holdPeriodError("2026-12-10", "2027-01")).toMatch(/same taxable year/);
  });
  test("blocks the same or an earlier month", () => {
    expect(holdPeriodError("2026-07-15", "2026-07")).toMatch(/after/);
    expect(holdPeriodError("2026-07-15", "2026-03")).toMatch(/after/);
  });
  test("blocks bad input and undated documents", () => {
    expect(holdPeriodError("2026-07-15", "2026-13")).toMatch(/YYYY-MM/);
    expect(holdPeriodError(null, "2026-09")).toMatch(/no date/);
  });
});

describe("holdNeedsSignOff", () => {
  test("only unsigned sales holds wait for the practice lead", () => {
    expect(holdNeedsSignOff({ ledger: "sales", hold_approved_at: null })).toBe(true);
    expect(holdNeedsSignOff({ ledger: "sales", hold_approved_at: "2026-07-20T00:00:00Z" })).toBe(false);
    expect(holdNeedsSignOff({ ledger: "purchases", hold_approved_at: null })).toBe(false);
  });
});

describe("posting period", () => {
  test("a hold period wins over the document month", () => {
    expect(postingPeriod({ hold_period: "2026-09", txn_date: "2026-07-15" })).toBe("2026-09");
    expect(postingPeriod({ hold_period: null, txn_date: "2026-07-15" })).toBe("2026-07");
    expect(postingPeriod({ hold_period: null, txn_date: null })).toBeNull();
  });
  test("quarters", () => {
    expect(quarterOf("2026-01")).toBe("2026-Q1");
    expect(quarterOf("2026-07")).toBe("2026-Q3");
    expect(quarterOf("2026-12")).toBe("2026-Q4");
  });
});
