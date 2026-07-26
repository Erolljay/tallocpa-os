import type { RouteTemplate, ServiceType } from "./types.js";

/**
 * The six service route templates, encoded from the Firm Operating Model
 * blueprint. Each step names its owner role and flags review/approval gates.
 * These are the seed data for the route engine — the SOP module later attaches
 * `sopRef` content to individual steps.
 */

export const TAX_COMPLIANCE: RouteTemplate = {
  serviceType: "tax_compliance",
  archetype: "recurring",
  version: 1,
  name: "Tax Compliance (BIR filing)",
  steps: [
    { key: "intake", name: "Data intake — source documents", ownerRole: "preparer" },
    { key: "record", name: "Record / verify books", ownerRole: "preparer" },
    { key: "compute", name: "Compute tax", ownerRole: "preparer" },
    { key: "prepare", name: "Prepare return (eBIRForms/eFPS)", ownerRole: "preparer" },
    { key: "review", name: "Reviewer check", ownerRole: "reviewer", isReviewGate: true },
    { key: "client_approval", name: "Client approval", ownerRole: "client", isReviewGate: true },
    { key: "file", name: "File / submit", ownerRole: "preparer" },
    { key: "pay", name: "Pay if due", ownerRole: "preparer" },
    { key: "capture_proof", name: "Capture filing + payment proof", ownerRole: "preparer" },
    { key: "archive", name: "Archive", ownerRole: "preparer" },
    { key: "notify", name: "Notify client", ownerRole: "preparer" },
  ],
};

export const BOOKKEEPING: RouteTemplate = {
  serviceType: "bookkeeping",
  archetype: "recurring",
  version: 1,
  name: "Bookkeeping (monthly cycle)",
  steps: [
    { key: "intake", name: "Monthly intake (photos + bank statements)", ownerRole: "preparer" },
    { key: "classify", name: "AI classify / extract", ownerRole: "preparer" },
    { key: "review", name: "Reviewer check", ownerRole: "reviewer", isReviewGate: true },
    { key: "post", name: "Post to Manager (taxify batch import)", ownerRole: "preparer" },
    { key: "reconcile", name: "Bank reconciliation", ownerRole: "preparer" },
    { key: "trial_balance", name: "Trial balance", ownerRole: "preparer" },
    { key: "reporting", name: "FS / management report", ownerRole: "preparer" },
    { key: "close", name: "Period close", ownerRole: "reviewer", isReviewGate: true },
    { key: "handoff", name: "Hand off to Tax Compliance", ownerRole: "preparer" },
  ],
};

export const AUDIT: RouteTemplate = {
  serviceType: "audit",
  archetype: "assurance",
  version: 1,
  name: "Audit",
  steps: [
    { key: "acceptance", name: "Acceptance & continuance + independence", ownerRole: "partner", isReviewGate: true },
    { key: "engagement_letter", name: "Engagement letter", ownerRole: "manager" },
    { key: "planning", name: "Planning — risk, materiality", ownerRole: "manager" },
    { key: "controls", name: "Evaluate internal controls", ownerRole: "preparer" },
    { key: "fieldwork", name: "Fieldwork — tests, confirmations, sampling", ownerRole: "preparer" },
    { key: "subsequent_events", name: "Subsequent events", ownerRole: "preparer" },
    { key: "manager_review", name: "Manager review", ownerRole: "manager", isReviewGate: true },
    { key: "eqr", name: "Engagement quality review (where required)", ownerRole: "eqr", isReviewGate: true },
    { key: "partner_signoff", name: "Partner sign-off", ownerRole: "partner", isReviewGate: true },
    { key: "report", name: "Audit report + audited FS", ownerRole: "manager" },
    { key: "issue", name: "Issue to client", ownerRole: "manager" },
    { key: "file_afs", name: "File AFS (BIR/SEC)", ownerRole: "preparer" },
    { key: "assemble", name: "Assemble engagement file (<=60 days)", ownerRole: "manager" },
    { key: "archive", name: "Archive (retain 5+ yrs)", ownerRole: "preparer" },
  ],
};

export const AGREED_UPON_PROCEDURES: RouteTemplate = {
  serviceType: "agreed_upon_procedures",
  archetype: "assurance",
  version: 1,
  name: "Agreed-Upon Procedures",
  steps: [
    { key: "acceptance", name: "Acceptance & continuance + independence", ownerRole: "partner", isReviewGate: true },
    { key: "engagement_letter", name: "Engagement letter — define procedures", ownerRole: "manager" },
    { key: "perform", name: "Perform agreed procedures", ownerRole: "preparer" },
    { key: "document", name: "Document factual findings", ownerRole: "preparer" },
    { key: "manager_review", name: "Manager review", ownerRole: "manager", isReviewGate: true },
    { key: "partner_signoff", name: "Partner sign-off", ownerRole: "partner", isReviewGate: true },
    { key: "report", name: "Report of factual findings", ownerRole: "manager" },
    { key: "issue", name: "Issue", ownerRole: "manager" },
    { key: "archive", name: "Archive", ownerRole: "preparer" },
  ],
};

export const BUSINESS_PROCESSING: RouteTemplate = {
  serviceType: "business_processing",
  archetype: "project",
  version: 1,
  name: "Business Processing (registration/renewal)",
  steps: [
    { key: "requirements", name: "Intake requirements", ownerRole: "preparer" },
    { key: "prepare_docs", name: "Prepare documents", ownerRole: "preparer" },
    { key: "register_entity", name: "SEC / DTI registration", ownerRole: "preparer" },
    { key: "bir_registration", name: "BIR registration (COR/2303, books, invoicing)", ownerRole: "preparer" },
    { key: "lgu_permit", name: "LGU — barangay + mayor's permit", ownerRole: "preparer" },
    { key: "employer_reg", name: "Employer reg (SSS/PhilHealth/Pag-IBIG)", ownerRole: "preparer" },
    { key: "capture", name: "Capture certificates", ownerRole: "preparer" },
    { key: "handover", name: "Handover to client", ownerRole: "manager", isReviewGate: true },
  ],
};

export const SYSTEMS_IMPLEMENTATION: RouteTemplate = {
  serviceType: "systems_implementation",
  archetype: "project",
  version: 1,
  name: "Accounting Systems Implementation",
  steps: [
    { key: "scoping", name: "Scoping / requirements", ownerRole: "manager" },
    { key: "coa", name: "Chart of accounts design", ownerRole: "preparer" },
    { key: "setup", name: "Manager.io setup", ownerRole: "preparer" },
    { key: "migration", name: "Opening balances / migration", ownerRole: "preparer" },
    { key: "recon", name: "Migration reconciliation", ownerRole: "reviewer", isReviewGate: true },
    { key: "configure", name: "Configure tax codes, ATC, payslip items", ownerRole: "preparer" },
    { key: "training", name: "User training", ownerRole: "preparer" },
    { key: "parallel", name: "Parallel run", ownerRole: "preparer" },
    { key: "handover", name: "Handover + documentation", ownerRole: "manager", isReviewGate: true },
    { key: "support", name: "Post-implementation support", ownerRole: "preparer" },
  ],
};

export const ROUTE_TEMPLATES: Record<ServiceType, RouteTemplate> = {
  tax_compliance: TAX_COMPLIANCE,
  bookkeeping: BOOKKEEPING,
  audit: AUDIT,
  agreed_upon_procedures: AGREED_UPON_PROCEDURES,
  business_processing: BUSINESS_PROCESSING,
  systems_implementation: SYSTEMS_IMPLEMENTATION,
};

export function templateFor(service: ServiceType): RouteTemplate {
  return ROUTE_TEMPLATES[service];
}
