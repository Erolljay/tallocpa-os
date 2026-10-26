import { formatPeso } from "@tallocpa/validation";
import { isHeadOffice } from "./branch.js";
import type { InvoiceParseResult } from "./types.js";

/** Render centavos as a peso string, or a dash when absent. */
function money(c: number | null): string {
  return c == null ? "—" : formatPeso(c);
}

/** Human label for a VAT class. */
function vatLabel(vatClass: string): string {
  switch (vatClass) {
    case "vat_exempt":
      return "VAT-exempt";
    case "zero_rated":
      return "Zero-rated";
    default:
      return "Vatable (12%)";
  }
}

/**
 * Render a parsed invoice as a plain-text summary — the seven requested fields
 * in order, followed by any review notes. Framing (bot chrome, markdown) is the
 * caller's job; this stays presentation-neutral so it's easy to unit-test.
 */
export function formatInvoiceSummary(result: InvoiceParseResult): string {
  const { draft } = result;
  const branch = isHeadOffice(draft.branch)
    ? "Head Office"
    : (draft.branch as string);

  const lines = [
    `Date: ${draft.date ?? "—"}`,
    `Supplier: ${draft.supplierName ?? "—"}`,
    `TIN: ${draft.tin ?? "—"}`,
    `Branch: ${branch}`,
    `Amount (VAT inclusive): ${money(draft.gross)}`,
    `VAT: ${money(draft.vat)}`,
    `Net of VAT: ${money(draft.net)}`,
    `VAT type: ${vatLabel(draft.vatClass)}`,
  ];

  const remarks = [...result.flags, ...result.notes];
  if (remarks.length > 0) {
    lines.push("", `Review: ${remarks.join("; ")}`);
  }
  return lines.join("\n");
}
