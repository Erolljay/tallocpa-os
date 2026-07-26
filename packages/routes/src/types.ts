/**
 * The route engine's domain — the spine every operational module hangs off.
 *
 * A `RouteTemplate` is the reusable definition of a service workflow (its
 * ordered steps, each with an owner role and whether it is a review gate). A
 * `Job` is a live instance of that template for a client (and, for recurring
 * services, a period). Its `JobStep`s move through a small state machine.
 */

export type ServiceArchetype = "recurring" | "project" | "assurance";

export type ServiceType =
  | "tax_compliance"
  | "bookkeeping"
  | "audit"
  | "agreed_upon_procedures"
  | "business_processing"
  | "systems_implementation";

/** Who owns a step. Maps to firm roles; assurance work adds partner/EQR. */
export type JobRole =
  | "preparer"
  | "reviewer"
  | "manager"
  | "partner"
  | "eqr"
  | "client";

export type StepStatus = "pending" | "active" | "done" | "skipped" | "blocked";

export type JobStatus =
  | "not_started"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done";

/** A step in a route template (the definition). */
export interface RouteStep {
  /** Stable key, unique within a template. */
  key: string;
  name: string;
  ownerRole: JobRole;
  /** A review/approval gate — reaching it means the job is "in review". */
  isReviewGate?: boolean;
  /** Pointer to SOP content shown at the point of work (filled by the SOP module). */
  sopRef?: string;
}

export interface RouteTemplate {
  serviceType: ServiceType;
  archetype: ServiceArchetype;
  version: number;
  name: string;
  steps: RouteStep[];
}

/** A materialized step instance on a live job. */
export interface JobStep {
  key: string;
  name: string;
  order: number;
  ownerRole: JobRole;
  isReviewGate: boolean;
  status: StepStatus;
}

export interface Job {
  serviceType: ServiceType;
  archetype: ServiceArchetype;
  templateVersion: number;
  clientId: string;
  /** e.g. "2026-07" for a recurring monthly job; null for project work. */
  period: string | null;
}
