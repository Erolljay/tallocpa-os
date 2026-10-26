import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClientContext,
  InvoiceParseResult,
  Recommendation,
} from "@tallocpa/photo-parser";
import { pesosToCentavos } from "@tallocpa/validation";
import type {
  AiRecommendation,
  Centavos,
  DocType,
  Ledger,
  ReviewStatus,
  StaffRole,
  TaxValidity,
  VatClass,
} from "@tallocpa/domain";
import { extractedFields } from "./extracted-item.js";
import { canAutoClear, holdPeriodError, postingPeriod } from "./workflow.js";

/** Private bucket the portal uploads into: `<client_id>/<file>` (0005_portal.sql). */
export const CLIENT_UPLOADS_BUCKET = "client-uploads";

/** Statuses still in the review bucket (CLAUDE.md step 4). */
const IN_BUCKET: ReviewStatus[] = ["needs_review", "flagged", "unreadable", "extract_failed"];

export interface PortalClient extends ClientContext {
  id: string;
}

/** An `intake_items` row as the portal and n8n read it. */
export interface IntakeItemRow {
  id: string;
  client_id: string;
  source: string;
  period: string | null;
  review_status: ReviewStatus;
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
  ledger: Ledger | null;
  confidence: number | null;
  tax_validity: TaxValidity | null;
  bir_valid: boolean | null;
  ai_recommendation: AiRecommendation | null;
  review_notes: string | null;
  client_note: string | null;
  hold_period: string | null;
  hold_reason: string | null;
  hold_approved_by: string | null;
  hold_approved_at: string | null;
  approval_source: "staff" | "rule" | null;
  approved_by: string | null;
  approved_at: string | null;
  n8n_sent_at: string | null;
  drive_file_id: string | null;
  created_at: string;
}

/** The client a portal user belongs to, or null when the user isn't linked. */
export async function getPortalClient(
  supabase: SupabaseClient,
  userId: string,
): Promise<PortalClient | null> {
  const { data, error } = await supabase
    .from("client_users")
    .select("clients (id, name, tin)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const client = (data as { clients: PortalClient | null } | null)?.clients;
  return client ?? null;
}

/** The staff role of an auth user, or null when they aren't staff. */
export async function getStaffRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<StaffRole | null> {
  const { data, error } = await supabase
    .from("app_user")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { role: StaffRole } | null)?.role ?? null;
}

/** True when the auth user is firm staff (has an `app_user` row). */
export async function isStaffUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  return (await getStaffRole(supabase, userId)) != null;
}

/** Practice leads sign off deferred sales (hard rule 3). */
export function isPracticeLead(role: StaffRole | null): boolean {
  return role === "owner" || role === "manager";
}

/** Step 1: record an upload as an "uploaded" item with its document row. */
export async function createUploadedItem(
  supabase: SupabaseClient,
  params: { clientId: string; storagePath: string; mimeType: string },
): Promise<{ intakeItemId: string }> {
  const item = await supabase
    .from("intake_items")
    .insert({ client_id: params.clientId, source: "portal", review_status: "uploaded" })
    .select("id")
    .single();
  if (item.error) throw item.error;
  const intakeItemId = (item.data as { id: string }).id;

  const doc = await supabase.from("documents").insert({
    client_id: params.clientId,
    intake_item_id: intakeItemId,
    storage_path: params.storagePath,
    mime_type: params.mimeType,
  });
  if (doc.error) throw doc.error;
  return { intakeItemId };
}

export interface ItemWithContext {
  item: IntakeItemRow;
  client: PortalClient;
  storagePath: string | null;
  mimeType: string | null;
}

/** Load an item with its client and stored file — what parsing and n8n need. */
export async function loadItem(supabase: SupabaseClient, itemId: string): Promise<ItemWithContext> {
  const { data, error } = await supabase
    .from("intake_items")
    .select("*, clients (id, name, tin), documents (storage_path, mime_type)")
    .eq("id", itemId)
    .single();
  if (error) throw error;
  const { clients, documents, ...item } = data as IntakeItemRow & {
    clients: PortalClient;
    documents: { storage_path: string; mime_type: string | null }[] | null;
  };
  return {
    item,
    client: clients,
    storagePath: documents?.[0]?.storage_path ?? null,
    mimeType: documents?.[0]?.mime_type ?? null,
  };
}

/**
 * Another live item of the same client with the same invoice number from the
 * same counterparty (TIN, or name when there is no TIN), or null.
 */
export async function findDuplicate(
  supabase: SupabaseClient,
  params: { itemId: string; clientId: string; tin: string | null; supplierName: string | null; orNumber: string | null },
): Promise<string | null> {
  if (!params.orNumber || (!params.tin && !params.supplierName)) return null;
  const base = supabase
    .from("intake_items")
    .select("id")
    .eq("client_id", params.clientId)
    .eq("or_number", params.orNumber)
    .neq("id", params.itemId)
    .neq("review_status", "rejected");
  const scoped = params.tin ? base.eq("tin", params.tin) : base.ilike("supplier_name", params.supplierName!);
  const { data, error } = await scoped.limit(1);
  if (error) throw error;
  return (data as { id: string }[] | null)?.[0]?.id ?? null;
}

/**
 * Steps 2–4: save the AI result onto an uploaded item. Adds the duplicate flag
 * (which needs the database, so it can't live in the pure parser). Only an
 * item still waiting to be read can be (re)parsed.
 */
export async function saveParsedItem(
  supabase: SupabaseClient,
  params: { itemId: string; clientId: string; result: InvoiceParseResult; recommendation: Recommendation },
): Promise<void> {
  const fields = extractedFields(params.result, params.recommendation);
  const dup = await findDuplicate(supabase, {
    itemId: params.itemId,
    clientId: params.clientId,
    tin: fields.tin,
    supplierName: fields.supplier_name,
    orNumber: fields.or_number,
  });
  const update = dup
    ? {
        ...fields,
        review_status: "flagged" as const,
        ai_recommendation: "review" as const,
        review_notes: [`duplicate invoice number (see item ${dup})`, fields.review_notes]
          .filter(Boolean)
          .join("; "),
      }
    : fields;

  const { error } = await supabase
    .from("intake_items")
    .update(update)
    .eq("id", params.itemId)
    .in("review_status", ["uploaded", "extract_failed"]);
  if (error) throw error;
}

/** Record that the AI couldn't read an upload; it stays in the bucket for staff. */
export async function markExtractFailed(
  supabase: SupabaseClient,
  itemId: string,
  message: string,
): Promise<void> {
  const { error } = await supabase
    .from("intake_items")
    .update({ review_status: "extract_failed", review_notes: `AI extraction failed: ${message.slice(0, 300)}` })
    .eq("id", itemId)
    .in("review_status", ["uploaded", "extract_failed"]);
  if (error) throw error;
}

export interface ReviewQueueEntry extends IntakeItemRow {
  client_name: string;
  storage_path: string | null;
}

/**
 * Everything waiting on the firm: the review bucket, uploads not yet read,
 * held items (sales holds need sign-off), cleared items that couldn't
 * post (no date), and posted items n8n hasn't received yet (Resend).
 */
export async function listReviewQueue(supabase: SupabaseClient): Promise<ReviewQueueEntry[]> {
  const { data, error } = await supabase
    .from("intake_items")
    .select("*, clients (name), documents (storage_path)")
    .eq("source", "portal")
    .or(
      "review_status.in.(uploaded,needs_review,flagged,unreadable,extract_failed,held,approved),and(review_status.eq.posted,n8n_sent_at.is.null)",
    )
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;

  type Joined = IntakeItemRow & {
    clients: { name: string } | null;
    documents: { storage_path: string }[] | null;
  };
  return ((data as Joined[] | null) ?? []).map(({ clients, documents, ...row }) => ({
    ...row,
    client_name: clients?.name ?? "",
    storage_path: documents?.[0]?.storage_path ?? null,
  }));
}

/** A portal client's own uploads, newest first (for the upload page). */
export async function listClientItems(
  supabase: SupabaseClient,
  clientId: string,
): Promise<IntakeItemRow[]> {
  const { data, error } = await supabase
    .from("intake_items")
    .select("*")
    .eq("client_id", clientId)
    .eq("source", "portal")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as IntakeItemRow[] | null) ?? [];
}

/** Reviewer edits; money arrives in pesos from the form. */
export interface ItemEdits {
  txnDate: string | null;
  supplierName: string | null;
  tin: string | null;
  counterpartyAddress: string | null;
  orNumber: string | null;
  ledger: Ledger;
  grossPesos: number | null;
  vatablePesos: number | null;
  vatExemptPesos: number | null;
  zeroRatedPesos: number | null;
  vatPesos: number | null;
  whtPesos: number | null;
  atc: string | null;
  clientNote: string | null;
}

const centavos = (p: number | null) => (p == null ? null : pesosToCentavos(p));

/**
 * Save a reviewer's corrections. Amounts are stored as the reviewer typed them
 * (the printed figures) — no tax is computed here (hard rule 1).
 */
export async function updateItemFields(
  supabase: SupabaseClient,
  itemId: string,
  edits: ItemEdits,
): Promise<void> {
  const { error } = await supabase
    .from("intake_items")
    .update({
      txn_date: edits.txnDate,
      period: edits.txnDate ? edits.txnDate.slice(0, 7) : null,
      supplier_name: edits.supplierName,
      tin: edits.tin,
      counterparty_address: edits.counterpartyAddress,
      or_number: edits.orNumber,
      ledger: edits.ledger,
      gross: centavos(edits.grossPesos),
      vatable: centavos(edits.vatablePesos),
      vat_exempt: centavos(edits.vatExemptPesos),
      zero_rated: centavos(edits.zeroRatedPesos),
      vat: centavos(edits.vatPesos),
      wht_amount: centavos(edits.whtPesos),
      atc: edits.atc,
      client_note: edits.clientNote,
    })
    .eq("id", itemId)
    .in("review_status", IN_BUCKET);
  if (error) throw error;
}

/**
 * Clear an item (spec "cleared" = status approved). By staff: any item in the
 * bucket. By the n8n rule: only what {@link canAutoClear} allows, checked
 * against the STORED row so a misconfigured rule can't push junk through.
 * Returns false when nothing was cleared.
 */
export async function clearItem(
  supabase: SupabaseClient,
  itemId: string,
  by: { staffUserId: string } | { rule: true },
): Promise<boolean> {
  if ("rule" in by) {
    const { item } = await loadItem(supabase, itemId);
    if (!canAutoClear(item)) return false;
  }
  const { data, error } = await supabase
    .from("intake_items")
    .update({
      review_status: "approved",
      approval_source: "rule" in by ? "rule" : "staff",
      approved_by: "rule" in by ? null : by.staffUserId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .in("review_status", "rule" in by ? ["needs_review"] : IN_BUCKET)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Reject an item; the reason is shown to the client (spec step 4). */
export async function rejectItem(
  supabase: SupabaseClient,
  itemId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from("intake_items")
    .update({ review_status: "rejected", client_note: reason.trim() || "Not accepted." })
    .eq("id", itemId)
    .in("review_status", IN_BUCKET);
  if (error) throw error;
}

/**
 * Step 5: assign the period (hold month, else document month) and post a
 * cleared item into the books (status "posted"; see view client_books).
 * Returns false when the item wasn't cleared or has no date to post by.
 */
export async function postItem(supabase: SupabaseClient, itemId: string): Promise<boolean> {
  const { item } = await loadItem(supabase, itemId);
  const period = postingPeriod(item);
  if (item.review_status !== "approved" || !period) return false;
  const { data, error } = await supabase
    .from("intake_items")
    .update({ review_status: "posted", period })
    .eq("id", itemId)
    .eq("review_status", "approved")
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** n8n copied the source file into Drive `/{Client}/{Year}/Intake/`. */
export async function setDriveFile(supabase: SupabaseClient, itemId: string, fileId: string): Promise<void> {
  const { error } = await supabase.from("intake_items").update({ drive_file_id: fileId }).eq("id", itemId);
  if (error) throw error;
}

/**
 * A client asks to defer an item to a later month of the same taxable year
 * (hard rule 2). Purchases/expenses are held at once; sales wait for
 * practice-lead sign-off (hard rule 3). Returns an error message or null.
 */
export async function requestHold(
  supabase: SupabaseClient,
  params: { itemId: string; clientId: string; holdPeriod: string; reason: string },
): Promise<string | null> {
  const { item } = await loadItem(supabase, params.itemId);
  if (item.client_id !== params.clientId) return "That item isn't yours.";
  if (!["needs_review", "flagged"].includes(item.review_status)) {
    return "Only items still under review can be held.";
  }
  const invalid = holdPeriodError(item.txn_date, params.holdPeriod);
  if (invalid) return invalid;

  const { error } = await supabase
    .from("intake_items")
    .update({
      review_status: "held",
      hold_period: params.holdPeriod,
      hold_reason: params.reason.trim().slice(0, 300) || null,
      hold_approved_at: item.ledger === "sales" ? null : new Date().toISOString(),
      hold_approved_by: null,
    })
    .eq("id", params.itemId)
    .in("review_status", ["needs_review", "flagged"]);
  if (error) throw error;
  return null;
}

/** A practice lead signs off a deferred sale, with a logged reason. */
export async function approveHold(
  supabase: SupabaseClient,
  params: { itemId: string; staffUserId: string; reason: string },
): Promise<void> {
  if (!params.reason.trim()) throw new Error("A reason is required to approve a deferred sale.");
  const { item } = await loadItem(supabase, params.itemId);
  const logged = `hold approved: ${params.reason.trim()}`;
  const { error } = await supabase
    .from("intake_items")
    .update({
      hold_approved_by: params.staffUserId,
      hold_approved_at: new Date().toISOString(),
      review_notes: item.review_notes ? `${item.review_notes}; ${logged}` : logged,
    })
    .eq("id", params.itemId)
    .eq("review_status", "held");
  if (error) throw error;
}

/**
 * Monthly run: holds whose period has arrived go back to the bucket (so they
 * clear and post into their hold period). Unsigned sales holds stay held.
 * Returns the released item ids.
 */
export async function releaseDueHolds(supabase: SupabaseClient, currentPeriod: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("intake_items")
    .update({ review_status: "needs_review" })
    .eq("review_status", "held")
    .lte("hold_period", currentPeriod)
    .not("hold_approved_at", "is", null)
    .select("id");
  if (error) throw error;
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

/** Held purchases/expenses dated more than `days` ago (aging alert, hard rule 3). */
export async function listAgingHolds(
  supabase: SupabaseClient,
  days: number,
): Promise<Pick<IntakeItemRow, "id" | "client_id" | "supplier_name" | "txn_date" | "hold_period" | "gross">[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("intake_items")
    .select("id, client_id, supplier_name, txn_date, hold_period, gross")
    .eq("review_status", "held")
    .in("ledger", ["purchases", "expenses"])
    .lt("txn_date", cutoff)
    .order("txn_date", { ascending: true });
  if (error) throw error;
  return (data as never[]) ?? [];
}
