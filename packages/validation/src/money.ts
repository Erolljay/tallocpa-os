/**
 * Money is represented as an integer number of **centavos** (1 peso = 100
 * centavos) everywhere in the OS. Accounting math on floating-point pesos
 * accumulates rounding error (0.1 + 0.2 !== 0.3); integer centavos are exact.
 * Convert to pesos only at the display edge.
 */
export type Centavos = number;

/** True when `n` is a safe integer centavo amount. */
export function isCentavos(n: unknown): n is Centavos {
  return typeof n === "number" && Number.isSafeInteger(n);
}

/** Convert a peso amount (possibly with decimals) to integer centavos. */
export function pesosToCentavos(pesos: number): Centavos {
  return Math.round(pesos * 100);
}

/** Convert integer centavos back to a peso number (display edge only). */
export function centavosToPesos(c: Centavos): number {
  return c / 100;
}

/** Format centavos as a Philippine peso string, e.g. `₱1,234.50`. */
export function formatPeso(c: Centavos): string {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  const pesos = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}₱${pesos.toLocaleString("en-PH")}.${cents
    .toString()
    .padStart(2, "0")}`;
}
