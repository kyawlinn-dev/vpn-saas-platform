import { describe, expect, it } from "vitest";
import {
  combinePaymentEvents,
  isLegacyAccountingOrder,
  legacyOrderToPayment,
} from "../routes/admin/adminDataRouter.js";

describe("admin accounting legacy compatibility", () => {
  it("converts old confirmed paid purchase orders into payment events", () => {
    const event = legacyOrderToPayment({
      id: "o1",
      customer_id: "c1",
      reseller_id: "r1",
      status: "active",
      payment_status: "paid",
      review_status: "confirmed",
      order_type: "purchase",
      source: "dashboard",
      total_paid_mmk: 13000,
      commission_amount_mmk: 2600,
      created_at: "2026-07-10T00:00:00.000Z",
      reseller: { id: "r1", name: "Main Reseller", commission_percent: 20 },
      customer: { id: "c1", full_name: "May Thu" },
      plan: { id: "p1", name: "Premium Plan" },
    });

    expect(event).toMatchObject({
      id: "legacy-o1",
      order_id: "o1",
      reseller_id: "r1",
      amount_mmk: 13000,
      commission_amount_mmk: 2600,
      platform_due_mmk: 10400,
      review_status: "confirmed",
      payment_type: "initial",
      apply_status: "applied",
      order: {
        customer: { full_name: "May Thu" },
        plan: { name: "Premium Plan" },
      },
    });
  });

  it("only treats old paid purchases without ledger rows as legacy accounting events", () => {
    expect(
      isLegacyAccountingOrder({
        payment_status: "paid",
        review_status: "confirmed",
        order_type: "purchase",
        total_paid_mmk: 5000,
        payments: [],
      })
    ).toBe(true);

    expect(
      isLegacyAccountingOrder({
        payment_status: "paid",
        review_status: "confirmed",
        order_type: "purchase",
        total_paid_mmk: 5000,
        payments: [{ id: "p1" }],
      })
    ).toBe(false);

    expect(
      isLegacyAccountingOrder({
        payment_status: "paid",
        review_status: "confirmed",
        order_type: "trial",
        total_paid_mmk: 0,
        payments: [],
      })
    ).toBe(false);
  });

  it("combines confirmed ledger events and legacy events without double counting", () => {
    const events = combinePaymentEvents({
      payments: [
        {
          id: "p1",
          amount_mmk: 5000,
          commission_amount_mmk: 1000,
          platform_due_mmk: 4000,
          review_status: "confirmed",
          apply_status: "applied",
        },
        {
          id: "p2",
          amount_mmk: 8000,
          review_status: "pending_review",
          apply_status: "pending",
        },
      ],
      legacyOrders: [
        {
          id: "o1",
          payment_status: "paid",
          review_status: "confirmed",
          order_type: "purchase",
          total_paid_mmk: 13000,
          commission_amount_mmk: 2600,
          payments: [],
        },
        {
          id: "o2",
          payment_status: "paid",
          review_status: "confirmed",
          order_type: "purchase",
          total_paid_mmk: 13000,
          payments: [{ id: "existing" }],
        },
      ],
    });

    expect(events.map((event) => event.id)).toEqual(["p1", "legacy-o1"]);
    expect(events.reduce((sum, event) => sum + Number(event.amount_mmk || 0), 0)).toBe(18000);
  });
});
