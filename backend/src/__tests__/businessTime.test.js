import { describe, expect, it } from "vitest";
import {
  addDaysToDateOnly,
  businessDateOnly,
  currentBusinessMonth,
  parseBusinessDay,
  parseBusinessMonth,
} from "../utils/businessTime.js";

describe("business time", () => {
  it("uses Bangkok's date after UTC day rollover", () => {
    expect(businessDateOnly(new Date("2026-07-22T17:30:00.000Z"))).toBe("2026-07-23");
    expect(currentBusinessMonth(new Date("2026-06-30T17:30:00.000Z"))).toBe("2026-07");
  });

  it("creates Bangkok month boundaries as UTC instants", () => {
    expect(parseBusinessMonth("2026-07")).toEqual({
      month: "2026-07",
      startIso: "2026-06-30T17:00:00.000Z",
      endIso: "2026-07-31T17:00:00.000Z",
    });
  });

  it("creates Bangkok day boundaries as UTC instants", () => {
    expect(parseBusinessDay("2026-07-23")).toEqual({
      date: "2026-07-23",
      startIso: "2026-07-22T17:00:00.000Z",
      endIso: "2026-07-23T17:00:00.000Z",
    });
  });

  it("defaults parseBusinessDay to today when no value is given", () => {
    expect(parseBusinessDay(undefined)?.date).toBe(businessDateOnly());
  });

  it("adds package days without depending on the host timezone", () => {
    expect(addDaysToDateOnly("2026-07-23", 30)).toBe("2026-08-22");
    expect(addDaysToDateOnly("2026-01-31", 1)).toBe("2026-02-01");
  });
});
