import { describe, expect, it, vi } from "vitest";
import { addLegacyOrderSummary, summarizeOrderPayments, enrichOrderAccess } from "../services/customerOrderEnrichmentService.js";

it("public access supplies a server-switch UI hint for active SS trials only", () => {
  vi.stubEnv("PUBLIC_SERVER_ACCESS_ENABLED", "true");
  try {
    const order = { id: "trial", status: "active", order_type: "trial", expiry_date: "2026-11-01", quota_limit_bytes: 1000,
      customer: { ssconf_token: "test-token" }, keys: [{ id: "key", status: "active", protocol: "shadowsocks", used_bytes: 0, data_limit_bytes: 1000 }] };
    const now = new Date("2026-10-21T00:00:00Z");
    expect(enrichOrderAccess(order, undefined, { now }).can_switch_server).toBe(true);
    expect(enrichOrderAccess({ ...order, expiry_date: "2026-10-01" }, undefined, { now }).can_switch_server).toBe(false);
    expect(enrichOrderAccess({ ...order, keys: [{ ...order.keys[0], protocol: "vless" }] }, undefined, { now }).can_switch_server).toBe(false);
    vi.stubEnv("PUBLIC_SERVER_ACCESS_ENABLED", "false");
    expect(enrichOrderAccess(order, undefined, { now })).not.toHaveProperty("can_switch_server");
  } finally { vi.unstubAllEnvs(); }
});

describe("customer order enrichment money summary", () => {
  it("allows a trial server switch through grace, ending at Myanmar 04:00", () => {
    vi.stubEnv("PUBLIC_SERVER_ACCESS_ENABLED", "true");
    try {
      const order = { id: "trial", status: "active", order_type: "trial", expiry_date: "2026-10-28", quota_limit_bytes: 1000,
        keys: [{ id: "key", status: "active", protocol: "shadowsocks", used_bytes: 0, data_limit_bytes: 1000 }] };
      expect(enrichOrderAccess(order, undefined, { now: new Date("2026-10-28T21:29:59.999Z") }).can_switch_server).toBe(true);
      expect(enrichOrderAccess(order, undefined, { now: new Date("2026-10-28T21:30:00Z") }).can_switch_server).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });
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

it('retains a recorded legacy zero commission',()=>{const summary=addLegacyOrderSummary(summarizeOrderPayments([]),[{payment_status:'paid',review_status:'confirmed',total_paid_mmk:5000,commission_amount_mmk:0,reseller:{commission_percent:20},payments:[]}]);expect(summary.commission_mmk).toBe(0);});
