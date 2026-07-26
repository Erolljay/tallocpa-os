import { describe, it, expect } from "vitest";
import { ROUTE_TEMPLATES, templateFor } from "./templates.js";
import type { ServiceType } from "./types.js";

const SERVICES: ServiceType[] = [
  "tax_compliance",
  "bookkeeping",
  "audit",
  "agreed_upon_procedures",
  "business_processing",
  "systems_implementation",
];

describe("route templates", () => {
  it("defines all six service lines", () => {
    expect(Object.keys(ROUTE_TEMPLATES).sort()).toEqual([...SERVICES].sort());
  });

  it.each(SERVICES)("%s is well-formed", (service) => {
    const t = templateFor(service);
    expect(t.serviceType).toBe(service);
    expect(t.steps.length).toBeGreaterThan(0);
    // step keys are unique within the template
    const keys = t.steps.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    // has at least one review/approval gate
    expect(t.steps.some((s) => s.isReviewGate)).toBe(true);
  });

  it("marks assurance services with the assurance archetype", () => {
    expect(templateFor("audit").archetype).toBe("assurance");
    expect(templateFor("agreed_upon_procedures").archetype).toBe("assurance");
  });

  it("marks tax and bookkeeping as recurring", () => {
    expect(templateFor("tax_compliance").archetype).toBe("recurring");
    expect(templateFor("bookkeeping").archetype).toBe("recurring");
  });

  it("requires a partner sign-off gate on the audit route", () => {
    const signoff = templateFor("audit").steps.find((s) => s.key === "partner_signoff");
    expect(signoff?.isReviewGate).toBe(true);
    expect(signoff?.ownerRole).toBe("partner");
  });
});
