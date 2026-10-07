import { describe, expect, it } from "vitest";
import {
  buildOrderQuotaSnapshot,
  calculateExtendedDataLimitBytes,
  resolveRemainingKeyLimitBytes,
  switchOrderProtocol,
} from "../services/subscriptionProvisionService.js";

const GB = 1024 * 1024 * 1024;

describe("subscription quota calculations", () => {
  it("rejects protocol changes on retired provider rows", async () => {
    await expect(switchOrderProtocol({
      order: { id: "legacy-order" },
      oldKey: { id: "legacy-key", outline_key_id: "42" },
      server: { id: "legacy", panel_type: "outline" },
      protocol: "vless",
    })).rejects.toThrow("not a Marzneshin server");
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

  it("excludes historical usage before the current package baseline", () => {
    const quota = buildOrderQuotaSnapshot(
      [
        { status: "deleted", data_limit_bytes: 200 * GB, used_bytes: 168 * GB },
        { status: "deleted", data_limit_bytes: 300 * GB, used_bytes: 60 * GB },
        { status: "active", data_limit_bytes: 240 * GB, used_bytes: 7 * GB },
      ],
      {
        usage_baseline_bytes: 168 * GB,
        quota_limit_bytes: 300 * GB,
      }
    );

    expect(quota.rawTotalUsedBytes).toBe(235 * GB);
    expect(quota.totalUsedBytes).toBe(67 * GB);
    expect(quota.totalAllowanceBytes).toBe(300 * GB);
    expect(quota.remainingBytes).toBe(233 * GB);
  });

  it("clamps a baseline above recorded lifetime usage to zero", () => {
    const quota = buildOrderQuotaSnapshot(
      [{ status: "active", data_limit_bytes: 50 * GB, used_bytes: 2 * GB }],
      { usage_baseline_bytes: 3 * GB, quota_limit_bytes: 50 * GB }
    );

    expect(quota.totalUsedBytes).toBe(0);
    expect(quota.remainingBytes).toBe(50 * GB);
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
