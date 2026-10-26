import type { InvoiceParseResult, Recommendation } from "@tallocpa/photo-parser";
import type {
  AiRecommendation,
  Centavos,
  DocType,
  Ledger,
  TaxValidity,
  VatClass,
} from "@tallocpa/domain";

/** The `intake_items` columns an AI extraction fills (snake_case). */
export interface ExtractedFields {
  period: string | null;
  review_status: "needs_review" | "flagged" | "unreadable";
  txn_date: string | null;
  supplier_name: string | null;
  counterparty_address: string | null;
  gross: Centavos | null;
  vatable: Centavos | null;
  vat_exempt: Centavos | null;
  zero_rated: Centavos | null;
  vat: Centavos | null;
  wht_amount: Centavos | null;
  atc: string | null;
  vat_class: VatClass;
  tin: string | null;
  or_number: string | null;
  doc_type: DocType;
  ledger: Ledger;
  confidence: number | null;
  tax_validity: TaxValidity;
  bir_valid: boolean;
  ai_recommendation: AiRecommendation | null;
  review_notes: string | null;
}

/**
 * Columns from one AI extraction. Shared by the Telegram and portal lanes so
 * they can never drift apart. Nothing is auto-approved here: failed checks
 * land the item in "flagged", and the AI's recommendation is stored for the
 * reviewer and the n8n rule, not acted on.
 */
export function extractedFields(
  result: InvoiceParseResult,
  recommendation: Recommendation | null = null,
): ExtractedFields {
  const { draft } = result;
  const extra =
    recommendation && recommendation.recommendation !== "approve" ? recommendation.reasons : [];
  const allNotes = [...new Set([...result.flags, ...result.notes, ...extra])];
  return {
    period: draft.date ? draft.date.slice(0, 7) : null,
    review_status: result.status,
    txn_date: draft.date,
    supplier_name: draft.supplierName,
    counterparty_address: draft.address,
    gross: draft.gross,
    vatable: draft.vatable,
    vat_exempt: draft.vatExempt,
    zero_rated: draft.zeroRated,
    vat: draft.vat,
    wht_amount: draft.wht,
    atc: draft.atc,
    vat_class: draft.vatClass,
    tin: draft.tin,
    or_number: draft.orNumber,
    doc_type: draft.docType,
    ledger: draft.ledger,
    confidence: result.confidence,
    tax_validity: result.taxValidity,
    bir_valid: result.birValid,
    ai_recommendation: recommendation?.recommendation ?? null,
    review_notes: allNotes.length > 0 ? allNotes.join("; ") : null,
  };
}

/** A full insert row (Telegram lane inserts in one go). */
export function extractedItemRow(params: {
  clientId: string;
  source: "photo" | "portal";
  result: InvoiceParseResult;
  recommendation?: Recommendation | null;
}): ExtractedFields & { client_id: string; source: "photo" | "portal" } {
  return {
    client_id: params.clientId,
    source: params.source,
    ...extractedFields(params.result, params.recommendation),
  };
}
