import type {
  RouteTemplate,
  Job,
  JobStep,
  StepStatus,
  JobStatus,
} from "./types.js";

/**
 * The job state machine. All functions are pure and return NEW arrays — a job's
 * step list is never mutated in place, so history and undo stay easy and there
 * are no hidden side effects.
 *
 *   instantiate ─▶ [step0 active, rest pending]
 *        completeActiveStep ─▶ next pending becomes active
 *        rejectToStep (at a gate) ─▶ work returns to an earlier step
 *   isComplete when every step is done/skipped
 */

export interface InstantiateCtx {
  clientId: string;
  period?: string | null;
}

/** Materialize a template into a Job + its step instances (first step active). */
export function instantiate(
  template: RouteTemplate,
  ctx: InstantiateCtx,
): { job: Job; steps: JobStep[] } {
  const steps: JobStep[] = template.steps.map((s, i) => ({
    key: s.key,
    name: s.name,
    order: i,
    ownerRole: s.ownerRole,
    isReviewGate: s.isReviewGate === true,
    status: (i === 0 ? "active" : "pending") as StepStatus,
  }));
  const job: Job = {
    serviceType: template.serviceType,
    archetype: template.archetype,
    templateVersion: template.version,
    clientId: ctx.clientId,
    period: ctx.period ?? null,
  };
  return { job, steps };
}

/** The step currently being worked on, if any. */
export function activeStep(steps: JobStep[]): JobStep | undefined {
  return steps.find((s) => s.status === "active");
}

function nextPendingAfter(
  steps: JobStep[],
  order: number,
): JobStep | undefined {
  return steps
    .filter((s) => s.order > order && s.status === "pending")
    .sort((a, b) => a.order - b.order)[0];
}

/** Complete the active step and activate the next pending step. */
export function completeActiveStep(steps: JobStep[]): JobStep[] {
  const active = activeStep(steps);
  if (!active) return steps;
  const next = nextPendingAfter(steps, active.order);
  return steps.map((s) => {
    if (s.key === active.key) return { ...s, status: "done" as StepStatus };
    if (next && s.key === next.key) return { ...s, status: "active" as StepStatus };
    return s;
  });
}

/**
 * Reject at the active review gate and send work back to an earlier step.
 * The gate re-pends, the target step becomes active, and any completed steps
 * between them re-pend (their work must be redone after the correction).
 */
export function rejectToStep(steps: JobStep[], backToKey: string): JobStep[] {
  const active = activeStep(steps);
  if (!active || !active.isReviewGate) return steps;
  const back = steps.find((s) => s.key === backToKey);
  if (!back || back.order >= active.order) return steps;
  return steps.map((s) => {
    if (s.key === active.key) return { ...s, status: "pending" as StepStatus };
    if (s.key === back.key) return { ...s, status: "active" as StepStatus };
    if (s.order > back.order && s.order < active.order && s.status === "done") {
      return { ...s, status: "pending" as StepStatus };
    }
    return s;
  });
}

/** Mark the active step blocked (e.g. waiting on the client or a regulator). */
export function blockActiveStep(steps: JobStep[]): JobStep[] {
  const active = activeStep(steps);
  if (!active) return steps;
  return steps.map((s) =>
    s.key === active.key ? { ...s, status: "blocked" as StepStatus } : s,
  );
}

/** Re-activate a blocked step so work can resume. */
export function unblockStep(steps: JobStep[], key: string): JobStep[] {
  return steps.map((s) =>
    s.key === key && s.status === "blocked"
      ? { ...s, status: "active" as StepStatus }
      : s,
  );
}

export function isComplete(steps: JobStep[]): boolean {
  return steps.every((s) => s.status === "done" || s.status === "skipped");
}

/** Derive the job's overall status from its steps. */
export function deriveJobStatus(steps: JobStep[]): JobStatus {
  if (steps.length === 0) return "not_started";
  if (steps.every((s) => s.status === "pending")) return "not_started";
  if (isComplete(steps)) return "done";
  if (steps.some((s) => s.status === "blocked")) return "blocked";
  const active = activeStep(steps);
  if (active?.isReviewGate) return "in_review";
  return "in_progress";
}

/** Simple progress fraction for dashboards. */
export function progress(steps: JobStep[]): { done: number; total: number } {
  const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  return { done, total: steps.length };
}
