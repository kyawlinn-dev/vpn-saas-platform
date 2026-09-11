import { describe, expect, it } from "vitest";
import {
  buildOrderQuotaSnapshot,
  calculateExtendedDataLimitBytes,
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
