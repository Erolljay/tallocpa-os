import { timingSafeEqual } from "node:crypto";
import {
  CLIENT_UPLOADS_BUCKET,
  clearItem,
  createServiceClient,
  loadItem,
  markExtractFailed,
  n8nConfigFromEnv,
  postItem,
  saveParsedItem,
  sendEvent,
  type N8nEvent,
} from "@tallocpa/db";
import { GeminiClient, mapExtraction, recommend } from "@tallocpa/photo-parser";

/**
 * Server-only workflow steps shared by the portal's own actions and the
 * endpoints n8n calls. Imported only from server actions and route handlers.
 */

function gemini(): GeminiClient {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set (see .env.example).");
  return new GeminiClient(key, process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash");
}

/** True when a request from n8n carries the shared secret (constant-time compare). */
export function isFromN8n(request: Request): boolean {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  const got = request.headers.get("x-tallocpa-secret");
  if (!expected || !got) return false;
  const a = new TextEncoder().encode(got);
  const b = new TextEncoder().encode(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Best-effort event to n8n; a failure is logged, never shown to the client. */
export async function notify(itemId: string, event: N8nEvent): Promise<boolean> {
  try {
    await sendEvent(createServiceClient(), itemId, event, n8nConfigFromEnv());
    return true;
  } catch (err) {
    console.error(`[portal] n8n ${event} failed for ${itemId}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/**
 * Steps 2–4: read an uploaded document with Gemini, check it, and drop it in
 * the review bucket (needs_review / flagged). A failed read lands as
 * extract_failed so staff still see it. Safe to call twice: only items still
 * waiting to be read are updated.
 */
export async function parseItem(itemId: string): Promise<void> {
  const supabase = createServiceClient();
  const { item, client, storagePath } = await loadItem(supabase, itemId);
  if (!["uploaded", "extract_failed"].includes(item.review_status)) return;
  try {
    if (!storagePath) throw new Error("no stored file");
    const file = await supabase.storage.from(CLIENT_UPLOADS_BUCKET).download(storagePath);
    if (file.error) throw file.error;
    const bytes = Buffer.from(await file.data.arrayBuffer());
    const raw = await gemini().extractInvoice(bytes, file.data.type, client);
    const result = mapExtraction(raw, client);
    await saveParsedItem(supabase, {
      itemId,
      clientId: client.id,
      result,
      recommendation: recommend(result),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[portal] extraction failed for ${itemId}: ${detail}`);
    await markExtractFailed(supabase, itemId, detail);
  }
}

/**
 * Clear (by staff or the n8n rule), post into the books, then tell n8n. Returns
 * false when the item couldn't be cleared (the rule guard said no, or it was
 * already decided). Posting is skipped for undated items, which stay cleared
 * in the queue for staff to date.
 */
export async function clearAndPost(
  itemId: string,
  by: { staffUserId: string } | { rule: true },
): Promise<boolean> {
  const supabase = createServiceClient();
  if (!(await clearItem(supabase, itemId, by))) return false;
  if (await postItem(supabase, itemId)) await notify(itemId, "item.posted");
  return true;
}
