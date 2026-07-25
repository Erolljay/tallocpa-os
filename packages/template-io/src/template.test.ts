import { describe, it, expect } from "vitest";
import { parseTemplateRows, CANONICAL_HEADER_ORDER } from "@tallocpa/template-parser";
import { buildTemplateCsv, buildTemplateXlsx } from "./template.js";
import { parseCsv } from "./csv.js";
import { parseXlsx } from "./xlsx.js";

describe("template generation", () => {
  it("emits the canonical headers", () => {
    const firstLine = buildTemplateCsv().split("\r\n")[0];
    expect(firstLine).toBe(CANONICAL_HEADER_ORDER.join(","));
  });

  it("quotes fields that contain commas", () => {
    // "5,600.00" must be quoted so it stays one CSV field
    expect(buildTemplateCsv()).toContain('"5,600.00"');
  });

  it("can be produced blank (headers only)", () => {
    expect(buildTemplateCsv(false).trim()).toBe(CANONICAL_HEADER_ORDER.join(","));
  });

  // End-to-end: generate template -> decode -> parse -> the examples all pass.
  it("round-trips CSV template through the full Lane B chain as all-ok", () => {
    const rows = parseCsv(buildTemplateCsv());
    const result = parseTemplateRows(rows);
    expect(result.summary.total).toBe(2);
    expect(result.summary.ok).toBe(2);
    expect(result.summary.needsFix).toBe(0);
  });

  it("round-trips XLSX template through the full Lane B chain as all-ok", async () => {
    const buffer = await buildTemplateXlsx();
    const rows = await parseXlsx(buffer);
    const result = parseTemplateRows(rows);
    expect(result.summary.ok).toBe(2);
    expect(result.summary.needsFix).toBe(0);
  });
});
