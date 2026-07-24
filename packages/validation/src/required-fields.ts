import type { Centavos } from "./money.js";
import { isValidTin } from "./tin.js";

export type DocType = "official_receipt" | "sales_invoice" | "unknown";

/**
 * A candidate intake item as produced by the AI extractor (photo lane) or the
 * template parser (template lane) — before it becomes a reviewable IntakeItem.
 * Both lanes converge on these checks so they can never drift apart.
 */
export interface IntakeDraft {
  date?: string | null; // ISO calendar date, YYYY-MM-DD
  supplierName?: string | null;
  gross?: Centavos | null;
  vat?: Centavos | null;
  tin?: string | null;
  orNumber?: string | null; // official-receipt / sales-invoice number
  docType?: DocType | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return false;
  // Guard against JS rollover (e.g. 2026-02-31 → March): round-trip check.
  const iso = new Date(time).toISOString().slice(0, 10);
  return iso === value;
}

export interface FieldCheck {
  ok: boolean;
  missing: string[];
}

/**
 * The minimum a draft needs before it can enter the review queue at all.
 * Anything failing this is queued as `extract_failed` / `needs_fix`, never dropped.
 */
export function validateRequiredFields(draft: IntakeDraft): FieldCheck {
  const missing: string[] = [];
  if (!draft.date || !isRealIsoDate(draft.date)) missing.push("date");
  if (!draft.supplierName || draft.supplierName.trim().length === 0) {
    missing.push("supplierName");
  }
  if (
    draft.gross == null ||
    !Number.isSafeInteger(draft.gross) ||
    draft.gross <= 0
  ) {
    missing.push("gross");
  }
  return { ok: missing.length === 0, missing };
}

export interface BirValidity {
  valid: boolean;
  reasons: string[];
}

/**
 * Whether a draft looks like a BIR-valid official receipt / sales invoice.
 * This is a compliance signal for the reviewer, separate from the minimum
 * fields needed to record the transaction at all.
 */
export function checkBirValidity(draft: IntakeDraft): BirValidity {
  const reasons: string[] = [];
  if (!draft.tin || !isValidTin(draft.tin)) reasons.push("missing_or_invalid_tin");
  if (!draft.orNumber || draft.orNumber.trim().length === 0) {
    reasons.push("missing_or_number");
  }
  if (!draft.docType || draft.docType === "unknown") {
    reasons.push("unknown_doc_type");
  }
  return { valid: reasons.length === 0, reasons };
}
