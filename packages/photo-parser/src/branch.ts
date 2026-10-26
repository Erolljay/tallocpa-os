import { normalizeTin } from "@tallocpa/validation";

/**
 * Resolve the BIR **branch code** for an invoice.
 *
 * On a Philippine TIN the branch code is the tail after the 9-digit base:
 *   - 12 digits -> 3-digit legacy branch code (e.g. `000`)
 *   - 14 digits -> 5-digit current branch code (e.g. `00000`)
 * `000` / `00000` denote the Head Office.
 *
 * We trust the TIN's own branch digits first (they're the authoritative source),
 * and fall back to a separately-printed branch code only when the TIN carries
 * none. Returns `null` when neither is present — the caller renders that as
 * "Head Office".
 */
export function resolveBranch(
  tin: string | null | undefined,
  printedBranchCode: string | null | undefined,
): string | null {
  const digits = normalizeTin(tin);
  if (digits.length === 12 || digits.length === 14) {
    return digits.slice(9);
  }
  const printed = (printedBranchCode ?? "").trim();
  return printed.length > 0 ? printed : null;
}

/** True when a branch code denotes the Head Office (all zeros or absent). */
export function isHeadOffice(branch: string | null): boolean {
  return branch === null || /^0+$/.test(branch);
}
