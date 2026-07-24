/**
 * Philippine Taxpayer Identification Number (TIN).
 *
 * Shape: a 9-digit base, optionally followed by a branch code.
 *   - 9 digits            head office, no branch code printed
 *   - 12 digits (base+3)  legacy 3-digit branch code (e.g. 000)
 *   - 14 digits (base+5)  current 5-digit branch code (e.g. 00000)
 *
 * We normalize by stripping separators, then validate the digit count.
 */

const VALID_LENGTHS = new Set([9, 12, 14]);

/** Strip everything that isn't a digit. */
export function normalizeTin(input: string | null | undefined): string {
  return (input ?? "").replace(/\D/g, "");
}

/** True when the input normalizes to a plausible TIN. */
export function isValidTin(input: string | null | undefined): boolean {
  const digits = normalizeTin(input);
  if (!VALID_LENGTHS.has(digits.length)) return false;
  if (/^0+$/.test(digits)) return false; // all-zeros is never a real TIN
  return true;
}

/**
 * Format a TIN as `NNN-NNN-NNN` with an appended branch code when present.
 * Unrecognized input is returned unchanged so we never fabricate a TIN.
 */
export function formatTin(input: string | null | undefined): string {
  const digits = normalizeTin(input);
  if (!VALID_LENGTHS.has(digits.length)) return input ?? "";
  const base = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
  const branch = digits.slice(9);
  return branch ? `${base}-${branch}` : base;
}
