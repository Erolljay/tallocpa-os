import type { RawInvoiceExtraction } from "./types.js";

/**
 * Test fixture: a complete, well-formed VAT invoice from a VAT-registered
 * supplier — ₱1,000.00 VATable + ₱120.00 VAT = ₱1,120.00.
 */
export function rawInvoice(over: Partial<RawInvoiceExtraction> = {}): RawInvoiceExtraction {
  return {
    date: "2026-07-15",
    supplierName: "ACME Trading Corp.",
    tin: "123-456-789-00001",
    counterpartyAddress: "1 Rizal Ave., Manila",
    sellerTin: "123-456-789-00001",
    sellerVatRegistered: true,
    ledger: "purchases",
    isBirDocument: true,
    nonBirReason: null,
    branchCode: null,
    vatType: "vatable",
    docType: "sales_invoice",
    orNumber: "SI-0001",
    amountVatInclusivePesos: 1120,
    vatablePesos: 1000,
    vatExemptPesos: null,
    zeroRatedPesos: null,
    vatPesos: 120,
    whtPesos: null,
    atc: null,
    confidence: 0.95,
    ...over,
  };
}
