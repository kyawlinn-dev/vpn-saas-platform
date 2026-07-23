import { describe, expect, it } from "vitest";
import { deriveManualOrderPolicy } from "../services/manualOrderPolicy.js";

describe("deriveManualOrderPolicy", () => {
  it("creates confirmed paid dashboard purchases", () => {
    expect(
      deriveManualOrderPolicy({ plan: { is_trial: false }, requestedPaymentStatus: "paid" })
    ).toEqual({
      source: "dashboard",
      orderType: "purchase",
      paymentStatus: "paid",
      reviewStatus: "confirmed",
    });
  });

  it("keeps unpaid purchases pending review", () => {
    expect(
      deriveManualOrderPolicy({ plan: { is_trial: false }, requestedPaymentStatus: "unpaid" })
    ).toMatchObject({
      orderType: "purchase",
      paymentStatus: "unpaid",
      reviewStatus: "pending_review",
    });
  });

  it("does not accept arbitrary payment states on creation", () => {
    expect(
      deriveManualOrderPolicy({ plan: { is_trial: false }, requestedPaymentStatus: "refunded" })
    ).toMatchObject({ paymentStatus: "unpaid", reviewStatus: "pending_review" });
  });

  it("derives trial accounting from the plan", () => {
    expect(
      deriveManualOrderPolicy({ plan: { is_trial: true }, requestedPaymentStatus: "unpaid" })
    ).toEqual({
      source: "dashboard",
      orderType: "trial",
      paymentStatus: "paid",
      reviewStatus: "confirmed",
    });
  });
});
