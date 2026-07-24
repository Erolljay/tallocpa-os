import { describe, it, expect } from "vitest";
import { normalizeTin, isValidTin, formatTin } from "./tin.js";

describe("normalizeTin", () => {
  it("strips separators and spaces", () => {
    expect(normalizeTin("123-456-789-000")).toBe("123456789000");
    expect(normalizeTin(" 123 456 789 ")).toBe("123456789");
  });
  it("handles null / undefined", () => {
    expect(normalizeTin(null)).toBe("");
    expect(normalizeTin(undefined)).toBe("");
  });
});

describe("isValidTin", () => {
  it("accepts 9, 12, and 14 digit TINs", () => {
    expect(isValidTin("123456789")).toBe(true); // base only
    expect(isValidTin("123-456-789-000")).toBe(true); // 3-digit branch
    expect(isValidTin("123-456-789-00000")).toBe(true); // 5-digit branch
  });

  it("rejects wrong lengths", () => {
    expect(isValidTin("123")).toBe(false);
    expect(isValidTin("1234567890")).toBe(false); // 10 digits
    expect(isValidTin("")).toBe(false);
  });

  it("rejects non-digit and all-zero inputs", () => {
    expect(isValidTin("abcdefghi")).toBe(false);
    expect(isValidTin("000000000")).toBe(false);
  });
});

describe("formatTin", () => {
  it("formats base and branch TINs", () => {
    expect(formatTin("123456789")).toBe("123-456-789");
    expect(formatTin("123456789000")).toBe("123-456-789-000");
    expect(formatTin("12345678900000")).toBe("123-456-789-00000");
  });
  it("leaves unrecognized input untouched", () => {
    expect(formatTin("123")).toBe("123");
    expect(formatTin(null)).toBe("");
  });
});
