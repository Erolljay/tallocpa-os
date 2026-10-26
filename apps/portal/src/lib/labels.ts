import type { Ledger, ReviewStatus, TaxValidity } from "@tallocpa/domain";
import { formatPeso } from "@tallocpa/validation";

/** The spec's three books (CLAUDE.md step 2), plus "other" for anything else. */
export const LEDGERS: Ledger[] = ["sales", "purchases", "expenses", "other"];

export const LEDGER_LABEL: Record<Ledger, string> = {
  sales: "Sales",
  purchases: "Purchases",
  expenses: "Expenses",
  payroll: "Payroll",
  other: "Other",
};

export const VALIDITY_LABEL: Record<TaxValidity, { label: string; tone: string }> = {
  valid_vat_and_it: { label: "Valid: VAT + IT", tone: "approve" },
  valid_it_only: { label: "Valid: IT only", tone: "review" },
  not_valid: { label: "Not valid", tone: "reject" },
};

/** What a client sees: they don't need the firm's internal review states. */
export function clientStatus(status: ReviewStatus): { label: string; tone: string } {
  switch (status) {
    case "uploaded":
    case "received":
      return { label: "Received", tone: "pending" };
    case "flagged":
    case "unreadable":
    case "extract_failed":
      return { label: "Needs attention", tone: "review" };
    case "held":
      return { label: "Held", tone: "pending" };
    case "approved":
    case "posted":
    case "exported":
      return { label: "Posted", tone: "approved" };
    case "rejected":
      return { label: "Returned", tone: "rejected" };
    default:
      return { label: "In review", tone: "pending" };
  }
}

/** Centavos → "₱1,234.50", or a dash. */
export function money(c: number | null): string {
  return c == null ? "—" : formatPeso(c);
}

/** Centavos → "1234.50" for an editable input, or "". */
export function pesoInput(c: number | null): string {
  return c == null ? "" : (c / 100).toFixed(2);
}

/** The next months of the document's year, for a hold request (hard rule 2). */
export function laterMonthsInYear(txnDate: string | null): string[] {
  if (!txnDate) return [];
  const year = txnDate.slice(0, 4);
  const month = Number(txnDate.slice(5, 7));
  return Array.from({ length: 12 - month }, (_, i) => `${year}-${String(month + 1 + i).padStart(2, "0")}`);
}
