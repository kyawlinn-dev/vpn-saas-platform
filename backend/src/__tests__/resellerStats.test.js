import { describe, expect, it } from "vitest";
import {
  belongsInRecentActivity,
  isTelegramManagedOrder,
  revenueInWindow,
} from "../routes/reseller/resellerStatsRouter.js";

describe("isTelegramManagedOrder", () => {
  it("matches by order source", () => {
    expect(isTelegramManagedOrder({ source: "miniapp" })).toBe(true);
    expect(isTelegramManagedOrder({ source: "bot" })).toBe(true);
    expect(isTelegramManagedOrder({ source: "dashboard" })).toBe(false);
  });

  it("matches by customer_type even when source is dashboard", () => {
    expect(
      isTelegramManagedOrder({ source: "dashboard", customer: { customer_type: "telegram" } })
    ).toBe(true);
  });

  it("handles missing fields", () => {
    expect(isTelegramManagedOrder({})).toBe(false);
    expect(isTelegramManagedOrder(null)).toBe(false);
  });
});

describe("revenueInWindow", () => {
  const startIso = "2026-07-01T00:00:00.000Z";
  const endIso = "2026-08-01T00:00:00.000Z";

  it("sums confirmed ledger payments created within the window", () => {
    const payments = [
      { amount_mmk: 1000, review_status: "confirmed", created_at: "2026-07-15T00:00:00.000Z" },
      { amount_mmk: 500, review_status: "confirmed", created_at: "2026-06-30T00:00:00.000Z" }, // outside window
      { amount_mmk: 250, review_status: "confirmed", created_at: "2026-08-01T00:00:00.000Z" }, // outside window (exclusive end)
    ];
    expect(revenueInWindow({ payments, legacyOrders: [], startIso, endIso })).toBe(1000);
  });

  it("excludes payments still awaiting reseller review, even inside the window", () => {
    // Regression test: a fresh miniapp purchase creates a payment with
    // review_status="pending_review" before the reseller confirms it. That
    // must not inflate today/month revenue until it's actually confirmed.
    const payments = [
      { amount_mmk: 1000, review_status: "confirmed", created_at: "2026-07-15T00:00:00.000Z" },
      { amount_mmk: 4000, review_status: "pending_review", created_at: "2026-07-15T00:00:00.000Z" },
      { amount_mmk: 999, review_status: "rejected", created_at: "2026-07-15T00:00:00.000Z" },
    ];
    expect(revenueInWindow({ payments, legacyOrders: [], startIso, endIso })).toBe(1000);
  });

  it("falls back to total_paid_mmk only for confirmed purchase orders with no ledger rows", () => {
    const legacyOrders = [
      {
        total_paid_mmk: 2000,
        order_type: "purchase",
        review_status: "confirmed",
        created_at: "2026-07-10T00:00:00.000Z",
        payments: [],
      },
      {
        // Has a ledger row already — must not be double counted here.
        total_paid_mmk: 3000,
        order_type: "purchase",
        review_status: "confirmed",
        created_at: "2026-07-10T00:00:00.000Z",
        payments: [{ id: "p1" }],
      },
      {
        // Not confirmed — excluded.
        total_paid_mmk: 4000,
        order_type: "purchase",
        review_status: "pending_review",
        created_at: "2026-07-10T00:00:00.000Z",
        payments: [],
      },
      {
        // Trial order — excluded regardless of review_status.
        total_paid_mmk: 5000,
        order_type: "trial",
        review_status: "confirmed",
        created_at: "2026-07-10T00:00:00.000Z",
        payments: [],
      },
    ];
    expect(revenueInWindow({ payments: [], legacyOrders, startIso, endIso })).toBe(2000);
  });

  it("combines ledger and legacy totals without double counting", () => {
    const payments = [{ amount_mmk: 1500, review_status: "confirmed", created_at: "2026-07-05T00:00:00.000Z" }];
    const legacyOrders = [
      {
        total_paid_mmk: 2000,
        order_type: "purchase",
        review_status: "confirmed",
        created_at: "2026-07-06T00:00:00.000Z",
        payments: [],
      },
    ];
    expect(revenueInWindow({ payments, legacyOrders, startIso, endIso })).toBe(3500);
  });
});

describe("belongsInRecentActivity", () => {
  it("hides an unconfirmed (pending review) miniapp/bot purchase", () => {
    expect(belongsInRecentActivity({ source: "miniapp", review_status: "pending_review" })).toBe(false);
    expect(belongsInRecentActivity({ source: "bot", review_status: "pending_review" })).toBe(false);
  });

  it("shows a rejected miniapp/bot purchase — it's been reviewed, just not approved", () => {
    expect(belongsInRecentActivity({ source: "miniapp", review_status: "rejected" })).toBe(true);
    expect(belongsInRecentActivity({ source: "bot", review_status: "rejected" })).toBe(true);
  });

  it("shows a telegram order once it's confirmed", () => {
    expect(belongsInRecentActivity({ source: "miniapp", review_status: "confirmed" })).toBe(true);
  });

  it("shows a trial order even though trials are always review_status=confirmed", () => {
    expect(
      belongsInRecentActivity({ source: "miniapp", order_type: "trial", review_status: "confirmed" })
    ).toBe(true);
  });

  it("shows a dashboard-sourced order regardless of review_status (not a telegram order)", () => {
    expect(belongsInRecentActivity({ source: "dashboard", review_status: "pending_review" })).toBe(true);
    expect(belongsInRecentActivity({ source: "dashboard", review_status: "rejected" })).toBe(true);
  });
});
