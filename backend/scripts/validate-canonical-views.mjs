#!/usr/bin/env node
/**
 * Validate the Phase 3 canonical views (migration 0023) against DEV.
 *
 * Seeds an order with 2 confirmed+applied payments, 1 pending payment, and an
 * active VLESS key on a customer whose protocol_preference is 'shadowsocks'.
 * Then asserts order_view derives money from the confirmed payments only,
 * derives protocol from the ACTIVE KEY (not the preference), and exposes
 * consistent display_name. Also checks customer_view and server_view. Cleans up.
 *
 * SAFETY: refuses to run unless SUPABASE_URL is the known DEV project.
 * Run AFTER applying 0023 (and NOTIFY pgrst 'reload schema' if needed):
 *   node backend/scripts/validate-canonical-views.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV = "huqmzvlzfcexycdrsxpn";
if (!URL || !KEY) { console.error("✗ Missing SUPABASE_URL / SERVICE_ROLE_KEY"); process.exit(1); }
if (!URL.includes(DEV)) { console.error(`✗ Not the dev project (${DEV}); refusing.`); process.exit(1); }

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
const TAG = `viewtest-${Date.now()}`;
const created = { server: null, reseller: null, customer: null, plan: null, order: null, keys: [], payments: [] };

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

async function setup() {
  console.log("\n[setup] seeding fixtures…");
  const reseller = (await supabase.from("resellers").insert({ name: `${TAG}-reseller`, commission_percent: 10, status: "active" }).select("id").single());
  if (reseller.error) throw new Error(`reseller: ${reseller.error.message}`);
  created.reseller = reseller.data.id;

  // Preference deliberately shadowsocks — the active key will be vless.
  const customer = (await supabase.from("vpn_customers").insert({ reseller_id: created.reseller, full_name: `${TAG}-Jane`, status: "active", customer_type: "normal", protocol_preference: "shadowsocks" }).select("id").single());
  if (customer.error) throw new Error(`customer: ${customer.error.message}`);
  created.customer = customer.data.id;

  const plan = (await supabase.from("vpn_plans").insert({ name: `${TAG}-plan`, price_mmk: 1000, data_limit_gb: 10, duration_days: 30, max_devices: 1, is_active: false, is_trial: false, features: [], sort_order: 999 }).select("id").single());
  if (plan.error) throw new Error(`plan: ${plan.error.message}`);
  created.plan = plan.data.id;

  const server = (await supabase.from("vpn_servers").insert({ name: `${TAG}-server`, provider: "digitalocean", region: "test", status: "active", max_active_keys: 5, current_active_keys: 0, is_default: false, sort_order: 999, panel_type: "marzneshin", server_tier: "premium" }).select("id").single());
  if (server.error) throw new Error(`server: ${server.error.message}`);
  created.server = server.data.id;

  const order = (await supabase.from("vpn_orders").insert({ customer_id: created.customer, reseller_id: created.reseller, plan_id: created.plan, status: "active", price_mmk: 1000, commission_percent: 10, commission_amount_mmk: 0, total_paid_mmk: 0, payment_status: "paid", order_type: "purchase", review_status: "confirmed" }).select("id").single());
  if (order.error) throw new Error(`order: ${order.error.message}`);
  created.order = order.data.id;

  // Active key: protocol vless (should win over the shadowsocks preference).
  const key = (await supabase.from("vpn_keys").insert({ order_id: created.order, customer_id: created.customer, reseller_id: created.reseller, server_id: created.server, key_name: `${TAG}-key`, access_url: "https://panel.example/sub/view1", used_bytes: 0, status: "active", protocol: "vless" }).select("id").single());
  if (key.error) throw new Error(`key: ${key.error.message}`);
  created.keys.push(key.data.id);

  // 2 confirmed+applied payments (count) + 1 pending (excluded).
  const pay = async (amount, comm, plat, review, apply) => {
    const r = await supabase.from("order_payments").insert({
      order_id: created.order, customer_id: created.customer, reseller_id: created.reseller,
      amount_mmk: amount, commission_percent: 10, commission_amount_mmk: comm, platform_due_mmk: plat,
      review_status: review, apply_status: apply, payment_type: "initial",
    }).select("id").single();
    if (r.error) throw new Error(`payment: ${r.error.message}`);
    created.payments.push(r.data.id);
  };
  await pay(1000, 100, 900, "confirmed", "applied");
  await pay(1000, 100, 900, "confirmed", "applied");
  await pay(500, 50, 450, "pending_review", "pending"); // excluded from totals
  console.log(`[setup] done. order=${created.order}`);
}

async function run() {
  console.log("\n[order_view] derived money + protocol + display names");
  const { data: ov, error } = await supabase.from("order_view").select("*").eq("id", created.order).single();
  if (error && /(does not exist|schema cache|find the table|relation)/i.test(error.message || "")) {
    console.log("\n  ⚠ order_view not found — apply 0023 and NOTIFY pgrst 'reload schema', then re-run.");
    throw new Error("views not present — apply 0023 first");
  }
  check("order_view row returned", !error && !!ov, error?.message);
  if (ov) {
    check("total_paid_mmk = 2000 (2 confirmed, pending excluded)", ov.total_paid_mmk === 2000, `got ${ov.total_paid_mmk}`);
    check("commission_amount_mmk = 200 (confirmed only)", ov.commission_amount_mmk === 200, `got ${ov.commission_amount_mmk}`);
    check("platform_due_mmk = 1800 (confirmed only)", ov.platform_due_mmk === 1800, `got ${ov.platform_due_mmk}`);
    check("protocol = 'vless' (from active key, NOT the shadowsocks preference)", ov.protocol === "vless", `got ${ov.protocol}`);
    check("active_key_access_url is the key's url", ov.active_key_access_url === "https://panel.example/sub/view1");
    check("customer_display_name = full_name", ov.customer_display_name === `${TAG}-Jane`, `got ${ov.customer_display_name}`);
    check("reseller_display_name = reseller name", ov.reseller_display_name === `${TAG}-reseller`);
    check("plan_name present", ov.plan_name === `${TAG}-plan`);
  }

  console.log("\n[customer_view] display_name + active order");
  const cv = await supabase.from("customer_view").select("*").eq("id", created.customer).single();
  check("customer_view row returned", !cv.error && !!cv.data, cv.error?.message);
  if (cv.data) {
    check("display_name = full_name", cv.data.display_name === `${TAG}-Jane`);
    check("active_order_id = our active order", cv.data.active_order_id === created.order);
  }

  console.log("\n[server_view] live key count cross-check");
  const sv = await supabase.from("server_view").select("*").eq("id", created.server).single();
  check("server_view row returned", !sv.error && !!sv.data, sv.error?.message);
  if (sv.data) {
    check("live_active_key_count = 1", sv.data.live_active_key_count === 1, `got ${sv.data.live_active_key_count}`);
    check("current_active_keys matches live count", sv.data.current_active_keys === sv.data.live_active_key_count, `col=${sv.data.current_active_keys} live=${sv.data.live_active_key_count}`);
  }
}

async function cleanup() {
  console.log("\n[cleanup] removing fixtures…");
  if (created.order) {
    await supabase.from("order_payments").delete().eq("order_id", created.order);
    await supabase.from("vpn_keys").delete().eq("order_id", created.order);
    await supabase.from("vpn_orders").delete().eq("id", created.order);
  }
  if (created.customer) await supabase.from("vpn_customers").delete().eq("id", created.customer);
  if (created.plan) await supabase.from("vpn_plans").delete().eq("id", created.plan);
  if (created.reseller) await supabase.from("resellers").delete().eq("id", created.reseller);
  if (created.server) await supabase.from("vpn_servers").delete().eq("id", created.server);
  console.log("[cleanup] done.");
}

async function main() {
  console.log(`Canonical views validation against DEV (${DEV}) — tag ${TAG}`);
  try { await setup(); await run(); }
  catch (e) { console.error(`\n✗ FATAL: ${e.message}`); failed++; }
  finally { try { await cleanup(); } catch (e) { console.error(`cleanup error: ${e.message}`); } }
  console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
