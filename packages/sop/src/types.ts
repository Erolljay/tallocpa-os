import type { ServiceType } from "@tallocpa/routes";

/**
 * A Standard Operating Procedure attached to one route step. Shown at the point
 * of work, and maintained/versioned as PSQM 1 component 6 (resources — the
 * firm's methodologies). The key convention is `${serviceType}.${stepKey}`.
 */
export interface Sop {
  key: string;
  serviceType: ServiceType;
  stepKey: string;
  title: string;
  /** One line: why this step exists. */
  purpose: string;
  /** Ordered "how to do it". */
  procedure: string[];
  /** "Done when" items the owner ticks off. */
  checklist: string[];
  version: number;
}

/** Per-step coverage: whether an SOP exists for a route step. */
export interface SopCoverageRow {
  serviceType: ServiceType;
  stepKey: string;
  stepName: string;
  hasSop: boolean;
}
