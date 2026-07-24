import { describe, expect, it } from "vitest";
import { parsePagination, sanitizeSearchTerm } from "../utils/pagination.js";

describe("parsePagination", () => {
  it("defaults to page 1, limit 20", () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it("computes offset from page and limit", () => {
    expect(parsePagination({ page: "3", limit: "10" })).toEqual({
      page: 3,
      limit: 10,
      offset: 20,
    });
  });

  it("clamps page below 1 and limit above 100", () => {
    expect(parsePagination({ page: "0", limit: "500" })).toEqual({
      page: 1,
      limit: 100,
      offset: 0,
    });
  });

  it("ignores non-numeric input", () => {
    expect(parsePagination({ page: "abc", limit: "xyz" })).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
    });
  });
});

describe("sanitizeSearchTerm", () => {
  it("trims whitespace", () => {
    expect(sanitizeSearchTerm("  jane  ")).toBe("jane");
  });

  it("strips characters meaningful to the PostgREST filter grammar", () => {
    expect(sanitizeSearchTerm("jane,or(status.eq.active)")).toBe(
      "jane or status eq active"
    );
    expect(sanitizeSearchTerm("a.b.c")).toBe("a b c");
    expect(sanitizeSearchTerm("*wild*card*")).toBe("wild card");
  });

  it("returns an empty string for null/undefined/empty input", () => {
    expect(sanitizeSearchTerm(null)).toBe("");
    expect(sanitizeSearchTerm(undefined)).toBe("");
    expect(sanitizeSearchTerm("")).toBe("");
    expect(sanitizeSearchTerm("   ")).toBe("");
  });

  it("caps length at 100 characters", () => {
    const long = "a".repeat(200);
    expect(sanitizeSearchTerm(long)).toHaveLength(100);
  });
});
