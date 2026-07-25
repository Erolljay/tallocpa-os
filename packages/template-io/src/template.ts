import { CANONICAL_HEADER_ORDER } from "@tallocpa/template-parser";
import { buildXlsx } from "./xlsx.js";

/** Two worked example rows so clients see the expected shape (and both reconcile). */
export const TEMPLATE_EXAMPLE_ROWS: Record<string, string>[] = [
  {
    Date: "2026-07-15",
    "Supplier Name": "Mercury Drug",
    TIN: "123-456-789-000",
    "OR Number": "OR-004512",
    Description: "First-aid supplies",
    "Gross Amount": "112.00",
    "VAT Amount": "12.00",
    "VAT Class": "Vatable",
    Category: "Office Supplies",
  },
  {
    Date: "2026-07-16",
    "Supplier Name": "Meralco",
    TIN: "000-123-456-000",
    "OR Number": "SOA-778812",
    Description: "July electricity",
    "Gross Amount": "5,600.00",
    "VAT Amount": "600.00",
    "VAT Class": "Vatable",
    Category: "Utilities",
  },
];

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The blank client template as CSV text (CRLF line endings for Excel). */
export function buildTemplateCsv(includeExamples = true): string {
  const rows = includeExamples ? TEMPLATE_EXAMPLE_ROWS : [];
  const lines = [CANONICAL_HEADER_ORDER.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(CANONICAL_HEADER_ORDER.map((h) => csvCell(row[h] ?? "")).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** The blank client template as an XLSX workbook. */
export function buildTemplateXlsx(includeExamples = true): Promise<Buffer> {
  return buildXlsx(
    CANONICAL_HEADER_ORDER,
    includeExamples ? TEMPLATE_EXAMPLE_ROWS : [],
  );
}
