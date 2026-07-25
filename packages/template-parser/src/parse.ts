import {
  validateRequiredFields,
  reconcileVat,
  isValidTin,
  type IntakeDraft,
  type VatClass,
} from "@tallocpa/validation";
import { COLUMN_ALIASES, getField } from "./columns.js";
import { parseMoneyToCentavos, parseDateToIso, parseVatClass } from "./coerce.js";

export type RowStatus = "ok" | "needs_fix" | "duplicate";

export interface ParsedRow {
  /** 1-based data-row index (header excluded). */
  rowNumber: number;
  draft: IntakeDraft;
  vatClass: VatClass;
  category: string | null;
  status: RowStatus;
  /** Machine-readable reasons a reviewer must resolve; empty when ok. */
  errors: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  summary: { total: number; ok: number; needsFix: number; duplicates: number };
}

function emptyToNull(value: string | undefined): string | null {
  const t = (value ?? "").trim();
  return t === "" ? null : t;
}

function nonEmpty(raw: string | undefined): boolean {
  return raw != null && String(raw).trim() !== "";
}

function dedupKey(draft: IntakeDraft): string {
  return [
    draft.date ?? "",
    (draft.supplierName ?? "").toLowerCase().trim(),
    draft.gross ?? "",
    (draft.orNumber ?? "").toLowerCase().trim(),
  ].join("|");
}

/**
 * Parse a batch of template rows (already keyed by header) into reviewable
 * drafts. A bad row is flagged, never dropped, and never rejects the whole
 * batch — every row comes back with a status and its reasons.
 */
export function parseTemplateRows(
  rows: Record<string, string>[],
): ParseResult {
  const parsed: ParsedRow[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const errors: string[] = [];

    const dateRaw = getField(row, COLUMN_ALIASES.date);
    const grossRaw = getField(row, COLUMN_ALIASES.gross);
    const vatRaw = getField(row, COLUMN_ALIASES.vat);

    const date = parseDateToIso(dateRaw);
    const gross = parseMoneyToCentavos(grossRaw);
    const vat = nonEmpty(vatRaw)
      ? parseMoneyToCentavos(vatRaw)
      : { value: null, ok: true };
    const vatClass = parseVatClass(getField(row, COLUMN_ALIASES.vatClass));

    if (nonEmpty(dateRaw) && !date.ok) errors.push("unparseable_date");
    if (nonEmpty(grossRaw) && !gross.ok) errors.push("unparseable_gross");
    if (nonEmpty(vatRaw) && !vat.ok) errors.push("unparseable_vat");

    const draft: IntakeDraft = {
      date: date.value,
      supplierName: emptyToNull(getField(row, COLUMN_ALIASES.supplierName)),
      gross: gross.value,
      vat: vat.value,
      tin: emptyToNull(getField(row, COLUMN_ALIASES.tin)),
      orNumber: emptyToNull(getField(row, COLUMN_ALIASES.orNumber)),
      docType: "unknown",
    };

    for (const field of validateRequiredFields(draft).missing) {
      errors.push(`missing_${field}`);
    }
    if (draft.tin && !isValidTin(draft.tin)) errors.push("invalid_tin");
    if (draft.gross != null && draft.vat != null) {
      const rec = reconcileVat({
        gross: draft.gross,
        providedVat: draft.vat,
        vatClass,
      });
      if (!rec.ok) errors.push("vat_mismatch");
    }

    let status: RowStatus = errors.length === 0 ? "ok" : "needs_fix";
    const key = dedupKey(draft);
    if (status === "ok" && seen.has(key)) status = "duplicate";
    if (status !== "duplicate") seen.add(key);

    parsed.push({
      rowNumber: index + 1,
      draft,
      vatClass,
      category: emptyToNull(getField(row, COLUMN_ALIASES.category)),
      status,
      errors,
    });
  });

  return {
    rows: parsed,
    summary: {
      total: parsed.length,
      ok: parsed.filter((r) => r.status === "ok").length,
      needsFix: parsed.filter((r) => r.status === "needs_fix").length,
      duplicates: parsed.filter((r) => r.status === "duplicate").length,
    },
  };
}
