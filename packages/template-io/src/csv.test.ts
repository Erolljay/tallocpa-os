import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv.js";

describe("parseCsv", () => {
  it("parses header-keyed rows", () => {
    const rows = parseCsv("Date,Gross Amount\r\n2026-07-15,112.00\r\n");
    expect(rows).toEqual([{ Date: "2026-07-15", "Gross Amount": "112.00" }]);
  });

  it("handles quoted fields with embedded commas", () => {
    const rows = parseCsv('Supplier,Gross Amount\r\n"Ayala, Inc.","1,200.00"\r\n');
    expect(rows[0]).toEqual({ Supplier: "Ayala, Inc.", "Gross Amount": "1,200.00" });
  });

  it("skips blank lines and trims values", () => {
    const rows = parseCsv("Date,Supplier\n2026-07-15,  SM Store  \n\n\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.Supplier).toBe("SM Store");
  });

  it("returns empty for a header-only file", () => {
    expect(parseCsv("Date,Supplier\r\n")).toEqual([]);
  });
});
