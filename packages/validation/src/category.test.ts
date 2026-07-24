import { describe, it, expect } from "vitest";
import { mapCategory, type ChartAccount } from "./category.js";

const coa: ChartAccount[] = [
  { code: "5010", name: "Office Supplies", aliases: ["supplies", "office supply"] },
  { code: "5020", name: "Utilities", aliases: ["electricity", "water", "meralco"] },
  { code: "5030", name: "Transportation" },
];

describe("mapCategory", () => {
  it("matches on exact account name, case-insensitively", () => {
    expect(mapCategory("office supplies", coa)).toMatchObject({ matched: true, accountCode: "5010" });
    expect(mapCategory("OFFICE SUPPLIES", coa)).toMatchObject({ matched: true, accountCode: "5010" });
  });

  it("matches on an alias", () => {
    expect(mapCategory("Meralco", coa)).toMatchObject({ matched: true, accountCode: "5020" });
    expect(mapCategory("supplies", coa)).toMatchObject({ matched: true, accountCode: "5010" });
  });

  it("normalizes punctuation and extra spaces", () => {
    expect(mapCategory("  office-supplies  ", coa)).toMatchObject({ matched: true, accountCode: "5010" });
  });

  it("returns unmatched for unknown input (flag for review)", () => {
    expect(mapCategory("consulting fees", coa)).toEqual({ matched: false });
  });

  it("returns unmatched for empty or nullish input", () => {
    expect(mapCategory("", coa)).toEqual({ matched: false });
    expect(mapCategory(null, coa)).toEqual({ matched: false });
  });
});
