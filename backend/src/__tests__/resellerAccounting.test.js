import { describe, expect, it } from "vitest";
import {
  buildMonthlyAccountingSnapshotFromPayments,
  buildSettlementPayload,
  buildMonthlyAccountingSnapshot,
  normalizeAccountingMonth,
} from "../services/resellerAccountingService.js";
import { calculatePaymentAmounts } from "../services/paymentLedgerService.js";

describe("reseller monthly accounting", () => {
  it("normalizes valid YYYY-MM months into an exclusive UTC range", () => {
    expect(normalizeAccountingMonth("2026-07")).toEqual({
      month: "2026-07",
      startIso: "2026-06-30T17:00:00.000Z",
      endIso: "2026-07-31T17:00:00.000Z",
    });
  });

  it("rejects malformed month values", () => {
    expect(normalizeAccountingMonth("2026-13")).toBeNull();
    expect(normalizeAccountingMonth("July 2026")).toBeNull();
  });

  it("calculates platform due from confirmed paid purchase orders only", () => {
    const snapshot = buildMonthlyAccountingSnapshot({
      reseller: { id: "r1", name: "Shadow VPN", commission_percent: 20 },
      period: normalizeAccountingMonth("2026-07"),
      orders: [
        {
          id: "o1",
          status: "active",
          payment_status: "paid",
          review_status: "confirmed",
          order_type: "purchase",
          price_mmk: 5000,
          total_paid_mmk: 5000,
          commission_amount_mmk: 1000,
          commission_percent: 20,
          customer: { full_name: "Kyaw Linn" },
          plan: { name: "Premium Plan" },
        },
        {
          id: "o2",
          payment_status: "paid",
          review_status: "pending_review",
          order_type: "purchase",
          price_mmk: 4000,
          total_paid_mmk: 4000,
          commission_amount_mmk: 800,
        },
        {
          id: "o3",
          payment_status: "paid",
          review_status: "confirmed",
          order_type: "trial",
          price_mmk: 0,
          total_paid_mmk: 0,
          commission_amount_mmk: 0,
        },
        {
          id: "o4",
          payment_status: "unpaid",
          review_status: "confirmed",
          order_type: "purchase",
          price_mmk: 5000,
          total_paid_mmk: 0,
          commission_amount_mmk: 1000,
        },
      ],
    });

    expect(snapshot.summary).toMatchObject({
      gross_paid_mmk: 5000,
      reseller_commission_mmk: 1000,
      platform_due_mmk: 4000,
      pending_review_mmk: 4000,
      unpaid_mmk: 5000,
      confirmed_order_count: 1,
      pending_review_count: 1,
      unpaid_order_count: 1,
      total_order_count: 4,
    });
    expect(snapshot.settlement_orders).toHaveLength(1);
    expect(snapshot.settlement_orders[0]).toMatchObject({
      id: "o1",
      platform_due_mmk: 4000,
    });
  });

  it("builds a submitted settlement payload from a snapshot", () => {
    const snapshot = buildMonthlyAccountingSnapshot({
      reseller: { id: "r1", name: "Shadow VPN", commission_percent: 20 },
      period: normalizeAccountingMonth("2026-07"),
      orders: [
        {
          id: "o1",
          status: "active",
          payment_status: "paid",
          review_status: "confirmed",
          order_type: "purchase",
          price_mmk: 5000,
          total_paid_mmk: 5000,
          commission_amount_mmk: 1000,
          commission_percent: 20,
          customer: { full_name: "Kyaw Linn" },
          plan: { name: "Premium Plan" },
        },
      ],
    });

    const payload = buildSettlementPayload({
      snapshot,
      transferNote: "KBZ transfer sent",
      transferReference: "REF-123",
    });

    expect(payload).toMatchObject({
      reseller_id: "r1",
      settlement_month: "2026-07-01",
      status: "submitted",
      gross_paid_mmk: 5000,
      reseller_commission_mmk: 1000,
      platform_due_mmk: 4000,
      transfer_note: "KBZ transfer sent",
      transfer_reference: "REF-123",
    });
    expect(payload.snapshot_basis.settlement_orders).toHaveLength(1);
  });

  it("calculates ledger commission from actual payment amount", () => {
    expect(calculatePaymentAmounts({ amountMmk: 24000, commissionPercent: 20 })).toEqual({
      amount_mmk: 24000,
      commission_percent: 20,
      commission_amount_mmk: 4800,
      platform_due_mmk: 19200,
    });
  });

  it("builds accounting from payment ledger rows", () => {
    const snapshot = buildMonthlyAccountingSnapshotFromPayments({
      reseller: { id: "r1", name: "Shadow VPN", commission_percent: 20 },
      period: normalizeAccountingMonth("2026-07"),
      payments: [
        {
          id: "p1",
          order_id: "o1",
          amount_mmk: 24000,
          commission_percent: 20,
          commission_amount_mmk: 4800,
          platform_due_mmk: 19200,
          review_status: "confirmed",
          order: {
            status: "active",
            payment_status: "paid",
            source: "miniapp",
            price_mmk: 8000,
            customer: { full_name: "Kyaw Linn" },
            plan: { name: "Max Plan" },
          },
        },
        {
          id: "p2",
          order_id: "o2",
          amount_mmk: 5000,
          commission_percent: 20,
          commission_amount_mmk: 1000,
          platform_due_mmk: 4000,
          review_status: "pending_review",
        },
      ],
    });

    expect(snapshot.summary).toMatchObject({
      gross_paid_mmk: 24000,
      reseller_commission_mmk: 4800,
      platform_due_mmk: 19200,
      pending_review_mmk: 5000,
      confirmed_order_count: 1,
      pending_review_count: 1,
      total_order_count: 2,
    });
    expect(snapshot.settlement_orders[0]).toMatchObject({
      payment_id: "p1",
      order_id: "o1",
      total_paid_mmk: 24000,
      commission_amount_mmk: 4800,
      platform_due_mmk: 19200,
    });
  });

  it("counts only confirmed applied package payments in accounting", () => {
    const snapshot = buildMonthlyAccountingSnapshotFromPayments({
      reseller: { id: "r1", name: "Shadow VPN", commission_percent: 20 },
      period: normalizeAccountingMonth("2026-07"),
      payments: [
        {
          id: "p1",
          order_id: "o1",
          amount_mmk: 5000,
          commission_percent: 20,
          commission_amount_mmk: 1000,
          platform_due_mmk: 4000,
          review_status: "confirmed",
          apply_status: "applied",
          payment_type: "initial",
          order: {
            status: "active",
            payment_status: "paid",
            customer: { full_name: "Kyaw Kyaw" },
            plan: { name: "Max Plan" },
          },
        },
        {
          id: "p2",
          order_id: "o1",
          amount_mmk: 8000,
          commission_percent: 20,
          commission_amount_mmk: 1600,
          platform_due_mmk: 6400,
          review_status: "confirmed",
          apply_status: "applied",
          payment_type: "extend",
          order: {
            status: "active",
            payment_status: "paid",
            customer: { full_name: "Kyaw Kyaw" },
            plan: { name: "Max Plan" },
          },
        },
        {
          id: "p3",
          order_id: "o1",
          amount_mmk: 8000,
          commission_percent: 20,
          commission_amount_mmk: 1600,
          platform_due_mmk: 6400,
          review_status: "confirmed",
          apply_status: "pending",
          payment_type: "extend",
        },
      ],
    });

    expect(snapshot.summary).toMatchObject({
      gross_paid_mmk: 13000,
      reseller_commission_mmk: 2600,
      platform_due_mmk: 10400,
      confirmed_order_count: 2,
      total_order_count: 1,
    });
    expect(snapshot.settlement_orders).toHaveLength(2);
  });
});
