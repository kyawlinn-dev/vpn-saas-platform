import { describe, expect, it } from "vitest";
import {
  addDaysToDateOnly,
  businessDateOnly,
  currentBusinessMonth,
  parseBusinessDay,
  parseBusinessMonth,
  accessDateOnly,
  orderExpiryAt,
  expiryBusinessState,
} from "../utils/businessTime.js";

describe("business time", () => {
  it('keeps access until 04:00 Myanmar on the day after the expiry label',()=>{
    expect(orderExpiryAt('2026-10-28')).toBe('2026-10-28T21:30:00.000Z');
    expect(accessDateOnly(new Date('2026-10-28T21:29:59.999Z'))).toBe('2026-10-28');
    expect(accessDateOnly(new Date('2026-10-28T21:30:00.000Z'))).toBe('2026-10-29');
    expect(expiryBusinessState('2026-10-28',new Date('2026-10-28T21:29:59.999Z')).expired).toBe(false);
    expect(expiryBusinessState('2026-10-28',new Date('2026-10-28T21:30:00.000Z')).expired).toBe(true);
  });
  it.each(['2026-12-31','2028-02-29','2026-01-31'])('handles calendar rollover for %s',date=>{
    expect(orderExpiryAt(date)).toBe(`${date}T21:30:00.000Z`);
  });
  it.each([null,'','2026-02-30','not-a-date'])('rejects invalid expiry %s',date=>{
    expect(orderExpiryAt(date)).toBeNull();
  });
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
