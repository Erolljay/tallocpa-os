import { ROUTE_TEMPLATES, type ServiceType } from "@tallocpa/routes";
import type { Sop, SopCoverageRow } from "./types.js";

/** SOP key for a route step. */
export function sopKey(serviceType: ServiceType, stepKey: string): string {
  return `${serviceType}.${stepKey}`;
}

function sop(
  serviceType: ServiceType,
  stepKey: string,
  title: string,
  purpose: string,
  procedure: string[],
  checklist: string[],
): Sop {
  return {
    key: sopKey(serviceType, stepKey),
    serviceType,
    stepKey,
    title,
    purpose,
    procedure,
    checklist,
    version: 1,
  };
}

/**
 * Starter SOPs for the two recurring services (Bookkeeping, Tax Compliance) —
 * the near-term build. The assurance and project services are surfaced as gaps
 * by `sopCoverage()` for the firm to author. These are editable/versioned once
 * loaded into the database.
 */
export const SEED_SOPS: Sop[] = [
  // ---- Bookkeeping ----
  sop("bookkeeping", "intake", "Monthly source-document intake",
    "Collect the month's receipts, invoices, and bank statements before recording.",
    ["Confirm the accounting period.",
     "Check the client submitted via the Telegram bot or the template.",
     "Chase missing items against the intake checklist derived from the client's tax types.",
     "Log what was received versus what is still outstanding."],
    ["All bank statements for the period received",
     "Source documents received or missing items flagged",
     "Client notified of anything outstanding"]),
  sop("bookkeeping", "classify", "Classify and extract transactions",
    "Turn source documents into draft transactions ready for review.",
    ["Run AI extraction on photos; parse template rows.",
     "Ensure each item has date, party, gross, VAT, and an account.",
     "Set the transaction type (purchase or sales)."],
    ["Every item has the required fields",
     "VAT reconciles on each vatable item",
     "Type set on every item"]),
  sop("bookkeeping", "review", "Reviewer check before posting",
    "Catch extraction and classification errors before anything hits the books.",
    ["Review each item with the image beside the extracted fields.",
     "Verify amounts and VAT; scrutinize low-confidence items.",
     "Confirm the chart-of-accounts mapping."],
    ["All items reviewed", "Corrections logged", "Correction rate within target (<15%)"]),
  sop("bookkeeping", "post", "Post to Manager",
    "Record the reviewed transactions to the client's books.",
    ["Approve items into staging.",
     "Produce the taxify Batch Import file (Purchase/Sales).",
     "Hand to taxify to validate against Manager and post."],
    ["All approved items posted", "No duplicates", "Batch total reconciles"]),
  sop("bookkeeping", "reconcile", "Bank reconciliation",
    "Agree the book cash balance to the bank.",
    ["Import the bank statement and match transactions.",
     "Investigate and resolve differences.",
     "Record any adjusting entries."],
    ["Ending balance agrees to the bank", "Unmatched items resolved or documented"]),
  sop("bookkeeping", "trial_balance", "Trial balance",
    "Confirm the ledger balances and scan for anomalies.",
    ["Generate the trial balance from Manager.",
     "Verify debits equal credits.",
     "Scan for unusual balances and explain them."],
    ["Trial balance balances", "Anomalies explained"]),
  sop("bookkeeping", "reporting", "Financial and management reporting",
    "Produce the financial statements and a management summary.",
    ["Generate the FS from Manager.",
     "Prepare a short management summary.",
     "Note items needing the client's attention."],
    ["FS generated", "Management report drafted"]),
  sop("bookkeeping", "close", "Period close",
    "Lock the period after reviewer sign-off.",
    ["Confirm all prior steps are done.",
     "Reviewer signs off on the close.",
     "Set the Manager lock date for the period."],
    ["Reconciliation signed off", "Reviewer approved", "Period locked in Manager"]),
  sop("bookkeeping", "handoff", "Hand off to Tax Compliance",
    "Pass the closed books to the filing workflow.",
    ["Confirm the books are final for the period.",
     "Notify the tax preparer and link the tax job."],
    ["Books final", "Tax compliance job linked"]),

  // ---- Tax Compliance ----
  sop("tax_compliance", "intake", "Filing data intake",
    "Gather the data and documents needed for the return.",
    ["Identify the return and period from the client's tax-type calendar.",
     "Pull the closed books (if bundled) or request the data.",
     "Confirm supporting schedules (SLSP, alphalist) where needed."],
    ["All data for the return on hand", "Supporting schedules available"]),
  sop("tax_compliance", "record", "Record / verify books",
    "Ensure the books underlying the return are complete and correct.",
    ["Verify the period's transactions are recorded.",
     "Check VAT/withholding accounts tie out."],
    ["Books verified for the period"]),
  sop("tax_compliance", "compute", "Compute tax",
    "Compute the tax due per the applicable BIR rules.",
    ["Apply the correct rates and base for the return type.",
     "Cross-check against prior periods for reasonableness."],
    ["Tax computed", "Sanity-checked vs prior period"]),
  sop("tax_compliance", "prepare", "Prepare the return",
    "Prepare the BIR return in eBIRForms or eFPS.",
    ["Encode the return with the computed figures.",
     "Attach required schedules."],
    ["Return prepared", "Schedules attached"]),
  sop("tax_compliance", "review", "Reviewer check before filing",
    "Independent check that the return is correct before submission.",
    ["Recompute key figures.",
     "Verify the correct form, period, and TIN/RDO."],
    ["Figures verified", "Form/period/TIN correct"]),
  sop("tax_compliance", "client_approval", "Client approval",
    "Obtain the client's go-ahead before filing.",
    ["Send the draft return and tax due to the client.",
     "Record their approval."],
    ["Client approved", "Approval recorded"]),
  sop("tax_compliance", "file", "File / submit",
    "Submit the return to the BIR.",
    ["File via eFPS/eBIRForms.",
     "Confirm acceptance."],
    ["Return filed", "Acceptance confirmed"]),
  sop("tax_compliance", "pay", "Pay tax due",
    "Settle the tax due, if any.",
    ["Pay via the client's chosen channel (eFPS/bank/GCash).",
     "Confirm the payment posted."],
    ["Tax paid", "Payment confirmed"]),
  sop("tax_compliance", "capture_proof", "Capture filing + payment proof",
    "Retain evidence of filing and payment.",
    ["Save the filing confirmation and payment proof to the client's records."],
    ["Filing confirmation saved", "Payment proof saved"]),
  sop("tax_compliance", "archive", "Archive the filing",
    "Archive the return and supporting records per retention rules.",
    ["File the return, schedules, and proofs in the client's records."],
    ["Filing archived"]),
  sop("tax_compliance", "notify", "Notify client",
    "Confirm completion to the client.",
    ["Send the client confirmation that the return is filed and paid."],
    ["Client notified"]),
];

const BY_KEY: Map<string, Sop> = new Map(SEED_SOPS.map((s) => [s.key, s]));

/** Resolve the seed SOP for a route step, if one exists. */
export function sopForStep(
  serviceType: ServiceType,
  stepKey: string,
): Sop | undefined {
  return BY_KEY.get(sopKey(serviceType, stepKey));
}

/** All seed SOPs for a service, in route-step order. */
export function sopsForService(serviceType: ServiceType): Sop[] {
  const order = new Map(
    ROUTE_TEMPLATES[serviceType].steps.map((s, i) => [s.key, i]),
  );
  return SEED_SOPS.filter((s) => s.serviceType === serviceType).sort(
    (a, b) => (order.get(a.stepKey) ?? 0) - (order.get(b.stepKey) ?? 0),
  );
}

/**
 * Coverage report across every route step of every service — which steps have
 * an SOP and which still need one authored. This is the firm's SOP gap list.
 */
export function sopCoverage(): SopCoverageRow[] {
  const rows: SopCoverageRow[] = [];
  for (const template of Object.values(ROUTE_TEMPLATES)) {
    for (const step of template.steps) {
      rows.push({
        serviceType: template.serviceType,
        stepKey: step.key,
        stepName: step.name,
        hasSop: BY_KEY.has(sopKey(template.serviceType, step.key)),
      });
    }
  }
  return rows;
}

/** Summary counts for the coverage report. */
export function sopCoverageSummary(): { covered: number; total: number } {
  const rows = sopCoverage();
  return { covered: rows.filter((r) => r.hasSop).length, total: rows.length };
}
