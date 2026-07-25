import Papa from "papaparse";

/**
 * Decode CSV text into header-keyed rows. Uses PapaParse (battle-tested against
 * quoting, embedded commas, and newlines) so we never hand-roll CSV parsing.
 * Empty lines are skipped; every value is returned as a trimmed string.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });
  return result.data.filter((row) =>
    Object.values(row).some((v) => (v ?? "").toString().trim() !== ""),
  );
}
