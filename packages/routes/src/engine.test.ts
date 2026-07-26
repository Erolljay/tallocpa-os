import { describe, it, expect } from "vitest";
import {
  instantiate,
  activeStep,
  completeActiveStep,
  rejectToStep,
  blockActiveStep,
  unblockStep,
  isComplete,
  deriveJobStatus,
  progress,
} from "./engine.js";
import { templateFor } from "./templates.js";
import type { JobStep } from "./types.js";

function advance(steps: JobStep[], n: number): JobStep[] {
  let s = steps;
  for (let i = 0; i < n; i += 1) s = completeActiveStep(s);
  return s;
}

describe("instantiate", () => {
  it("materializes a job with the first step active, rest pending", () => {
    const { job, steps } = instantiate(templateFor("bookkeeping"), {
      clientId: "c1",
      period: "2026-07",
    });
    expect(job).toMatchObject({
      serviceType: "bookkeeping",
      archetype: "recurring",
      clientId: "c1",
      period: "2026-07",
    });
    expect(steps[0]?.status).toBe("active");
    expect(steps.slice(1).every((s) => s.status === "pending")).toBe(true);
    expect(steps.map((s) => s.order)).toEqual(steps.map((_, i) => i));
  });

  it("defaults period to null for project work", () => {
    const { job } = instantiate(templateFor("audit"), { clientId: "c9" });
    expect(job.period).toBeNull();
  });
});

describe("completeActiveStep", () => {
  it("advances the active step to the next pending one", () => {
    const { steps } = instantiate(templateFor("bookkeeping"), { clientId: "c1" });
    const after = completeActiveStep(steps);
    expect(after[0]?.status).toBe("done");
    expect(after[1]?.status).toBe("active");
    // immutability: original untouched
    expect(steps[0]?.status).toBe("active");
  });

  it("completes the whole route", () => {
    const { steps } = instantiate(templateFor("bookkeeping"), { clientId: "c1" });
    const done = advance(steps, steps.length);
    expect(isComplete(done)).toBe(true);
    expect(deriveJobStatus(done)).toBe("done");
    expect(progress(done)).toEqual({ done: steps.length, total: steps.length });
  });
});

describe("deriveJobStatus", () => {
  it("is in_progress on a fresh job whose first step is not a gate", () => {
    const { steps } = instantiate(templateFor("bookkeeping"), { clientId: "c1" });
    expect(deriveJobStatus(steps)).toBe("in_progress");
  });

  it("is in_review when the active step is a review gate", () => {
    const { steps } = instantiate(templateFor("bookkeeping"), { clientId: "c1" });
    const atReview = advance(steps, 2); // intake, classify -> review (gate) active
    expect(activeStep(atReview)?.key).toBe("review");
    expect(deriveJobStatus(atReview)).toBe("in_review");
  });

  it("is blocked when a step is blocked", () => {
    const { steps } = instantiate(templateFor("bookkeeping"), { clientId: "c1" });
    expect(deriveJobStatus(blockActiveStep(steps))).toBe("blocked");
  });
});

describe("rejectToStep", () => {
  it("sends work back from a gate and re-pends intervening done steps", () => {
    const { steps } = instantiate(templateFor("tax_compliance"), { clientId: "c1" });
    // intake, record, compute, prepare -> review (gate) active
    const atReview = advance(steps, 4);
    expect(activeStep(atReview)?.key).toBe("review");

    const back = rejectToStep(atReview, "record");
    const byKey = Object.fromEntries(back.map((s) => [s.key, s.status]));
    expect(byKey["record"]).toBe("active"); // resume here
    expect(byKey["compute"]).toBe("pending"); // intervening work re-done
    expect(byKey["prepare"]).toBe("pending");
    expect(byKey["review"]).toBe("pending"); // gate re-pends
    expect(byKey["intake"]).toBe("done"); // before the target — stays done
  });

  it("is a no-op when the active step is not a review gate", () => {
    const { steps } = instantiate(templateFor("tax_compliance"), { clientId: "c1" });
    expect(rejectToStep(steps, "intake")).toEqual(steps); // active is 'intake', not a gate
  });

  it("is a no-op when the target is not before the gate", () => {
    const { steps } = instantiate(templateFor("bookkeeping"), { clientId: "c1" });
    const atReview = advance(steps, 2);
    expect(rejectToStep(atReview, "post")).toEqual(atReview); // 'post' is after the gate
  });
});

describe("block / unblock", () => {
  it("blocks then resumes the active step", () => {
    const { steps } = instantiate(templateFor("business_processing"), { clientId: "c1" });
    const blocked = blockActiveStep(steps);
    expect(blocked[0]?.status).toBe("blocked");
    const resumed = unblockStep(blocked, blocked[0]!.key);
    expect(resumed[0]?.status).toBe("active");
  });
});
