// Dev-only helper: fake 4 notification triggers against the 3 test customers
// under the Shadow VPN reseller (e51b3a9f-...) so we can verify the
// notification pipeline end-to-end without waiting for real dates.
//
//   node --env-file=.env.local scripts/rig-notification-triggers.mjs apply
//   node --env-file=.env.local scripts/rig-notification-triggers.mjs undo
//
// "apply" backs up original state to rig-state.json before mutating.
// "undo" restores from rig-state.json and deletes the fake payment rows.
//
// Scenarios rigged:
//   1. Kyaw Linn's trial expiry_date -> today+1  (trial_ending_24h)
//   2. NovaNet MM Support's trial expiry_date -> today  (trial_expired)
//   3. Insert a fake order_payments row (confirmed) for Linn's order (payment_confirmed)
//   4. Insert a fake order_payments row (rejected) for Linn's order (payment_rejected)
//      NOTE: 3 and 4 both target Linn's order since order_payments isn't
//      tied 1:1 to trial state — two payment rows on the same order is fine
//      for this test (dedup is per event_type + order_id, so both fire).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, "rig-state.json");
const MODE = process.argv[2]; // apply | undo

const RESELLER_ID = "e51b3a9f-dca4-450a-aeb4-147064420a88";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function yangonDate(offsetDays = 0) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const base = fmt.format(new Date());
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
}

async function apply() {
  console.log("=== APPLY: rigging fake triggers ===\n");

  const { data: orders } = await supabase
    .from("vpn_orders")
    .select("id, order_type, status, expiry_date, customer_id")
    .eq("reseller_id", RESELLER_ID);

  const { data: customers } = await supabase
    .from("vpn_customers")
    .select("id, full_name")
    .eq("reseller_id", RESELLER_ID);
  const nameById = new Map((customers || []).map((c) => [c.id, c.full_name]));

  const byName = (name) => orders.find((o) => nameById.get(o.customer_id) === name);
  const kyawLinn = byName("Kyaw Linn");
  const novanetSupport = byName("NovaNet MM Support");
  const linn = byName("Linn");

  if (!kyawLinn || !novanetSupport || !linn) {
    console.error("Could not find all 3 expected test customers. Aborting.");
    console.error("Found:", orders.map((o) => o.vpn_customers?.full_name));
    process.exit(1);
  }

  const state = {
    orders: [
      { id: kyawLinn.id, original_expiry_date: kyawLinn.expiry_date },
      { id: novanetSupport.id, original_expiry_date: novanetSupport.expiry_date },
    ],
    fake_payment_ids: [],
    fake_order_ids: [],
  };

  // 1. trial_ending_24h
  const target1 = yangonDate(1);
  await supabase.from("vpn_orders").update({ expiry_date: target1 }).eq("id", kyawLinn.id);
  console.log(`✓ Kyaw Linn order ${kyawLinn.id.slice(0,8)} expiry_date -> ${target1} (trial_ending_24h)`);

  // 2. trial_expired
  const target0 = yangonDate(0);
  await supabase.from("vpn_orders").update({ expiry_date: target0 }).eq("id", novanetSupport.id);
  console.log(`✓ NovaNet MM Support order ${novanetSupport.id.slice(0,8)} expiry_date -> ${target0} (trial_expired)`);

  // 3. payment_confirmed
  const nowIso = new Date().toISOString();
  const { data: confirmedPay, error: e1 } = await supabase
    .from("order_payments")
    .insert({
      order_id: linn.id,
      customer_id: linn.customer_id,
      reseller_id: RESELLER_ID,
      amount_mmk: 5000,
      commission_percent: 0,
      review_status: "confirmed",
      payment_method: "test",
      reviewed_at: nowIso,
    })
    .select("id")
    .single();
  if (e1) console.log(`  ⚠️  payment_confirmed insert failed: ${e1.message}`);
  else {
    state.fake_payment_ids.push(confirmedPay.id);
    console.log(`✓ Fake order_payments (confirmed) inserted for Linn's order (payment_confirmed)`);
  }

  // 4. payment_rejected — note: uses payment_note as the reason field
  // (order_payments has no reject_reason column; notificationService.js
  // reads payment_note and maps it to the {reject_reason} template var).
  const { data: rejectedPay, error: e2 } = await supabase
    .from("order_payments")
    .insert({
      order_id: linn.id,
      customer_id: linn.customer_id,
      reseller_id: RESELLER_ID,
      amount_mmk: 5000,
      commission_percent: 0,
      review_status: "rejected",
      payment_method: "test",
      payment_note: "လွှဲပြောင်းငွေပမာဏ မကိုက်ညီပါ (TEST)",
      reviewed_at: nowIso,
    })
    .select("id")
    .single();
  if (e2) console.log(`  ⚠️  payment_rejected insert failed: ${e2.message}`);
  else {
    state.fake_payment_ids.push(rejectedPay.id);
    console.log(`✓ Fake order_payments (rejected) inserted for Linn's order (payment_rejected)`);
  }

  // 5. subscription_expiring_3d — fresh purchase-type order on Linn, expires today+3
  // 6. subscription_expired — fresh purchase-type order on Kyaw Linn, expires today
  const { data: paidPlan } = await supabase
    .from("vpn_plans")
    .select("id, name")
    .eq("is_trial", false)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!paidPlan) {
    console.log("  ⚠️  no paid plan found — skipping subscription_expiring_3d / subscription_expired");
  } else {
    const nowIso2 = new Date().toISOString();
    const target3 = yangonDate(3);

    const { data: subExpiring, error: e3 } = await supabase
      .from("vpn_orders")
      .insert({
        customer_id: linn.customer_id,
        reseller_id: RESELLER_ID,
        plan_id: paidPlan.id,
        status: "active",
        price_mmk: 0,
        commission_percent: 0,
        commission_amount_mmk: 0,
        start_date: yangonDate(-27),
        expiry_date: target3,
        payment_status: "paid",
        activated_at: nowIso2,
        total_paid_mmk: 0,
        order_type: "purchase",
        review_status: "confirmed",
        source: "dashboard",
      })
      .select("id")
      .single();
    if (e3) console.log(`  ⚠️  subscription_expiring_3d order insert failed: ${e3.message}`);
    else {
      state.fake_order_ids.push(subExpiring.id);
      console.log(`✓ Fake purchase order ${subExpiring.id.slice(0,8)} for Linn, expiry_date -> ${target3} (subscription_expiring_3d)`);
    }

    const target0b = yangonDate(0);
    const { data: subExpired, error: e4 } = await supabase
      .from("vpn_orders")
      .insert({
        customer_id: kyawLinn.customer_id,
        reseller_id: RESELLER_ID,
        plan_id: paidPlan.id,
        status: "active",
        price_mmk: 0,
        commission_percent: 0,
        commission_amount_mmk: 0,
        start_date: yangonDate(-30),
        expiry_date: target0b,
        payment_status: "paid",
        activated_at: nowIso2,
        total_paid_mmk: 0,
        order_type: "purchase",
        review_status: "confirmed",
        source: "dashboard",
      })
      .select("id")
      .single();
    if (e4) console.log(`  ⚠️  subscription_expired order insert failed: ${e4.message}`);
    else {
      state.fake_order_ids.push(subExpired.id);
      console.log(`✓ Fake purchase order ${subExpired.id.slice(0,8)} for Kyaw Linn, expiry_date -> ${target0b} (subscription_expired)`);
    }
  }

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`\nState saved to ${STATE_PATH}`);
  console.log("\nNow run: node --env-file=.env.local scripts/test-notifications.mjs");
  console.log("to confirm all 4 event types show eligible matches.");
  console.log("\nThen trigger the real pass via the admin endpoint (see below),");
  console.log("or wait for the 10-min scheduled tick.");
  console.log("\nWhen done testing, run:");
  console.log("  node --env-file=.env.local scripts/rig-notification-triggers.mjs undo");
}

async function undo() {
  console.log("=== UNDO: restoring original state ===\n");
  if (!fs.existsSync(STATE_PATH)) {
    console.log("No rig-state.json found — nothing to undo.");
    return;
  }
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));

  for (const o of state.orders) {
    await supabase.from("vpn_orders").update({ expiry_date: o.original_expiry_date }).eq("id", o.id);
    console.log(`✓ Restored order ${o.id.slice(0,8)} expiry_date -> ${o.original_expiry_date}`);
  }

  if (state.fake_payment_ids?.length) {
    const { error } = await supabase.from("order_payments").delete().in("id", state.fake_payment_ids);
    if (error) console.log(`  ⚠️  failed to delete fake payments: ${error.message}`);
    else console.log(`✓ Deleted ${state.fake_payment_ids.length} fake order_payments row(s)`);
  }

  if (state.fake_order_ids?.length) {
    const { error } = await supabase.from("vpn_orders").delete().in("id", state.fake_order_ids);
    if (error) console.log(`  ⚠️  failed to delete fake orders: ${error.message}`);
    else console.log(`✓ Deleted ${state.fake_order_ids.length} fake vpn_orders row(s)`);
  }

  fs.unlinkSync(STATE_PATH);
  console.log("\nDone. Dev DB restored.");
  console.log("\nNote: notifications_sent rows from the test are NOT cleared —");
  console.log("delete manually if you want a fully clean slate:");
  console.log("  DELETE FROM notifications_sent WHERE customer_id IN (...);");
}

if (MODE === "apply") await apply();
else if (MODE === "undo") await undo();
else {
  console.log("Usage:");
  console.log("  node --env-file=.env.local scripts/rig-notification-triggers.mjs apply");
  console.log("  node --env-file=.env.local scripts/rig-notification-triggers.mjs undo");
  process.exit(1);
}
