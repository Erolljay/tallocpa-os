"use server";

import { revalidatePath } from "next/cache";
import {
  CLIENT_UPLOADS_BUCKET,
  createServiceClient,
  createUploadedItem,
  requestHold,
} from "@tallocpa/db";
import { requireClient } from "@/lib/session";
import { notify } from "@/lib/flow";

/** Mirrors the bucket's allowed_mime_types in 0005_portal.sql. */
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;
/** `<client_id>/<uuid>.<ext>` — exactly what UploadForm writes. */
const PATH_SHAPE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|heic|heif|pdf)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProcessResult {
  ok: boolean;
  message: string;
}

/**
 * Step 1: register a file the client just uploaded to their storage folder and
 * hand it to n8n, which orchestrates reading it. The path comes from the
 * browser, so it is checked against the signed-in client's own folder first.
 */
export async function processDocument(path: string): Promise<ProcessResult> {
  const { client } = await requireClient();
  if (typeof path !== "string" || !PATH_SHAPE.test(path) || !path.startsWith(`${client.id}/`)) {
    return { ok: false, message: "That upload doesn't belong to your account." };
  }

  const supabase = createServiceClient();
  // Idempotent: a retried or replayed call must not create a second item.
  const seen = await supabase.from("documents").select("id").eq("storage_path", path).limit(1);
  if (seen.error) throw seen.error;
  if ((seen.data ?? []).length > 0) return { ok: true, message: "Already received" };

  const file = await supabase.storage.from(CLIENT_UPLOADS_BUCKET).download(path);
  if (file.error) return { ok: false, message: "We couldn't find that upload. Please try again." };
  const mimeType = file.data.type;
  if (!ALLOWED_MIME.test(mimeType)) {
    return { ok: false, message: "Please upload a photo (JPG, PNG, HEIC) or a PDF." };
  }

  const { intakeItemId } = await createUploadedItem(supabase, { clientId: client.id, storagePath: path, mimeType });
  // shortcut: if n8n is down the item waits as "uploaded"; staff use "Parse now" in /review.
  await notify(intakeItemId, "document.uploaded");
  revalidatePath("/upload");
  return { ok: true, message: "Received" };
}

/** A client asks to report an item in a later month of the same year. */
export async function requestHoldAction(form: FormData): Promise<void> {
  const { client } = await requireClient();
  const itemId = String(form.get("id") ?? "");
  if (!UUID.test(itemId)) throw new Error("Invalid item.");
  const error = await requestHold(createServiceClient(), {
    itemId,
    clientId: client.id,
    holdPeriod: String(form.get("period") ?? ""),
    reason: String(form.get("reason") ?? ""),
  });
  if (error) throw new Error(error);
  revalidatePath("/upload");
}
