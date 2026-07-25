import { parseCsv } from "./csv.js";
import { parseXlsx } from "./xlsx.js";

export interface UploadedFile {
  /** Original filename — its extension selects the decoder. */
  name: string;
  /** CSV text as a string, or binary (XLSX) as a Buffer/ArrayBuffer. */
  data: string | ArrayBuffer | Buffer;
}

/** Decode an uploaded intake file into header-keyed rows, dispatched by extension. */
export async function fileToRows(
  file: UploadedFile,
): Promise<Record<string, string>[]> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();

  if (ext === "csv") {
    const text =
      typeof file.data === "string"
        ? file.data
        : Buffer.from(file.data as ArrayBuffer).toString("utf8");
    return parseCsv(text);
  }

  if (ext === "xlsx" || ext === "xls") {
    if (typeof file.data === "string") {
      throw new Error(`${ext} upload requires binary data, received a string`);
    }
    return parseXlsx(file.data);
  }

  throw new Error(`Unsupported file type ".${ext}" (expected .csv or .xlsx)`);
}
