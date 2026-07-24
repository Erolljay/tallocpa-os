import type { Centavos } from "./money.js";
import { isCentavos } from "./money.js";

/** Philippine VAT rate (12%). */
export const PH_VAT_RATE = 0.12;

export type VatClass = "vatable" | "vat_exempt" | "zero_rated";

/**
 * VAT breakdown of a **VAT-inclusive** gross amount — the common case on a
 * Philippine official receipt, where the printed total already contains VAT.
 *
 *   gross (VAT-inclusive)
 *   ├── net = round(gross * 100 / 112)   VAT-exclusive base
 *   └── vat = gross - net                the 12% component
 *
 * Deriving vat as `gross - net` (rather than rounding vat independently)
 * guarantees `net + vat === gross` exactly, with no stray centavo.
 */
export interface VatBreakdown {
  gross: Centavos;
  net: Centavos;
  vat: Centavos;
  vatClass: VatClass;
}

function assertNonNegInt(name: string, value: number): void {
  if (!isCentavos(value) || value < 0) {
    throw new RangeError(
      `${name} must be a non-negative integer centavo amount, got ${value}`,
    );
  }
}

/** Split a VAT-inclusive gross into net + vat. Exempt/zero-rated carry no VAT. */
export function breakdownFromInclusiveGross(
  gross: Centavos,
  vatClass: VatClass = "vatable",
): VatBreakdown {
  assertNonNegInt("gross", gross);
  if (vatClass !== "vatable") {
    return { gross, net: gross, vat: 0, vatClass };
  }
  const net = Math.round((gross * 100) / 112);
  return { gross, net, vat: gross - net, vatClass };
}

/** Build a breakdown from a VAT-exclusive net (adds 12% on top). */
export function breakdownFromExclusiveNet(
  net: Centavos,
  vatClass: VatClass = "vatable",
): VatBreakdown {
  assertNonNegInt("net", net);
  if (vatClass !== "vatable") {
    return { gross: net, net, vat: 0, vatClass };
  }
  const vat = Math.round((net * 12) / 100);
  return { gross: net + vat, net, vat, vatClass };
}

export interface VatReconciliation {
  ok: boolean;
  expectedVat: Centavos;
  providedVat: Centavos;
  /** providedVat - expectedVat */
  diff: Centavos;
  toleranceCentavos: Centavos;
  reason?: string;
}

/**
 * Sanity-check a VAT figure supplied by a client, template row, or the AI
 * extractor against the VAT implied by the gross (treated as VAT-inclusive).
 * Catches wrong amounts and mislabeled VAT before anything reaches the books.
 */
export function reconcileVat(params: {
  gross: Centavos;
  providedVat: Centavos;
  vatClass?: VatClass;
  toleranceCentavos?: Centavos;
}): VatReconciliation {
  const {
    gross,
    providedVat,
    vatClass = "vatable",
    toleranceCentavos = 1,
  } = params;
  assertNonNegInt("providedVat", providedVat);
  const expectedVat = breakdownFromInclusiveGross(gross, vatClass).vat;
  const diff = providedVat - expectedVat;
  const ok = Math.abs(diff) <= toleranceCentavos;
  return {
    ok,
    expectedVat,
    providedVat,
    diff,
    toleranceCentavos,
    reason: ok
      ? undefined
      : `VAT ${providedVat} does not reconcile with expected ${expectedVat} for gross ${gross} (${vatClass}); diff ${diff}`,
  };
}
