import { describe, it, expect } from "vitest";
import { buildXlsx, parseXlsx } from "./xlsx.js";

describe("xlsx round-trip", () => {
  it("writes and reads header-keyed rows", async () => {
    const headers = ["Date", "Supplier Name", "Gross Amount"];
    const rows = [
      { Date: "2026-07-15", "Supplier Name": "Mercury Drug", "Gross Amount": "112.00" },
      { Date: "2026-07-16", "Supplier Name": "Meralco", "Gross Amount": "5600.00" },
    ];
    const buffer = await buildXlsx(headers, rows);
    const parsed = await parseXlsx(buffer);
    expect(parsed).toEqual(rows);
  });

  it("skips fully empty rows", async () => {
    const buffer = await buildXlsx(
      ["Date", "Supplier Name"],
      [
        { Date: "2026-07-15", "Supplier Name": "SM Store" },
        { Date: "", "Supplier Name": "" },
      ],
    );
    const parsed = await parseXlsx(buffer);
    expect(parsed).toHaveLength(1);
  });

  it("returns empty for a header-only sheet", async () => {
    const buffer = await buildXlsx(["Date", "Supplier Name"], []);
    expect(await parseXlsx(buffer)).toEqual([]);
  });
});
