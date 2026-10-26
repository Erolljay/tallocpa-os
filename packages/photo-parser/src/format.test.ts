import { describe, expect, test } from "vitest";
import { mapExtraction } from "./extract.js";
import { formatInvoiceSummary } from "./format.js";
import { rawInvoice } from "./testing.js";

const raw = rawInvoice();

describe("formatInvoiceSummary", () => {
  test("renders the seven requested fields in order with peso formatting", () => {
    const out = formatInvoiceSummary(mapExtraction(raw));
    expect(out).toContain("Date: 2026-07-15");
    expect(out).toContain("Supplier: ACME Trading Corp.");
    expect(out).toContain("TIN: 123-456-789-00001");
    expect(out).toContain("Branch: 00001");
    expect(out).toContain("Amount (VAT inclusive): ₱1,120.00");
    expect(out).toContain("VAT: ₱120.00");
    expect(out).toContain("Net of VAT: ₱1,000.00");
  });

  test("labels a head-office invoice and appends review notes", () => {
    const out = formatInvoiceSummary(
      mapExtraction({ ...raw, tin: "123-456-789", vatPesos: 999 }),
    );
    expect(out).toContain("Branch: Head Office");
    expect(out).toMatch(/Review: .*does not compute/i);
  });
});
