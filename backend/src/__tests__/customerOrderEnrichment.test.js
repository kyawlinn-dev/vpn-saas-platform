import { describe, expect, it } from "vitest";
import { addLegacyOrderSummary, summarizeOrderPayments } from "../services/customerOrderEnrichmentService.js";

describe("customer order enrichment money summary", () => {
  it("adds old confirmed paid purchase orders that have no ledger rows", () => {
    const summary = addLegacyOrderSummary(
      summarizeOrderPayments([
        {
          amount_mmk: 5000,
          commission_amount_mmk: 1000,
          platform_due_mmk: 4000,
          review_status: "confirmed",
          apply_status: "applied",
        },
      ]),
      [
        {
          payment_status: "paid",
          review_status: "confirmed",
          order_type: "purchase",
          total_paid_mmk: 13000,
          commission_amount_mmk: 2600,
          payments: [],
        },
        {
          payment_status: "paid",
          review_status: "confirmed",
          order_type: "purchase",
          total_paid_mmk: 13000,
          payments: [{ id: "already-ledgered" }],
        },
      ]
    );

    expect(summary).toMatchObject({
      gross_mmk: 18000,
      commission_mmk: 3600,
      platform_due_mmk: 14400,
      confirmed_count: 2,
    });
  });
});
