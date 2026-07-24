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

export type IntakeSource = "photo" | "template" | "manual";

export type DocType = "official_receipt" | "sales_invoice" | "unknown";

export type VatClass = "vatable" | "vat_exempt" | "zero_rated";

/**
 * Lifecycle of an intake item.
 *
 *   received ──▶ needs_review ──▶ approved ──▶ exported
 *      │                │
 *      │                ├──▶ rejected
 *      ▼                ▼
 *   extract_failed   (edited, then back to needs_review)
 *   / unreadable
 */
export type ReviewStatus =
  | "received"
  | "extract_failed"
  | "unreadable"
  | "needs_review"
  | "approved"
  | "rejected"
  | "exported";

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

  // extraction metadata (drives the review gate)
  confidence: number | null; // 0..1
  birValid: boolean | null;
  reviewNotes: string | null;

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
