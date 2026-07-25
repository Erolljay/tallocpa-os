/**
 * Canonical template columns and their accepted header aliases. Clients rename
 * headers, add spaces, change case; we match on a normalized form so a column
 * called "Vendor" or "Supplier Name" both map to `supplierName`.
 */
export const COLUMN_ALIASES = {
  date: ["date", "txn date", "transaction date", "or date", "invoice date"],
  supplierName: [
    "supplier",
    "supplier name",
    "vendor",
    "payee",
    "name",
    "supplier customer",
  ],
  tin: ["tin"],
  orNumber: [
    "or number",
    "or no",
    "invoice no",
    "invoice number",
    "reference",
    "or invoice no",
  ],
  description: ["description", "particulars", "details"],
  gross: ["gross", "amount", "total", "gross amount"],
  vat: ["vat", "vat amount", "input vat"],
  category: ["category", "account", "expense type", "account title"],
  vatClass: ["vat class", "vat type", "vat status"],
} as const;

/** Lowercase, collapse non-alphanumerics to single spaces, trim. */
export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Read one canonical field from a row keyed by raw header names. Returns the
 * first alias that is present, or undefined if the column is absent.
 */
export function getField(
  row: Record<string, string>,
  aliases: readonly string[],
): string | undefined {
  const byNorm = new Map<string, string>();
  for (const rawKey of Object.keys(row)) {
    byNorm.set(normalizeHeader(rawKey), row[rawKey] ?? "");
  }
  for (const alias of aliases) {
    const value = byNorm.get(normalizeHeader(alias));
    if (value !== undefined) return value;
  }
  return undefined;
}
