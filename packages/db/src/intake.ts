import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedRow, ParseResult } from "@tallocpa/template-parser";
import { checkBirValidity } from "@tallocpa/validation";
import type { Centavos, DocType, VatClass } from "@tallocpa/domain";

/** Shape written to the `intake_items` table (snake_case matches Postgres). */
interface IntakeItemInsert {
  client_id: string;
  batch_id: string;
  source: "template";
  period: string | null;
  review_status: "needs_review";
  txn_date: string | null;
  supplier_name: string | null;
  gross: Centavos | null;
  vat: Centavos | null;
  vat_class: VatClass;
  tin: string | null;
  or_number: string | null;
  doc_type: DocType;
  category: string | null;
  account_code: string | null;
  confidence: number | null;
  bir_valid: boolean;
  review_notes: string | null;
}

/**
 * Map one parsed template row to an intake_items insert. Everything lands as
 * `needs_review` — nothing is dropped. Row-level errors and the duplicate flag
 * are carried into `review_notes` so the reviewer sees exactly what to check.
 */
function toInsert(
  clientId: string,
  batchId: string,
  row: ParsedRow,
): IntakeItemInsert {
  const d = row.draft;
  const notes: string[] = [...row.errors];
  if (row.status === "duplicate") notes.push("possible_duplicate");

  return {
    client_id: clientId,
    batch_id: batchId,
    source: "template",
    period: d.date ? d.date.slice(0, 7) : null,
    review_status: "needs_review",
    txn_date: d.date ?? null,
    supplier_name: d.supplierName ?? null,
    gross: d.gross ?? null,
    vat: d.vat ?? null,
    vat_class: row.vatClass,
    tin: d.tin ?? null,
    or_number: d.orNumber ?? null,
    doc_type: d.docType ?? "unknown",
    category: row.category,
    account_code: null,
    confidence: null,
    bir_valid: checkBirValidity(d).valid,
    review_notes: notes.length > 0 ? notes.join("; ") : null,
  };
}

export interface IngestResult {
  batchId: string;
  inserted: number;
  summary: ParseResult["summary"];
}

/**
 * Persist a parsed template batch: create the batch row, then insert every
 * parsed row as a reviewable intake item. Throws on any database error so the
 * caller (and the operator) sees a failure loudly rather than a silent drop.
 */
export async function ingestParsedBatch(
  supabase: SupabaseClient,
  params: { clientId: string; fileName: string | null; parsed: ParseResult },
): Promise<IngestResult> {
  const { clientId, fileName, parsed } = params;

  const { data: batch, error: batchError } = await supabase
    .from("intake_batches")
    .insert({
      client_id: clientId,
      source: "template",
      file_name: fileName,
      row_count: parsed.rows.length,
    })
    .select("id")
    .single();

  if (batchError) throw batchError;
  const batchId = (batch as { id: string }).id;

  const inserts = parsed.rows.map((row) => toInsert(clientId, batchId, row));
  if (inserts.length > 0) {
    const { error: itemsError } = await supabase
      .from("intake_items")
      .insert(inserts);
    if (itemsError) throw itemsError;
  }

  return { batchId, inserted: inserts.length, summary: parsed.summary };
}
