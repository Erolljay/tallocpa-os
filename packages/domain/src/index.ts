/**
 * Canonical entity types for TalloCPA OS.
 *
 * These are deliberately forward-compatible with the full design: the intake
 * wedge only writes a subset today, but the shapes already carry the fields the
 * routing spine, review queue, and Manager.io export will need — so no schema
 * migration is required when those land. Money is always integer centavos.
 */

export type Centavos = number;
export type Uuid = string;
export type IsoDate = string; // YYYY-MM-DD
export type IsoTimestamp = string; // RFC 3339

// ---------------------------------------------------------------------------
// Enums (mirror the Postgres enum types in supabase/migrations)
// ---------------------------------------------------------------------------

export type IntakeSource = "photo" | "template" | "manual" | "portal";

/** Which book a source document belongs to (drives the n8n tax roll-ups). */
export type Ledger = "sales" | "purchases" | "payroll" | "expenses" | "other";

/** What the AI suggests the reviewer do with an item. Staff always decide. */
export type AiRecommendation = "approve" | "review" | "reject";

export type DocType = "official_receipt" | "sales_invoice" | "unknown";

export type VatClass = "vatable" | "vat_exempt" | "zero_rated";

/**
 * Lifecycle of an intake item (CLAUDE.md: needs_review = "in_review",
 * approved = "cleared").
 *
 *   uploaded ──▶ needs_review | flagged ──▶ approved ──▶ posted
 *      │                │      │
 *      ▼                │      ├──▶ held (later month, same taxable year)
 *   extract_failed      └──────┴──▶ rejected
 *   / unreadable
 */
export type ReviewStatus =
  | "received"
  | "uploaded"
  | "extract_failed"
  | "unreadable"
  | "needs_review"
  | "flagged"
  | "held"
  | "approved"
  | "posted"
  | "rejected"
  | "exported";

/** Tax validity of a source document (CLAUDE.md step 2). */
export type TaxValidity = "valid_vat_and_it" | "valid_it_only" | "not_valid";

/** Staff role — approval limits and acting-manager live here (governance layer). */
export type StaffRole = "owner" | "manager" | "reviewer" | "staff";

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface Client {
  id: Uuid;
  name: string;
  tin: string | null;
  createdAt: IsoTimestamp;
}

/** Binds a Telegram chat to a client so the bot knows whose books a photo hits. */
export interface TelegramBinding {
  id: Uuid;
  clientId: Uuid;
  chatId: string;
  boundAt: IsoTimestamp | null;
  active: boolean;
}

/** Raw inbound work, written by the webhook and drained by the worker (queue). */
export interface IntakeInboxRow {
  id: Uuid;
  source: IntakeSource;
  clientId: Uuid | null;
  telegramUpdateId: string | null; // dedup key for Telegram retries
  storagePath: string | null; // image / file in Supabase Storage
  processedAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
}

/** Groups the rows of one submitted template file (template lane). */
export interface IntakeBatch {
  id: Uuid;
  clientId: Uuid;
  source: IntakeSource;
  fileName: string | null;
  rowCount: number;
  createdAt: IsoTimestamp;
}

/** A single reviewable transaction draft — the convergence point of both lanes. */
export interface IntakeItem {
  id: Uuid;
  clientId: Uuid;
  batchId: Uuid | null;
  source: IntakeSource;
  period: string | null; // filing period, e.g. "2026-07"
  reviewStatus: ReviewStatus;

  // extracted / parsed fields
  txnDate: IsoDate | null;
  supplierName: string | null;
  gross: Centavos | null;
  vat: Centavos | null;
  vatClass: VatClass;
  tin: string | null;
  orNumber: string | null;
  docType: DocType;
  category: string | null;
  accountCode: string | null; // resolved chart-of-accounts code
  ledger: Ledger | null;
  counterpartyAddress: string | null;

  // extraction metadata (drives the review gate)
  confidence: number | null; // 0..1
  birValid: boolean | null;
  reviewNotes: string | null;
  aiRecommendation: AiRecommendation | null;

  // approval + hand-off to n8n
  approvedBy: Uuid | null;
  approvedAt: IsoTimestamp | null;
  n8nSentAt: IsoTimestamp | null;

  // workflow spec (0006): printed amounts, validity, holds, books
  taxValidity: TaxValidity | null;
  vatable: Centavos | null;
  vatExempt: Centavos | null;
  zeroRated: Centavos | null;
  whtAmount: Centavos | null;
  atc: string | null;
  holdPeriod: string | null; // YYYY-MM, same taxable year as txnDate
  holdReason: string | null;
  holdApprovedBy: Uuid | null;
  holdApprovedAt: IsoTimestamp | null;
  clientNote: string | null;
  approvalSource: "staff" | "rule" | null;
  driveFileId: string | null;

  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** A stored file (receipt image or template) backing an inbox row or item. */
export interface DocumentRef {
  id: Uuid;
  clientId: Uuid;
  intakeItemId: Uuid | null;
  storagePath: string;
  mimeType: string | null;
  createdAt: IsoTimestamp;
}
