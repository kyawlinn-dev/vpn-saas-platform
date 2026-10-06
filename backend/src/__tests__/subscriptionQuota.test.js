import { describe, expect, it } from "vitest";
import {
  buildOrderQuotaSnapshot,
  calculateExtendedDataLimitBytes,
  resolveRemainingKeyLimitBytes,
  switchOrderProtocol,
} from "../services/subscriptionProvisionService.js";

const GB = 1024 * 1024 * 1024;

describe("subscription quota calculations", () => {
  it("keeps a legacy Outline key intact when VLESS is requested", async () => {
    await expect(switchOrderProtocol({
      order: { id: "legacy-order" },
      oldKey: { id: "legacy-key", outline_key_id: "42" },
      server: { id: "legacy", panel_type: "outline" },
      protocol: "vless",
    })).rejects.toMatchObject({ code: "PROTOCOL_REQUIRES_MARZNESHIN" });
  });
  it("adds a purchased package to the current active key limit", () => {
    expect(calculateExtendedDataLimitBytes(50 * GB, 50 * GB)).toBe(100 * GB);
  });

  it("keeps unlimited access unlimited when current or new package is unlimited", () => {
    expect(calculateExtendedDataLimitBytes(null, 50 * GB)).toBeNull();
    expect(calculateExtendedDataLimitBytes(50 * GB, null)).toBeNull();
  });

  it("calculates remaining quota after a server switch from historical usage plus active balance", () => {
    const quota = buildOrderQuotaSnapshot([
      {
        id: "old-key",
        status: "deleted",
        data_limit_bytes: 50 * GB,
        used_bytes: 20 * GB,
      },
      {
        id: "current-key",
        status: "active",
        data_limit_bytes: 30 * GB,
        used_bytes: 0,
      },
    ]);

    expect(quota.totalAllowanceBytes).toBe(50 * GB);
    expect(quota.totalUsedBytes).toBe(20 * GB);
    expect(quota.remainingBytes).toBe(30 * GB);
  });

  it("calculates remaining quota after extending a switched subscription", () => {
    const quota = buildOrderQuotaSnapshot([
      {
        id: "old-key",
        status: "deleted",
        data_limit_bytes: 50 * GB,
        used_bytes: 20 * GB,
      },
      {
        id: "current-key",
        status: "active",
        data_limit_bytes: 80 * GB,
        used_bytes: 0,
      },
    ]);

    expect(quota.totalAllowanceBytes).toBe(100 * GB);
    expect(quota.totalUsedBytes).toBe(20 * GB);
    expect(quota.remainingBytes).toBe(80 * GB);
  });

  it("preserves remaining data when a key moves to another server", () => {
    const quota = buildOrderQuotaSnapshot([
      { status: "deleted", data_limit_bytes: 50 * GB, used_bytes: 20 * GB },
      { status: "active", data_limit_bytes: 30 * GB, used_bytes: 8 * GB },
    ]);
    expect(resolveRemainingKeyLimitBytes({ quota, planDataLimitGb: 50 })).toBe(22 * GB);
  });

  it("does not turn a finite plan into unlimited access after a null-limit key", () => {
    const quota = buildOrderQuotaSnapshot([
      { status: "deleted", data_limit_bytes: 50 * GB, used_bytes: 20 * GB },
      { status: "active", data_limit_bytes: null, used_bytes: 8 * GB },
    ]);
    expect(resolveRemainingKeyLimitBytes({ quota, planDataLimitGb: 50 })).toBe(22 * GB);
  });

  it("rejects a switch when a finite plan has no balance left", () => {
    const quota = buildOrderQuotaSnapshot([
      { status: "active", data_limit_bytes: null, used_bytes: 50 * GB },
    ]);
    expect(() => resolveRemainingKeyLimitBytes({ quota, planDataLimitGb: 50 }))
      .toThrow("DATA_LIMIT_REACHED");
  });

  it("keeps a genuinely unlimited plan unlimited", () => {
    expect(resolveRemainingKeyLimitBytes({
      quota: { isUnlimited: true, totalUsedBytes: 9 * GB, remainingBytes: null },
      planDataLimitGb: null,
    })).toBeNull();
  });

  it("fails closed when the plan quota and current balance are both unavailable", () => {
    expect(() => resolveRemainingKeyLimitBytes({
      quota: { isUnlimited: true, totalUsedBytes: 0, remainingBytes: null },
      planDataLimitGb: undefined,
    })).toThrow("PLAN_QUOTA_UNKNOWN");
  });
});
