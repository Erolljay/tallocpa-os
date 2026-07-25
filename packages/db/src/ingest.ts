import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { fileToRows } from "@tallocpa/template-io";
import { parseTemplateRows } from "@tallocpa/template-parser";
import { createServiceClient } from "./client.js";
import { ingestParsedBatch, type IngestResult } from "./intake.js";

/**
 * End-to-end template ingest: read a file from disk, decode it, parse + validate
 * every row, and persist the batch to Supabase for review. CSV is read as text,
 * XLSX as binary.
 */
export async function ingestTemplateFile(params: {
  filePath: string;
  clientId: string;
}): Promise<IngestResult> {
  const { filePath, clientId } = params;
  const ext = extname(filePath).slice(1).toLowerCase();

  const data =
    ext === "csv"
      ? await readFile(filePath, "utf8")
      : await readFile(filePath);

  const rows = await fileToRows({ name: filePath, data });
  const parsed = parseTemplateRows(rows);

  const supabase = createServiceClient();
  return ingestParsedBatch(supabase, {
    clientId,
    fileName: basename(filePath),
    parsed,
  });
}
