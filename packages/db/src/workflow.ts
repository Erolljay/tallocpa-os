/**
 * Pure workflow rules (CLAUDE.md steps 4–5): who may be auto-cleared, which
 * holds are allowed, and which period a cleared item posts to. No I/O, so the
 * rules are tested directly and shared by the portal and the n8n endpoints.
 */
import type { IntakeItemRow } from "./intake-portal.js";

const BOOK_LEDGERS = ["sales", "purchases", "expenses"];

/**
 * The guard behind n8n's auto-clear rule. Even if the rule in n8n is
 * misconfigured, only an unflagged, tax-valid item the AI recommended can be
 * cleared without a human.
 */
export function canAutoClear(
  row: Pick<IntakeItemRow, "review_status" | "ai_recommendation" | "tax_validity" | "ledger">,
): boolean {
  return (
    row.review_status === "needs_review" &&
    row.ai_recommendation === "approve" &&
    (row.tax_validity === "valid_vat_and_it" || row.tax_validity === "valid_it_only") &&
    BOOK_LEDGERS.includes(row.ledger ?? "")
  );
}

/**
 * Why a hold request is not allowed, or null when it is. Hard rule 2: a held
 * item moves to a LATER month but stays inside the taxable year (calendar year).
 */
export function holdPeriodError(txnDate: string | null, holdPeriod: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(holdPeriod)) return "Pick a month (YYYY-MM).";
  if (!txnDate) return "This document has no date yet, so it can't be held.";
  if (holdPeriod.slice(0, 4) !== txnDate.slice(0, 4)) {
    return "A hold must stay within the same taxable year.";
  }
  if (holdPeriod <= txnDate.slice(0, 7)) return "Pick a month after the document's month.";
  return null;
}

/** Deferred sales need practice-lead sign-off before they count as held (hard rule 3). */
export function holdNeedsSignOff(
  row: Pick<IntakeItemRow, "ledger" | "hold_approved_at">,
): boolean {
  return row.ledger === "sales" && row.hold_approved_at == null;
}

/** The month a cleared item posts to: its hold period, else its document month. */
export function postingPeriod(
  row: Pick<IntakeItemRow, "hold_period" | "txn_date">,
): string | null {
  return row.hold_period ?? (row.txn_date ? row.txn_date.slice(0, 7) : null);
}

/** "2026-07" → "2026-Q3". */
export function quarterOf(period: string): string {
  return `${period.slice(0, 4)}-Q${Math.ceil(Number(period.slice(5, 7)) / 3)}`;
}
