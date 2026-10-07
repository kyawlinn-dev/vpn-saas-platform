import { describe, expect, it } from "vitest";
import { getPurchaseBlockReason } from "../services/purchaseQueuePolicy.js";

describe("purchase queue eligibility", () => {
  it("allows a first purchase and a queue behind a confirmed purchase", () => {
    expect(getPurchaseBlockReason(null, null)).toBeNull();
    expect(getPurchaseBlockReason({ review_status: "confirmed" }, null)).toBeNull();
  });

  it("blocks a queue until the current payment is confirmed", () => {
    expect(getPurchaseBlockReason({ review_status: "pending_review" }, null))
      .toBe("PURCHASE_UNDER_REVIEW");
  });

  it("blocks a second queued package even when there is no active order", () => {
    expect(getPurchaseBlockReason(null, { id: "queued" })).toBe("QUEUED_PACKAGE_EXISTS");
    expect(getPurchaseBlockReason({ review_status: "confirmed" }, { id: "queued" }))
      .toBe("QUEUED_PACKAGE_EXISTS");
  });
});
