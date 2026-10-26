import type { InvoiceParseResult, Recommendation } from "./types.js";

/** Below this the extraction is too shaky to clear unseen. */
export const APPROVE_MIN_CONFIDENCE = 0.85;

/**
 * Suggest what to do with an extracted document. Deterministic over the parse
 * result, so the same document always gets the same suggestion. n8n's
 * auto-clear rule and the portal's guard both rely on "approve" meaning:
 *
 *   reject  — unreadable, or not_valid (not a BIR invoice/OR, no valid issuer)
 *   approve — nothing flagged, ≥85% confident, filed under sales/purchases/expenses
 *   review  — everything else
 */
export function recommend(result: InvoiceParseResult): Recommendation {
  if (result.status === "unreadable") {
    return { recommendation: "reject", reasons: ["document is unreadable"] };
  }
  if (result.taxValidity === "not_valid") {
    const why = result.flags.filter((f) => f.startsWith("not a BIR"));
    return {
      recommendation: "reject",
      reasons: why.length > 0 ? why : ["no valid issuer TIN or name"],
    };
  }

  const reasons = [...result.flags];
  if (result.confidence < APPROVE_MIN_CONFIDENCE) {
    reasons.push(`low AI confidence (${Math.round(result.confidence * 100)}%)`);
  }
  if (!["sales", "purchases", "expenses"].includes(result.draft.ledger)) {
    reasons.push("category unclear");
  }

  return reasons.length === 0
    ? { recommendation: "approve", reasons: ["all checks passed"] }
    : { recommendation: "review", reasons };
}
