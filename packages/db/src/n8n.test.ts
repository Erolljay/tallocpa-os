import { describe, expect, test } from "vitest";
import type { IntakeItemRow } from "./intake-portal.js";
import { buildN8nPayload } from "./n8n.js";

const item: IntakeItemRow = {
  id: "item-1",
  client_id: "client-1",
  source: "portal",
  period: "2026-09",
  review_status: "posted",
  txn_date: "2026-07-15",
  supplier_name: "ACME Trading Corp.",
  counterparty_address: "1 Rizal Ave., Manila",
  gross: 162_000,
  vatable: 100_000,
  vat_exempt: 50_000,
  zero_rated: null,
  vat: 12_000,
  wht_amount: 2_000,
  atc: "WC158",
  vat_class: "vatable",
  tin: "123-456-789-00001",
  or_number: "SI-0001",
  doc_type: "sales_invoice",
  ledger: "purchases",
  confidence: 0.95,
  tax_validity: "valid_vat_and_it",
  bir_valid: true,
  ai_recommendation: "approve",
  review_notes: null,
  client_note: null,
  hold_period: "2026-09",
  hold_reason: "late delivery",
  hold_approved_by: null,
  hold_approved_at: "2026-07-20T00:00:00Z",
  approval_source: "rule",
  approved_by: null,
  approved_at: "2026-07-16T01:00:00Z",
  n8n_sent_at: null,
  drive_file_id: null,
  created_at: "2026-07-15T08:00:00Z",
};
const client = { id: "client-1", name: "Tallo Client Inc.", tin: "987-654-321-00000" };

describe("buildN8nPayload", () => {
  test("carries printed amounts as centavos and pesos", () => {
    const p = buildN8nPayload("item.posted", item, client, "https://signed/url");
    expect(p.event).toBe("item.posted");
    expect(p.item.amounts.vatable).toEqual({ centavos: 100_000, pesos: 1000 });
    expect(p.item.amounts.vatExempt).toEqual({ centavos: 50_000, pesos: 500 });
    expect(p.item.amounts.wht).toEqual({ centavos: 2_000, pesos: 20 });
    expect(p.item.amounts.zeroRated).toEqual({ centavos: null, pesos: null });
    expect(p.item.atc).toBe("WC158");
    expect(p.client).toEqual(client);
  });

  test("posts into the hold period's quarter and the document's Drive year", () => {
    const p = buildN8nPayload("item.posted", item, client, null);
    expect(p.item).toMatchObject({ period: "2026-09", quarter: "2026-Q3", year: "2026", taxValidity: "valid_vat_and_it" });
  });

  test("an unparsed upload still has a Drive year (from the upload date)", () => {
    const uploaded = { ...item, review_status: "uploaded" as const, txn_date: null, period: null };
    const p = buildN8nPayload("document.uploaded", uploaded, client, null);
    expect(p.item.year).toBe("2026");
    expect(p.item.quarter).toBeNull();
  });
});
