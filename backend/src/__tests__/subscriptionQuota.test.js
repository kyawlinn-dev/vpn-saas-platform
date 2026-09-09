import { describe, expect, it } from "vitest";
import {
  buildOrderQuotaSnapshot,
  calculateExtendedDataLimitBytes,
  pickMigrationDataLimitBytes,
} from "../services/subscriptionProvisionService.js";

const GB = 1024 * 1024 * 1024;

describe("subscription quota calculations", () => {
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
});

describe("pickMigrationDataLimitBytes — server migration keeps remaining, not full plan", () => {
  const PLAN_GB = 100;

  it("carries the order's remaining balance (not the full plan)", () => {
    const snapshot = buildOrderQuotaSnapshot([
      { id: "old", status: "deleted", data_limit_bytes: 100 * GB, used_bytes: 70 * GB },
      { id: "cur", status: "active", data_limit_bytes: 30 * GB, used_bytes: 0 },
    ]);
    expect(pickMigrationDataLimitBytes({ snapshot, planDataLimitGb: PLAN_GB })).toBe(30 * GB);
  });

  it("honours an explicit carryRemainingBytes when the old key was already retired", () => {
    expect(
      pickMigrationDataLimitBytes({ snapshot: null, planDataLimitGb: PLAN_GB, carryRemainingBytes: 12345 })
    ).toBe(12345);
  });

  it("carryRemainingBytes null => unlimited", () => {
    expect(
      pickMigrationDataLimitBytes({ snapshot: null, planDataLimitGb: PLAN_GB, carryRemainingBytes: null })
    ).toBeNull();
  });

  it("keeps an unlimited order unlimited", () => {
    const snapshot = buildOrderQuotaSnapshot([
      { id: "cur", status: "active", data_limit_bytes: null, used_bytes: 0 },
    ]);
    expect(pickMigrationDataLimitBytes({ snapshot, planDataLimitGb: PLAN_GB })).toBeNull();
  });

  it("falls back to the full plan only when the order has no resolvable balance", () => {
    const snapshot = buildOrderQuotaSnapshot([]); // orphaned order, no keys
    expect(pickMigrationDataLimitBytes({ snapshot, planDataLimitGb: PLAN_GB })).toBe(100 * GB);
  });

  it("never returns 0 for a spent balance", () => {
    const snapshot = buildOrderQuotaSnapshot([
      { id: "old", status: "deleted", data_limit_bytes: 100 * GB, used_bytes: 100 * GB },
      { id: "cur", status: "active", data_limit_bytes: 1, used_bytes: 0 },
    ]);
    expect(pickMigrationDataLimitBytes({ snapshot, planDataLimitGb: PLAN_GB })).toBeGreaterThanOrEqual(1);
  });
});
