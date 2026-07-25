import type { VatClass } from "@tallocpa/validation";

export interface Coerced<T> {
  value: T | null;
  ok: boolean;
}

/**
 * Parse a human-typed money string into integer centavos.
 * Handles `₱`, `PHP`, `$`, thousands commas, surrounding spaces, a leading
 * minus, and accountant parentheses for negatives: `(500)` → -50000.
 */
export function parseMoneyToCentavos(
  raw: string | null | undefined,
): Coerced<number> {
  if (raw == null) return { value: null, ok: false };
  let s = String(raw).trim();
  if (s === "") return { value: null, ok: false };

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s
    .replace(/php/gi, "")
    .replace(/[₱$]/g, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return { value: null, ok: false };

  const pesos = Number(s);
  if (Number.isNaN(pesos)) return { value: null, ok: false };
  const centavos = Math.round(pesos * 100) * (negative ? -1 : 1);
  return { value: centavos, ok: true };
}

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const YMD_SLASH = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
const DMY_SLASH = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

function toRealIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  // Reject rollover (e.g. 2026-02-31 → March 3) by round-tripping.
  if (new Date(time).toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

/**
 * Parse a date into ISO `YYYY-MM-DD`. Accepts ISO, `YYYY/MM/DD`, and
 * `MM/DD/YYYY`. Ambiguous numeric dates are read as MM/DD (BIR form convention);
 * if the first number can't be a month but the second can, we swap to DD/MM.
 * Anything unrecognized returns `ok: false` so the row is flagged, never guessed.
 */
export function parseDateToIso(
  raw: string | null | undefined,
): Coerced<string> {
  if (raw == null) return { value: null, ok: false };
  const s = String(raw).trim();
  if (s === "") return { value: null, ok: false };

  let m = ISO.exec(s) ?? YMD_SLASH.exec(s);
  if (m) {
    const iso = toRealIso(Number(m[1]), Number(m[2]), Number(m[3]));
    return iso ? { value: iso, ok: true } : { value: null, ok: false };
  }
  m = DMY_SLASH.exec(s);
  if (m) {
    let month = Number(m[1]);
    let day = Number(m[2]);
    const year = Number(m[3]);
    if (month > 12 && day <= 12) [month, day] = [day, month];
    const iso = toRealIso(year, month, day);
    return iso ? { value: iso, ok: true } : { value: null, ok: false };
  }
  return { value: null, ok: false };
}

/** Interpret a free-text VAT class; defaults to vatable. */
export function parseVatClass(raw: string | null | undefined): VatClass {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("exempt")) return "vat_exempt";
  if (s.includes("zero")) return "zero_rated";
  return "vatable";
}
