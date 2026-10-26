import {
  breakdownFromExclusiveNet,
  breakdownFromInclusiveGross,
  formatPeso,
  formatTin,
  isValidTin,
  normalizeTin,
  pesosToCentavos,
} from "@tallocpa/validation";
import type { Centavos, Ledger, TaxValidity } from "@tallocpa/domain";
import { resolveBranch } from "./branch.js";
import type {
  ClientContext,
  InvoiceDraft,
  InvoiceParseResult,
  RawInvoiceExtraction,
} from "./types.js";

/** Rounding slack between printed figures (₱1), in centavos. */
export const AMOUNT_TOLERANCE: Centavos = 100;

/** Clamp any number into 0..1; non-finite input becomes 0. */
function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Peso number (or null) -> integer centavos (or null). Ignores non-finite / negative. */
function toCentavos(pesos: number | null | undefined): Centavos | null {
  if (pesos == null || !Number.isFinite(pesos) || pesos < 0) return null;
  return pesosToCentavos(pesos);
}

/** Trimmed string, or null when blank. */
function clean(v: string | null | undefined): string | null {
  return v && v.trim() !== "" ? v.trim() : null;
}

/** Same taxpayer: equal 9-digit TIN base (branch digits ignored). */
function sameTaxpayer(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const base = normalizeTin(a).slice(0, 9);
  return base.length === 9 && base === normalizeTin(b).slice(0, 9);
}

/**
 * The AI's ledger guess, overridden deterministically when the TINs settle it:
 * a document issued under the client's own TIN is always the client's sale.
 */
function resolveLedger(raw: RawInvoiceExtraction, client?: ClientContext): Ledger {
  if (client && sameTaxpayer(raw.sellerTin, client.tin)) return "sales";
  return raw.ledger;
}

interface Amounts {
  gross: Centavos | null;
  vatable: Centavos | null;
  vatExempt: Centavos | null;
  zeroRated: Centavos | null;
  vat: Centavos | null;
}

/**
 * Read the printed amounts and CHECK them (VAT = 12% of VATable; the lines add
 * up to the total). Nothing printed is overwritten. Only when a VAT-registered
 * seller prints a total with no breakdown at all is the split derived — in
 * deterministic code, never by the AI — and noted as such.
 */
function readAmounts(
  raw: RawInvoiceExtraction,
  flags: string[],
  notes: string[],
): Amounts {
  const a: Amounts = {
    gross: toCentavos(raw.amountVatInclusivePesos),
    vatable: toCentavos(raw.vatablePesos),
    vatExempt: toCentavos(raw.vatExemptPesos),
    zeroRated: toCentavos(raw.zeroRatedPesos),
    vat: toCentavos(raw.vatPesos),
  };
  const hasBreakdown =
    a.vatable != null || a.vatExempt != null || a.zeroRated != null || a.vat != null;

  if (!hasBreakdown) {
    if (a.gross == null) return a;
    if (raw.sellerVatRegistered === true) {
      const bd = breakdownFromInclusiveGross(a.gross, "vatable");
      notes.push("VAT split derived from the total (no breakdown printed)");
      return { ...a, vatable: bd.net, vat: bd.vat };
    }
    if (raw.sellerVatRegistered === false) return { ...a, vat: 0 };
    flags.push("no VAT breakdown printed and seller VAT status unknown");
    return a;
  }

  if (a.vatable != null && a.vatable > 0) {
    if (a.vat == null) {
      flags.push("missing VAT amount");
    } else {
      const expected = breakdownFromExclusiveNet(a.vatable, "vatable").vat;
      if (Math.abs(a.vat - expected) > AMOUNT_TOLERANCE) {
        flags.push(
          `VAT does not compute (12% of ${formatPeso(a.vatable)} = ${formatPeso(expected)}, printed ${formatPeso(a.vat)})`,
        );
      }
    }
  }

  const sum = (a.vatable ?? 0) + (a.vat ?? 0) + (a.vatExempt ?? 0) + (a.zeroRated ?? 0);
  if (a.gross == null) {
    notes.push("total not printed; taken as the sum of the lines");
    return { ...a, gross: sum };
  }
  if (Math.abs(a.gross - sum) > AMOUNT_TOLERANCE) {
    flags.push(`amounts don't add up (lines ${formatPeso(sum)}, total ${formatPeso(a.gross)})`);
  }
  return a;
}

/** Inputs to the tax-validity rule, kept explicit so the rule is easy to test. */
export interface ValidityInput {
  isBirDocument: boolean;
  sellerTin: string | null;
  sellerName: string | null;
  sellerVatRegistered: boolean | null;
  ledger: Ledger;
  date: string | null;
  orNumber: string | null;
  docTypeKnown: boolean;
  counterpartyAddress: string | null;
  vat: Centavos | null;
  amountFlags: number;
}

/**
 * CLAUDE.md step 2 tag, decided by rules over printed facts (not by the AI):
 *  - not_valid        not a BIR invoice/OR, or no valid issuer TIN / name
 *  - valid_vat_and_it VAT-registered issuer, complete EOPT invoice, VAT computes
 *  - valid_it_only    everything else that is a real BIR document
 */
export function taxValidity(v: ValidityInput): TaxValidity {
  if (!v.isBirDocument || !isValidTin(v.sellerTin) || !v.sellerName) return "not_valid";
  const isSale = v.ledger === "sales";
  const complete =
    !!v.date && !!v.orNumber && v.docTypeKnown && (isSale || !!v.counterpartyAddress);
  const vatOk = v.sellerVatRegistered === true && (v.vat ?? 0) > 0 && v.amountFlags === 0;
  return complete && vatOk ? "valid_vat_and_it" : "valid_it_only";
}

/**
 * Map one raw AI extraction into a reviewable {@link InvoiceParseResult}.
 *
 * Deterministic core of the AI lanes. Printed amounts are kept and checked;
 * failed checks become `flags` (the item is routed to "flagged"), informational
 * remarks become `notes`. Nothing is dropped.
 *
 * Pass `client` (the books the document is uploaded into) so a document issued
 * under the client's own TIN is classified as a sale regardless of the AI.
 */
export function mapExtraction(
  raw: RawInvoiceExtraction,
  client?: ClientContext,
): InvoiceParseResult {
  const flags: string[] = [];
  const notes: string[] = [];
  const amounts = readAmounts(raw, flags, notes);
  const amountFlags = flags.length;

  const tinValid = isValidTin(raw.tin);
  if (raw.tin && !tinValid) flags.push("TIN format invalid");
  const ledger = resolveLedger(raw, client);
  if (ledger !== raw.ledger) notes.push("classified as sales: issued under the client's TIN");

  const draft: InvoiceDraft = {
    date: clean(raw.date),
    supplierName: clean(raw.supplierName),
    tin: raw.tin ? (tinValid ? formatTin(raw.tin) : raw.tin.trim()) : null,
    branch: resolveBranch(raw.tin, raw.branchCode),
    address: clean(raw.counterpartyAddress),
    ledger,
    vatClass: raw.vatType,
    docType: raw.docType,
    orNumber: clean(raw.orNumber),
    ...amounts,
    net: amounts.gross != null ? amounts.gross - (amounts.vat ?? 0) : null,
    wht: toCentavos(raw.whtPesos),
    atc: clean(raw.atc),
  };

  // On the client's own sale the buyer's TIN/address are often legitimately
  // blank (walk-in customers); on a purchase they back the input-VAT claim.
  const counterpartyRequired = ledger !== "sales";
  if (!draft.date) flags.push("missing date");
  if (!draft.orNumber) flags.push("missing invoice/OR number");
  if (!draft.supplierName) flags.push("missing counterparty name");
  if (!draft.tin && counterpartyRequired) flags.push("missing TIN");
  if (!draft.address && counterpartyRequired) flags.push("missing address");
  if (draft.gross == null) flags.push("missing amount");
  if (draft.wht != null && draft.wht > 0 && !draft.atc) flags.push("withholding without ATC");
  if (!raw.isBirDocument) {
    const what = clean(raw.nonBirReason);
    flags.push(`not a BIR invoice/receipt${what ? ` (${what})` : ""}`);
  }

  const validity = taxValidity({
    isBirDocument: raw.isBirDocument,
    sellerTin: raw.sellerTin ?? raw.tin,
    sellerName: ledger === "sales" ? (client?.name ?? draft.supplierName) : draft.supplierName,
    sellerVatRegistered: raw.sellerVatRegistered,
    ledger,
    date: draft.date,
    orNumber: draft.orNumber,
    docTypeKnown: draft.docType !== "unknown",
    counterpartyAddress: draft.address,
    vat: draft.vat,
    amountFlags,
  });

  // "Unreadable" only when the model got essentially nothing usable.
  const nothingUsable = !draft.date && !draft.supplierName && draft.gross == null;

  return {
    draft,
    confidence: clampConfidence(raw.confidence),
    status: nothingUsable ? "unreadable" : flags.length > 0 ? "flagged" : "needs_review",
    taxValidity: validity,
    birValid: validity === "valid_vat_and_it",
    tinValid,
    isBirDocument: raw.isBirDocument,
    flags,
    notes,
  };
}
