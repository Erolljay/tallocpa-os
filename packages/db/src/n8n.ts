import type { SupabaseClient } from "@supabase/supabase-js";
import { centavosToPesos } from "@tallocpa/validation";
import { CLIENT_UPLOADS_BUCKET, loadItem, type IntakeItemRow } from "./intake-portal.js";
import { quarterOf } from "./workflow.js";

/** Signed links to the source file stay valid for a week. */
const FILE_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Events the portal sends n8n (one webhook, Switch on `event`):
 *  - document.uploaded  a client uploaded a file → n8n calls /api/n8n/parse
 *  - item.parsed        returned by /api/n8n/parse (not POSTed)
 *  - item.posted        a cleared item is in the books → Drive copy, next stages
 */
export type N8nEvent = "document.uploaded" | "item.parsed" | "item.posted";

type Amount = { centavos: number | null; pesos: number | null };

/**
 * The JSON contract n8n receives. Money is given as exact integer centavos
 * (do any math on these) and as pesos (display / sheets). Amounts are the
 * printed figures; nothing here is computed tax.
 */
export interface N8nPayload {
  event: N8nEvent;
  item: {
    id: string;
    status: string;
    ledger: string | null;
    taxValidity: string | null;
    aiRecommendation: string | null;
    period: string | null;
    quarter: string | null;
    holdPeriod: string | null;
    docType: string;
    date: string | null;
    year: string | null;
    invoiceNumber: string | null;
    counterparty: { name: string | null; tin: string | null; address: string | null };
    amounts: {
      gross: Amount;
      vatable: Amount;
      vatExempt: Amount;
      zeroRated: Amount;
      vat: Amount;
      wht: Amount;
    };
    atc: string | null;
    reviewNotes: string | null;
    approvalSource: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    driveFileId: string | null;
    fileUrl: string | null;
  };
  client: { id: string; name: string; tin: string | null };
}

const amount = (c: number | null): Amount => ({
  centavos: c,
  pesos: c == null ? null : centavosToPesos(c),
});

/** Pure: shape one item into the n8n payload. */
export function buildN8nPayload(
  event: N8nEvent,
  item: IntakeItemRow,
  client: { id: string; name: string; tin: string | null },
  fileUrl: string | null,
): N8nPayload {
  return {
    event,
    item: {
      id: item.id,
      status: item.review_status,
      ledger: item.ledger,
      taxValidity: item.tax_validity,
      aiRecommendation: item.ai_recommendation,
      period: item.period,
      quarter: item.period ? quarterOf(item.period) : null,
      holdPeriod: item.hold_period,
      docType: item.doc_type,
      date: item.txn_date,
      // Drive folder year (/{Client}/{Year}/Intake/): document year, else upload year.
      year: (item.txn_date ?? item.created_at).slice(0, 4),
      invoiceNumber: item.or_number,
      counterparty: { name: item.supplier_name, tin: item.tin, address: item.counterparty_address },
      amounts: {
        gross: amount(item.gross),
        vatable: amount(item.vatable),
        vatExempt: amount(item.vat_exempt),
        zeroRated: amount(item.zero_rated),
        vat: amount(item.vat),
        wht: amount(item.wht_amount),
      },
      atc: item.atc,
      reviewNotes: item.review_notes,
      approvalSource: item.approval_source,
      approvedBy: item.approved_by,
      approvedAt: item.approved_at,
      driveFileId: item.drive_file_id,
      fileUrl,
    },
    client: { id: client.id, name: client.name, tin: client.tin },
  };
}

export interface N8nConfig {
  webhookUrl: string;
  secret: string;
}

/** Read the n8n webhook config, failing loudly when it's missing. */
export function n8nConfigFromEnv(): N8nConfig {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!webhookUrl || !secret) {
    throw new Error("N8N_WEBHOOK_URL and N8N_WEBHOOK_SECRET must be set (see .env.example).");
  }
  return { webhookUrl, secret };
}

/** Load an item and build its payload, with a fresh signed link to the file. */
export async function itemPayload(
  supabase: SupabaseClient,
  itemId: string,
  event: N8nEvent,
): Promise<N8nPayload> {
  const { item, client, storagePath } = await loadItem(supabase, itemId);
  let fileUrl: string | null = null;
  if (storagePath) {
    const signed = await supabase.storage
      .from(CLIENT_UPLOADS_BUCKET)
      .createSignedUrl(storagePath, FILE_URL_TTL_SECONDS);
    if (signed.error) throw signed.error;
    fileUrl = signed.data.signedUrl;
  }
  return buildN8nPayload(event, item, client, fileUrl);
}

/**
 * POST one event to n8n. Throws on failure. `item.posted` stamps
 * `n8n_sent_at`, so an unsent posted item shows a Resend button.
 */
export async function sendEvent(
  supabase: SupabaseClient,
  itemId: string,
  event: N8nEvent,
  config: N8nConfig,
): Promise<void> {
  const payload = await itemPayload(supabase, itemId, event);
  const res = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tallocpa-secret": config.secret },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`n8n webhook failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  if (event === "item.posted") {
    const stamp = await supabase
      .from("intake_items")
      .update({ n8n_sent_at: new Date().toISOString() })
      .eq("id", itemId);
    if (stamp.error) throw stamp.error;
  }
}
