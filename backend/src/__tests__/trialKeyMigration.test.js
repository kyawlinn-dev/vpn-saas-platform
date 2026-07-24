import { describe, expect, it } from "vitest";
import {
  keyUsageForMigration,
  replacementDataLimitBytesForMigration,
} from "../services/trialKeyMigrationService.js";

const GB = 1024 * 1024 * 1024;

describe("trial key migration quota calculations", () => {
  it("keeps only the remaining quota on the replacement key", () => {
    const replacementLimit = replacementDataLimitBytesForMigration([
      {
        id: "old-trial-key",
        outline_key_id: "1",
        status: "active",
        data_limit_bytes: 5 * GB,
        used_bytes: 1 * GB,
      },
    ]);

    expect(replacementLimit).toBe(4 * GB);
  });

  it("uses live Outline usage when it is higher than stored usage", () => {
    const replacementLimit = replacementDataLimitBytesForMigration(
      [
        {
          id: "old-trial-key",
          outline_key_id: "7",
          status: "active",
          data_limit_bytes: 5 * GB,
          used_bytes: 1 * GB,
        },
      ],
      { 7: 2 * GB }
    );

    expect(replacementLimit).toBe(3 * GB);
  });

  it("keeps a minimal limit when the trial quota is already consumed", () => {
    const replacementLimit = replacementDataLimitBytesForMigration(
      [
        {
          id: "old-trial-key",
          outline_key_id: "9",
          status: "active",
          data_limit_bytes: 5 * GB,
          used_bytes: 4 * GB,
        },
      ],
      { 9: 6 * GB }
    );

    expect(replacementLimit).toBe(1);
  });

  it("keeps unlimited trial keys unlimited if historical data has that shape", () => {
    const replacementLimit = replacementDataLimitBytesForMigration([
      {
        id: "old-trial-key",
        outline_key_id: "11",
        status: "active",
        data_limit_bytes: null,
        used_bytes: 1 * GB,
      },
    ]);

    expect(replacementLimit).toBeNull();
  });

  it("picks the safer larger value between stored and live usage", () => {
    expect(
      keyUsageForMigration(
        {
          outline_key_id: "12",
          used_bytes: 3 * GB,
        },
        { 12: 2 * GB }
      )
    ).toBe(3 * GB);
  });
});
