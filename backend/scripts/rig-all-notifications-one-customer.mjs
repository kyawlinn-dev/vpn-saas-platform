// Dev-only helper: rig all 6 customer-notification triggers against ONE
// customer ("NovaNet MM Support", the reseller's own test Telegram account)
// so every notification type lands in a single chat to review/polish
// end-to-end, instead of being spread across 3 different test customers
// like rig-notification-triggers.mjs does.
//
//   node --env-file=.env.local scripts/rig-all-notifications-one-customer.mjs apply
//   node --env-file=.env.local scripts/rig-all-notifications-one-customer.mjs undo
//
// "apply" backs up original state to rig-all-state.json before mutating.
// "undo" restores from rig-all-state.json and deletes every synthetic row.
//
// Scenarios rigged, all on customer_id = NovaNet MM Support:
//   1. trial_ending_24h    — flip their existing (stopped) trial order to
//                            active, expiry_date -> today+1
//   2. trial_expired       — insert a SECOND synthetic trial order,
//                            expiry_date -> today (can't reuse #1's row,
//                            one expiry_date per row)
//   3. subscription_expiring_3d — insert a synthetic purchase order,
//                            expiry_date -> today+3
//   4. subscription_expired     — insert a synthetic purchase order,
//                            expiry_date -> today
//   5. payment_confirmed   — insert a fake order_payments row (confirmed)
//                            on their real active purchase order
//   6. payment_rejected    — insert a second fake order_payments row
//                            (rejected) on the same order — dedup is per
//                            event_type, so both fire independently

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, "rig-all-state.json");
const MODE = process.argv[2]; // apply | undo

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

if (!/huqmzvlzfcexycdrsxpn/.test(process.env.SUPABASE_URL || "")) {
  console.error("⛔ Refusing — not the known dev project. Use --env-file=.env.local");
  process.exit(1);
}

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
  console.log("=== APPLY: rigging all 6 notification triggers on one customer ===\n");

  const { data: customer, error: custErr } = await supabase
    .from("vpn_customers")
    .select("id, full_name, reseller_id")
    .eq("full_name", "NovaNet MM Support")
    .maybeSingle();
  if (custErr || !customer) {
    console.error("Could not find 'NovaNet MM Support' customer.", custErr?.message);
    process.exit(1);
  }

  const { data: orders } = await supabase
    .from("vpn_orders")
    .select("id, order_type, status, expiry_date")
    .eq("customer_id", customer.id);

  const existingTrial = orders.find((o) => o.order_type === "trial");
  const existingPurchase = orders.find((o) => o.order_type === "purchase" && o.status === "active");

  if (!existingTrial || !existingPurchase) {
    console.error("Expected both an existing trial order and an active purchase order. Found:", orders);
    process.exit(1);
  }

  const { data: trialPlan } = await supabase
    .from("vpn_plans").select("id").eq("is_trial", true).eq("is_active", true).limit(1).maybeSingle();
  const { data: paidPlan } = await supabase
    .from("vpn_plans").select("id").eq("is_trial", false).eq("is_active", true).limit(1).maybeSingle();

  const state = {
    customer_id: customer.id,
    trial_order: { id: existingTrial.id, original_status: existingTrial.status, original_expiry_date: existingTrial.expiry_date },
    fake_order_ids: [],
    fake_payment_ids: [],
  };

  // 1. trial_ending_24h — flip existing trial order to active, expiry+1
  const t1 = yangonDate(1);
  await supabase.from("vpn_orders").update({ status: "active", expiry_date: t1 }).eq("id", existingTrial.id);
  console.log(`✓ trial_ending_24h: trial order ${existingTrial.id.slice(0,8)} -> active, expiry ${t1}`);

  // 2. trial_expired — synthetic second trial order, expiry today
  const t0 = yangonDate(0);
  const { data: trialExpiredOrder, error: e1 } = await supabase
    .from("vpn_orders")
    .insert({
      customer_id: customer.id, reseller_id: customer.reseller_id, plan_id: trialPlan.id,
      status: "active", price_mmk: 0, commission_percent: 0, commission_amount_mmk: 0,
      start_date: yangonDate(-7), expiry_date: t0, payment_status: "unpaid",
      order_type: "trial", review_status: "confirmed", source: "dashboard",
    })
    .select("id").single();
  if (e1) console.log(`  ⚠️  trial_expired insert failed: ${e1.message}`);
  else { state.fake_order_ids.push(trialExpiredOrder.id); console.log(`✓ trial_expired: synthetic trial order ${trialExpiredOrder.id.slice(0,8)}, expiry ${t0}`); }

  // 3. subscription_expiring_3d — synthetic purchase order, expiry+3
  const t3 = yangonDate(3);
  const { data: expiring3d, error: e2 } = await supabase
    .from("vpn_orders")
    .insert({
      customer_id: customer.id, reseller_id: customer.reseller_id, plan_id: paidPlan.id,
      status: "active", price_mmk: 0, commission_percent: 0, commission_amount_mmk: 0,
      start_date: yangonDate(-27), expiry_date: t3, payment_status: "paid",
      activated_at: new Date().toISOString(), total_paid_mmk: 0,
      order_type: "purchase", review_status: "confirmed", source: "dashboard",
    })
    .select("id").single();
  if (e2) console.log(`  ⚠️  subscription_expiring_3d insert failed: ${e2.message}`);
  else { state.fake_order_ids.push(expiring3d.id); console.log(`✓ subscription_expiring_3d: synthetic purchase order ${expiring3d.id.slice(0,8)}, expiry ${t3}`); }

  // 4. subscription_expired — synthetic purchase order, expiry today
  const { data: expiredOrder, error: e3 } = await supabase
    .from("vpn_orders")
    .insert({
      customer_id: customer.id, reseller_id: customer.reseller_id, plan_id: paidPlan.id,
      status: "active", price_mmk: 0, commission_percent: 0, commission_amount_mmk: 0,
      start_date: yangonDate(-30), expiry_date: t0, payment_status: "paid",
      activated_at: new Date().toISOString(), total_paid_mmk: 0,
      order_type: "purchase", review_status: "confirmed", source: "dashboard",
    })
    .select("id").single();
  if (e3) console.log(`  ⚠️  subscription_expired insert failed: ${e3.message}`);
  else { state.fake_order_ids.push(expiredOrder.id); console.log(`✓ subscription_expired: synthetic purchase order ${expiredOrder.id.slice(0,8)}, expiry ${t0}`); }

  // 5 & 6. payment_confirmed / payment_rejected — on the real active purchase order
  const nowIso = new Date().toISOString();
  const { data: confirmedPay, error: e4 } = await supabase
    .from("order_payments")
    .insert({
      order_id: existingPurchase.id, customer_id: customer.id, reseller_id: customer.reseller_id,
      amount_mmk: 5000, commission_percent: 0, review_status: "confirmed",
      payment_method: "test", reviewed_at: nowIso,
    })
    .select("id").single();
  if (e4) console.log(`  ⚠️  payment_confirmed insert failed: ${e4.message}`);
  else { state.fake_payment_ids.push(confirmedPay.id); console.log(`✓ payment_confirmed: fake payment on order ${existingPurchase.id.slice(0,8)}`); }

  const { data: rejectedPay, error: e5 } = await supabase
    .from("order_payments")
    .insert({
      order_id: existingPurchase.id, customer_id: customer.id, reseller_id: customer.reseller_id,
      amount_mmk: 5000, commission_percent: 0, review_status: "rejected",
      payment_method: "test", payment_note: "လွှဲပြောင်းငွေပမာဏ မကိုက်ညီပါ (TEST)", reviewed_at: nowIso,
    })
    .select("id").single();
  if (e5) console.log(`  ⚠️  payment_rejected insert failed: ${e5.message}`);
  else { state.fake_payment_ids.push(rejectedPay.id); console.log(`✓ payment_rejected: fake payment on order ${existingPurchase.id.slice(0,8)}`); }

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`\nState saved to ${STATE_PATH}`);
  console.log("\nRun: node --env-file=.env.local scripts/test-notifications.mjs   (to confirm eligibility)");
  console.log("Then fire the pass via the admin endpoint, or wait for the 10-min tick.");
  console.log("\nWhen done: node --env-file=.env.local scripts/rig-all-notifications-one-customer.mjs undo");
}

async function undo() {
  console.log("=== UNDO: restoring original state ===\n");
  if (!fs.existsSync(STATE_PATH)) {
    console.log("No rig-all-state.json found — nothing to undo.");
    return;
  }
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));

  await supabase.from("vpn_orders")
    .update({ status: state.trial_order.original_status, expiry_date: state.trial_order.original_expiry_date })
    .eq("id", state.trial_order.id);
  console.log(`✓ Restored trial order ${state.trial_order.id.slice(0,8)} -> status=${state.trial_order.original_status}, expiry=${state.trial_order.original_expiry_date}`);

  if (state.fake_order_ids?.length) {
    const { error } = await supabase.from("vpn_orders").delete().in("id", state.fake_order_ids);
    if (error) console.log(`  ⚠️  failed to delete fake orders: ${error.message}`);
    else console.log(`✓ Deleted ${state.fake_order_ids.length} synthetic vpn_orders row(s)`);
  }

  if (state.fake_payment_ids?.length) {
    const { error } = await supabase.from("order_payments").delete().in("id", state.fake_payment_ids);
    if (error) console.log(`  ⚠️  failed to delete fake payments: ${error.message}`);
    else console.log(`✓ Deleted ${state.fake_payment_ids.length} fake order_payments row(s)`);
  }

  console.log(`\nNote: notifications_sent rows are NOT cleared — delete manually if you want`);
  console.log(`to re-trigger the exact same events again:`);
  console.log(`  DELETE FROM notifications_sent WHERE customer_id = '${state.customer_id}';`);

  fs.unlinkSync(STATE_PATH);
  console.log("\nDone. Dev DB restored.");
}

if (MODE === "apply") await apply();
else if (MODE === "undo") await undo();
else {
  console.log("Usage:");
  console.log("  node --env-file=.env.local scripts/rig-all-notifications-one-customer.mjs apply");
  console.log("  node --env-file=.env.local scripts/rig-all-notifications-one-customer.mjs undo");
  process.exit(1);
}
