import { describe, it, expect } from "vitest";
import { ROUTE_TEMPLATES } from "@tallocpa/routes";
import {
  SEED_SOPS,
  sopForStep,
  sopsForService,
  sopCoverage,
  sopCoverageSummary,
  sopKey,
} from "./library.js";

describe("SOP library", () => {
  it("resolves a seed SOP for a covered step", () => {
    const s = sopForStep("bookkeeping", "review");
    expect(s?.title).toBe("Reviewer check before posting");
    expect(s?.key).toBe("bookkeeping.review");
  });

  it("returns undefined for a step with no SOP yet", () => {
    expect(sopForStep("audit", "fieldwork")).toBeUndefined();
  });

  it("lists a service's SOPs in route-step order", () => {
    const bk = sopsForService("bookkeeping");
    expect(bk[0]?.stepKey).toBe("intake");
    expect(bk.at(-1)?.stepKey).toBe("handoff");
  });

  it("every seed SOP maps to a real route step (no orphans)", () => {
    for (const s of SEED_SOPS) {
      const template = ROUTE_TEMPLATES[s.serviceType];
      const stepKeys = template.steps.map((st) => st.key);
      expect(stepKeys).toContain(s.stepKey);
      expect(s.key).toBe(sopKey(s.serviceType, s.stepKey));
    }
  });

  it("every seed SOP has real content", () => {
    for (const s of SEED_SOPS) {
      expect(s.purpose.length).toBeGreaterThan(0);
      expect(s.procedure.length).toBeGreaterThan(0);
      expect(s.checklist.length).toBeGreaterThan(0);
    }
  });

  it("coverage counts covered vs every route step", () => {
    const total = Object.values(ROUTE_TEMPLATES).reduce(
      (n, t) => n + t.steps.length,
      0,
    );
    const summary = sopCoverageSummary();
    expect(summary.total).toBe(total);
    expect(summary.covered).toBe(SEED_SOPS.length);
    // recurring services are fully covered; assurance/project steps are the gaps
    const rows = sopCoverage();
    expect(rows.filter((r) => r.serviceType === "bookkeeping").every((r) => r.hasSop)).toBe(true);
    expect(rows.some((r) => r.serviceType === "audit" && !r.hasSop)).toBe(true);
  });
});
