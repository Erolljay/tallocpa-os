import type { SupabaseClient } from "@supabase/supabase-js";
import { recommend, type InvoiceParseResult } from "@tallocpa/photo-parser";
import { extractedItemRow } from "./extracted-item.js";

/** One active binding row (chat -> client). */
interface BindingRow {
  client_id: string;
}

/**
 * Resolve the client a Telegram chat is bound to, or null when the chat has no
 * active binding yet. The photo lane needs this before it can persist: an
 * intake item must belong to a client.
 */
export async function resolveClientForChat(
  supabase: SupabaseClient,
  chatId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("telegram_bindings")
    .select("client_id")
    .eq("chat_id", chatId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return (data as BindingRow | null)?.client_id ?? null;
}

export interface ClientMatch {
  id: string;
  name: string;
  tin: string | null;
}

/**
 * Find a single client by exact name (case-insensitive) or by TIN digits, for
 * the `/bind` command. Returns null when there is no unambiguous match so the
 * bot can ask the operator to be more specific rather than bind the wrong books.
 */
export async function findClient(
  supabase: SupabaseClient,
  query: string,
): Promise<ClientMatch | null> {
  const q = query.trim();
  if (q === "") return null;

  // A 9+ digit query is a TIN; otherwise match on name. Filtering by a single
  // column value (not an `.or()` string) keeps commas in corporate names safe.
  const digits = q.replace(/\D/g, "");
  const base = supabase.from("clients").select("id, name, tin");
  const filtered =
    digits.length >= 9
      ? base.ilike("tin", `%${digits}%`)
      : base.ilike("name", `%${q}%`);

  const { data, error } = await filtered.limit(2);
  if (error) throw error;
  const rows = (data as ClientMatch[] | null) ?? [];
  return rows.length === 1 ? rows[0]! : null;
}

/**
 * Bind a Telegram chat to a client (idempotent upsert on chat_id). A chat maps
 * to exactly one client; re-binding repoints it and re-activates.
 */
export async function bindChatToClient(
  supabase: SupabaseClient,
  params: { chatId: string; clientId: string },
): Promise<void> {
  const { error } = await supabase.from("telegram_bindings").upsert(
    {
      chat_id: params.chatId,
      client_id: params.clientId,
      active: true,
      bound_at: new Date().toISOString(),
    },
    { onConflict: "chat_id" },
  );
  if (error) throw error;
}

export type PhotoIngestOutcome =
  | { status: "unbound" }
  | { status: "duplicate"; clientId: string }
  | { status: "saved"; clientId: string; intakeItemId: string };

/**
 * Persist one extracted supplier invoice from the Telegram photo lane.
 *
 * Flow mirrors the designed queue: resolve the chat's client, make the write
 * idempotent against Telegram retries via `telegram_update_id`, record the
 * inbox row, then insert the reviewable `intake_items` draft (and a `documents`
 * row when the image was stored). Everything lands as `needs_review` (or
 * `unreadable`) — nothing is auto-approved. Throws on any DB error so a partial
 * write never passes silently.
 */
export async function ingestPhotoInvoice(
  supabase: SupabaseClient,
  params: {
    chatId: string;
    telegramUpdateId: string;
    result: InvoiceParseResult;
    storagePath?: string | null;
    mimeType?: string | null;
  },
): Promise<PhotoIngestOutcome> {
  const clientId = await resolveClientForChat(supabase, params.chatId);
  if (!clientId) return { status: "unbound" };

  // Idempotency: a Telegram retry reuses the same update id.
  const existing = await supabase
    .from("intake_inbox")
    .select("id")
    .eq("telegram_update_id", params.telegramUpdateId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { status: "duplicate", clientId };

  const inbox = await supabase
    .from("intake_inbox")
    .insert({
      source: "photo",
      client_id: clientId,
      telegram_update_id: params.telegramUpdateId,
      storage_path: params.storagePath ?? null,
      processed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (inbox.error) throw inbox.error;

  const insert = extractedItemRow({
    clientId,
    source: "photo",
    result: params.result,
    recommendation: recommend(params.result),
  });

  const item = await supabase
    .from("intake_items")
    .insert(insert)
    .select("id")
    .single();
  if (item.error) throw item.error;
  const intakeItemId = (item.data as { id: string }).id;

  if (params.storagePath) {
    const doc = await supabase.from("documents").insert({
      client_id: clientId,
      intake_item_id: intakeItemId,
      storage_path: params.storagePath,
      mime_type: params.mimeType ?? null,
    });
    if (doc.error) throw doc.error;
  }

  return { status: "saved", clientId, intakeItemId };
}
