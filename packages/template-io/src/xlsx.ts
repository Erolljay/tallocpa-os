import ExcelJS from "exceljs";

/** Copy any binary input into a plain ArrayBuffer (what exceljs' loader wants). */
function toArrayBuffer(data: ArrayBuffer | Buffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const out = new ArrayBuffer(data.byteLength);
  new Uint8Array(out).set(data);
  return out;
}

/** Read a cell as a trimmed display string (dates → ISO, numbers → plain). */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    // rich text / formula result / hyperlink objects
    const anyVal = value as { text?: string; result?: unknown };
    if (typeof anyVal.text === "string") return anyVal.text.trim();
    if (anyVal.result != null) return String(anyVal.result).trim();
    return "";
  }
  return String(value).trim();
}

/**
 * Decode the first worksheet of an XLSX workbook into header-keyed rows.
 * Row 1 is treated as the header. Fully-empty rows are skipped.
 */
export async function parseXlsx(
  data: ArrayBuffer | Buffer,
): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toArrayBuffer(data));

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  const headerRow = sheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = cellText(cell.value);
  });

  const rows: Record<string, string>[] = [];
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, i) => {
      if (!header) return;
      const text = cellText(row.getCell(i + 1).value);
      record[header] = text;
      if (text !== "") hasValue = true;
    });
    if (hasValue) rows.push(record);
  }
  return rows;
}

/** Build an XLSX workbook from header-keyed rows (used by the template + tests). */
export async function buildXlsx(
  headers: readonly string[],
  rows: Record<string, string>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Intake");
  sheet.addRow([...headers]);
  for (const row of rows) {
    sheet.addRow(headers.map((h) => row[h] ?? ""));
  }
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
