import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePaymentStatus } from "../src/lib/paymentStatus.js";

describe("payment status after checkout", () => {
  const activePlan = {
    plan_name: "Old Plan",
    status: "active",
    review_status: "confirmed",
    duration_days: 30,
  };

  it("shows the submitted queued order rather than the existing active plan", () => {
    const status = resolvePaymentStatus(
      { subscription: activePlan },
      { name: "New Plan", price_mmk: 11000, duration_days: 90 },
      {
        is_queued: true,
        order: {
          status: "scheduled",
          review_status: "pending_review",
          price_mmk: 11000,
          plan: { name: "New Plan", duration_days: 90 },
        },
      },
    );

    assert.equal(status.planName, "New Plan");
    assert.equal(status.durationDays, 90);
    assert.equal(status.isQueued, true);
    assert.equal(status.isPending, true);
    assert.equal(status.isApproved, false);
  });

  it("shows pending review for an immediately active submitted order", () => {
    const status = resolvePaymentStatus(
      { subscription: activePlan },
      { name: "New Plan" },
      { order: { status: "active", review_status: "pending_review", plan: { name: "New Plan" } } },
    );

    assert.equal(status.planName, "New Plan");
    assert.equal(status.isPending, true);
    assert.equal(status.isApproved, false);
  });

  it("recognizes a confirmed scheduled package without claiming current access", () => {
    const status = resolvePaymentStatus(null, null, {
      is_queued: true,
      order: { status: "scheduled", review_status: "confirmed" },
    });

    assert.equal(status.isQueuedConfirmed, true);
    assert.equal(status.isApproved, false);
  });
});

it('receipt keeps review separate from active access',()=>{const result=resolvePaymentStatus(null,null,{order:{id:'o',status:'active',review_status:'pending_review'}});assert.equal(result.accessStatus,'active');assert.equal(result.reviewStatus,'awaiting_review');});
it('fresh matching queue review replaces stale checkout without replacing it with unrelated current access',()=>{const result=resolvePaymentStatus({subscription:{order_id:'active',status:'active',review_status:'confirmed'},queued_subscription:{order_id:'queue',status:'scheduled',review_status:'confirmed'}},null,{is_queued:true,order:{id:'queue',status:'scheduled',review_status:'pending_review'}});assert.equal(result.isQueuedConfirmed,true);assert.equal(result.isPending,false);assert.equal(result.accessStatus,'queued');});
it('promotion changes receipt access without asking for another payment',()=>{const result=resolvePaymentStatus({subscription:{order_id:'queue',status:'active',review_status:'confirmed'}},null,{is_queued:true,order:{id:'queue',status:'scheduled',review_status:'pending_review'}});assert.equal(result.isQueued,false);assert.equal(result.isApproved,true);});
it('uses the recorded submitted amount before snapshotted or catalogue price',()=>{assert.equal(resolvePaymentStatus(null,{price_mmk:9000},{order:{amount_mmk:4500,price_mmk:5000}}).priceMmk,4500);});
