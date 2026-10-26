import type { SupabaseClient } from "@supabase/supabase-js";

/** Map a MIME type to a file extension for the stored object key. */
function extFor(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("heic")) return "heic";
  if (mimeType.includes("pdf")) return "pdf";
  return "jpg";
}

/**
 * Upload a receipt to Supabase Storage, best-effort. Returns the object path on
 * success, or null when storage isn't configured (e.g. the bucket doesn't
 * exist). A missing bucket must never block extraction — the reviewable draft
 * is the valuable output; the image is a convenience.
 */
export async function uploadReceipt(
  supabase: SupabaseClient,
  params: {
    bucket: string;
    chatId: number;
    updateId: number;
    bytes: Buffer;
    mimeType: string;
  },
): Promise<string | null> {
  const path = `${params.chatId}/${params.updateId}.${extFor(params.mimeType)}`;
  const { error } = await supabase.storage
    .from(params.bucket)
    .upload(path, params.bytes, {
      contentType: params.mimeType,
      upsert: true,
    });
  if (error) {
    console.warn(`[storage] skipped upload (${error.message})`);
    return null;
  }
  return path;
}
