import type {
  AiRecommendation,
  Centavos,
  DocType,
  IsoDate,
  Ledger,
  TaxValidity,
  VatClass,
} from "@tallocpa/domain";

/**
 * Raw shape the AI extractor (Gemini) is asked to return for one source
 * document. Amounts are **pesos as printed** — the mapping layer converts them
 * to integer centavos. Every field is nullable: the model must return `null`
 * rather than guess, so a missing field surfaces for review instead of hiding
 * as a fabricated value.
 *
 * This is the untrusted boundary: nothing here is believed until
 * {@link mapExtraction} has checked it. No AI computes tax (CLAUDE.md rule 1):
 * the model only reads what is printed.
 */
export interface RawInvoiceExtraction {
  /** Invoice / transaction date, ISO `YYYY-MM-DD`, or null if unreadable. */
  date: string | null;
  /**
   * Counterparty's registered name as printed: the seller on a purchase /
   * expense, the buyer on the client's own sales invoice.
   */
  supplierName: string | null;
  /** Counterparty's TIN exactly as printed (any separators). */
  tin: string | null;
  /** Counterparty's registered address as printed. */
  counterpartyAddress: string | null;
  /** TIN of whoever ISSUED the document — decides sales vs purchases. */
  sellerTin: string | null;
  /** Issuer prints "VAT REG TIN" (true), "NON-VAT REG TIN" (false), or neither (null). */
  sellerVatRegistered: boolean | null;
  /** Which book the AI thinks this belongs to. */
  ledger: Ledger;
  /** True for a BIR invoice / OR; false for quotations, delivery receipts, etc. */
  isBirDocument: boolean;
  /** When not a BIR document, what it is instead (e.g. "quotation"). */
  nonBirReason: string | null;
  /** Branch code as printed (e.g. "0000"), when shown separately from the TIN. */
  branchCode: string | null;
  /** The AI's reading of the VAT treatment (kept for the vat_class column). */
  vatType: VatClass;
  /** Document type. */
  docType: DocType;
  /** OR / invoice number as printed. */
  orNumber: string | null;
  /** Printed grand total (VAT inclusive), pesos. */
  amountVatInclusivePesos: number | null;
  /** Printed "VATable sales" line (VAT exclusive), pesos. */
  vatablePesos: number | null;
  /** Printed "VAT-exempt sales" line, pesos. */
  vatExemptPesos: number | null;
  /** Printed "Zero-rated sales" line, pesos. */
  zeroRatedPesos: number | null;
  /** Printed VAT amount (12%), pesos. */
  vatPesos: number | null;
  /** Printed withholding tax amount, pesos. */
  whtPesos: number | null;
  /** Printed ATC (alphanumeric tax code) of the withholding, e.g. "WC158". */
  atc: string | null;
  /** Model self-reported extraction confidence, 0..1. */
  confidence: number;
}

/**
 * The canonical, reviewable draft. Money is integer centavos, as printed;
 * `gross = vatable + vat + vatExempt + zeroRated` is checked, not forced.
 */
export interface InvoiceDraft {
  date: IsoDate | null;
  supplierName: string | null;
  tin: string | null;
  branch: string | null;
  address: string | null;
  ledger: Ledger;
  vatClass: VatClass;
  docType: DocType;
  orNumber: string | null;
  gross: Centavos | null;
  vatable: Centavos | null;
  vatExempt: Centavos | null;
  zeroRated: Centavos | null;
  vat: Centavos | null;
  /** gross − vat, for display. */
  net: Centavos | null;
  wht: Centavos | null;
  atc: string | null;
}

/** Where an extracted document lands after mapping. */
export type ExtractionStatus = "needs_review" | "flagged" | "unreadable";

/**
 * Result of turning one {@link RawInvoiceExtraction} into a reviewable draft.
 * Nothing is dropped: even a thin extraction comes back with flags explaining
 * exactly what a human must check.
 */
export interface InvoiceParseResult {
  draft: InvoiceDraft;
  /** Carried from the model, clamped to 0..1. */
  confidence: number;
  status: ExtractionStatus;
  taxValidity: TaxValidity;
  /** taxValidity === "valid_vat_and_it" (kept for the bir_valid column). */
  birValid: boolean;
  tinValid: boolean;
  isBirDocument: boolean;
  /** Failed validations (CLAUDE.md step 4) — any flag routes to "flagged". */
  flags: string[];
  /** Informational notes (derived amounts, reclassification). */
  notes: string[];
}

/** The client whose books a document is uploaded into (for sales detection). */
export interface ClientContext {
  name: string;
  tin: string | null;
}

/** What the AI suggests the reviewer do, and why. Staff always decide. */
export interface Recommendation {
  recommendation: AiRecommendation;
  reasons: string[];
}
