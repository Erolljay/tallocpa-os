"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import { processDocument } from "./actions";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

const BUCKET = "client-uploads";
const MAX_BYTES = 15 * 1024 * 1024; // matches the bucket's file_size_limit
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

type Row = { key: string; name: string; status: string; isError: boolean };

type Props = { clientId: string };

/**
 * Files go straight from the browser to the client's own storage folder (RLS
 * enforces the folder), so large PDFs never hit the server's request limit.
 * Each file is then handed to the server action to be read by the AI.
 */
export function UploadForm({ clientId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const update = (key: string, status: string, isError = false) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, status, isError } : r)));

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    const batch = files.map((f) => ({ key: crypto.randomUUID(), name: f.name, status: "Waiting…", isError: false }));
    setRows((prev) => [...batch, ...prev]);
    setIsBusy(true);

    // Sequential: keeps phones on slow connections from timing out mid-batch.
    for (const [i, file] of files.entries()) {
      const { key } = batch[i]!;
      const ext = EXT[file.type];
      if (!ext) { update(key, "Not a photo or PDF", true); continue; }
      if (file.size > MAX_BYTES) { update(key, "Too large (max 15 MB)", true); continue; }

      update(key, "Uploading…");
      const path = `${clientId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (error) { update(key, "Upload failed — please retry", true); continue; }

      update(key, "Saving…");
      try {
        const result = await processDocument(path);
        update(key, result.message, !result.ok);
      } catch {
        update(key, "Uploaded, but processing failed — please tell us", true);
      }
    }
    setIsBusy(false);
  }

  return (
    <div className="sheet">
      <label
        className={`dropzone${isDragging ? " active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); void handleFiles(e.dataTransfer.files); }}
      >
        <strong>{isBusy ? "Working on your files…" : "Add receipts, invoices or payroll files"}</strong>
        <span className="muted">Tap to take a photo or choose files · JPG, PNG, HEIC or PDF · up to 15 MB each</span>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
          disabled={isBusy}
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
        />
      </label>
      {rows.length > 0 && (
        <ul className="progress" aria-live="polite">
          {rows.map((r) => (
            <li key={r.key}>
              <span>{r.name}</span>
              <span className={r.isError ? "error" : "muted"}>{r.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
