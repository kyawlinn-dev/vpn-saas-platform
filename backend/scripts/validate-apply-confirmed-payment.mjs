#!/usr/bin/env node
/**
 * Validate the Batch B apply_confirmed_payment RPC (migration 0022) against DEV.
 *
 * Seeds an order with 2 pending payments + 1 already-confirmed payment, calls
 * the RPC, and asserts: pending payments become confirmed+applied with correct
 * floor(amount*pct/100) commission, the order's cached totals sum ONLY
 * confirmed+applied payments, review/payment status are right, the tenant guard
 * rejects a wrong reseller, and a second call is idempotent. Cleans up.
 *
 * SAFETY: refuses to run unless SUPABASE_URL is the known DEV project.
 * Run AFTER applying 0022 (+ NOTIFY pgrst 'reload schema'):
 *   node backend/scripts/validate-apply-confirmed-payment.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { randomUUID } from "crypto";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV = "huqmzvlzfcexycdrsxpn";
if (!URL || !KEY) { console.error("✗ Missing SUPABASE_URL / SERVICE_ROLE_KEY"); process.exit(1); }
if (!URL.includes(DEV)) { console.error(`✗ Not the dev project (${DEV}); refusing.`); process.exit(1); }

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
const TAG = `paytest-${Date.now()}`;
const created = { reseller: null, customer: null, plan: null, order: null, payments: [] };

let passed = 0, failed = 0;
const check = (n, ok, d = "") => { if (ok) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ""}`); } };

async function order() {
  const { data } = await supabase.from("vpn_orders").select("total_paid_mmk, commission_amount_mmk, payment_status, review_status").eq("id", created.order).single();
  return data;
}
async function payment(id) {
  const { data } = await supabase.from("order_payments").select("*").eq("id", id).single();
  return data;
}

async function addPayment(amount, pct, comm, plat, review, apply) {
  const r = await supabase.from("order_payments").insert({
    order_id: created.order, customer_id: created.customer, reseller_id: created.reseller,
    amount_mmk: amount, commission_percent: pct, commission_amount_mmk: comm, platform_due_mmk: plat,
    review_status: review, apply_status: apply, payment_type: "initial",
  }).select("id").single();
  if (r.error) throw new Error(`payment: ${r.error.message}`);
  created.payments.push(r.data.id);
  return r.data.id;
}

async function setup() {
  console.log("\n[setup] seeding fixtures…");
  const reseller = await supabase.from("resellers").insert({ name: `${TAG}-reseller`, commission_percent: 10, status: "active" }).select("id").single();
  if (reseller.error) throw new Error(`reseller: ${reseller.error.message}`);
  created.reseller = reseller.data.id;
  const customer = await supabase.from("vpn_customers").insert({ reseller_id: created.reseller, full_name: `${TAG}-cust`, status: "active", customer_type: "normal" }).select("id").single();
  if (customer.error) throw new Error(`customer: ${customer.error.message}`);
  created.customer = customer.data.id;
  const plan = await supabase.from("vpn_plans").insert({ name: `${TAG}-plan`, price_mmk: 1000, data_limit_gb: 10, duration_days: 30, max_devices: 1, is_active: false, is_trial: false, features: [], sort_order: 999 }).select("id").single();
  if (plan.error) throw new Error(`plan: ${plan.error.message}`);
  created.plan = plan.data.id;
  const ord = await supabase.from("vpn_orders").insert({ customer_id: created.customer, reseller_id: created.reseller, plan_id: created.plan, status: "active", price_mmk: 1000, commission_percent: 10, commission_amount_mmk: 0, total_paid_mmk: 0, payment_status: "unpaid", order_type: "purchase", review_status: "pending_review" }).select("id").single();
  if (ord.error) throw new Error(`order: ${ord.error.message}`);
  created.order = ord.data.id;

  // 2 pending (to be confirmed by the RPC) + 1 already confirmed+applied.
  created.p1 = await addPayment(1000, 10, 0, 0, "pending_review", "pending");
  created.p2 = await addPayment(2000, 10, 0, 0, "pending_review", "pending");
  created.p3 = await addPayment(500, 10, 50, 450, "confirmed", "applied");
  console.log(`[setup] done. order=${created.order}`);
}

async function run() {
  console.log("\n[1] apply_confirmed_payment — confirm+apply pending, recompute order");
  // Reviewer must be a real reseller (FK order_payments.reviewed_by_reseller_id).
  const rev = created.reseller;
  const { error } = await supabase.rpc("apply_confirmed_payment", {
    p_order_id: created.order, p_reseller_id: created.reseller,
    p_reviewer_reseller_id: rev, p_reviewer_admin_id: null,
  });
  if (error && /could not find|schema cache|does not exist/i.test(error.message || "")) {
    console.log("\n  ⚠ 0022 not applied. Apply it + NOTIFY pgrst 'reload schema', then re-run.");
    throw new Error("apply_confirmed_payment not present — apply 0022 first");
  }
  check("RPC returned no error", !error, error?.message);

  const p1 = await payment(created.p1);
  check("p1 now confirmed", p1.review_status === "confirmed");
  check("p1 now applied", p1.apply_status === "applied");
  check("p1 commission = floor(1000*10/100) = 100", p1.commission_amount_mmk === 100, `got ${p1.commission_amount_mmk}`);
  check("p1 platform_due = 900", p1.platform_due_mmk === 900, `got ${p1.platform_due_mmk}`);
  check("p1 reviewer recorded", p1.reviewed_by_reseller_id === rev);

  const p2 = await payment(created.p2);
  check("p2 commission = floor(2000*10/100) = 200", p2.commission_amount_mmk === 200, `got ${p2.commission_amount_mmk}`);

  const o = await order();
  check("order total_paid = 3500 (1000+2000+500)", o.total_paid_mmk === 3500, `got ${o.total_paid_mmk}`);
  check("order commission = 350 (100+200+50)", o.commission_amount_mmk === 350, `got ${o.commission_amount_mmk}`);
  check("order payment_status = paid", o.payment_status === "paid");
  check("order review_status = confirmed (no pending left)", o.review_status === "confirmed", `got ${o.review_status}`);

  console.log("\n[2] tenant guard — wrong reseller rejected");
  const g = await supabase.rpc("apply_confirmed_payment", {
    p_order_id: created.order, p_reseller_id: randomUUID(), p_reviewer_reseller_id: null, p_reviewer_admin_id: null,
  });
  check("wrong reseller rejected", !!g.error && /does not belong/i.test(g.error.message || ""), g.error?.message || "no error");

  console.log("\n[3] idempotent — second call leaves totals unchanged");
  const again = await supabase.rpc("apply_confirmed_payment", {
    p_order_id: created.order, p_reseller_id: created.reseller, p_reviewer_reseller_id: rev, p_reviewer_admin_id: null,
  });
  check("second call no error", !again.error, again.error?.message);
  const o2 = await order();
  check("total_paid still 3500", o2.total_paid_mmk === 3500, `got ${o2.total_paid_mmk}`);
  check("commission still 350", o2.commission_amount_mmk === 350, `got ${o2.commission_amount_mmk}`);
}

async function cleanup() {
  console.log("\n[cleanup] removing fixtures…");
  if (created.order) {
    await supabase.from("order_payments").delete().eq("order_id", created.order);
    await supabase.from("vpn_orders").delete().eq("id", created.order);
  }
  if (created.customer) await supabase.from("vpn_customers").delete().eq("id", created.customer);
  if (created.plan) await supabase.from("vpn_plans").delete().eq("id", created.plan);
  if (created.reseller) await supabase.from("resellers").delete().eq("id", created.reseller);
  console.log("[cleanup] done.");
}

async function main() {
  console.log(`apply_confirmed_payment validation against DEV (${DEV}) — tag ${TAG}`);
  try { await setup(); await run(); }
  catch (e) { console.error(`\n✗ FATAL: ${e.message}`); failed++; }
  finally { try { await cleanup(); } catch (e) { console.error(`cleanup error: ${e.message}`); } }
  console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
