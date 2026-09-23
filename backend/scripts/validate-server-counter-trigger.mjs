#!/usr/bin/env node
/**
 * Validate the Phase 2 server-counter trigger (migration 0021) against DEV.
 *
 * Proves that vpn_servers.current_active_keys is owned by the DB trigger:
 * it recomputes on every vpn_keys change and enforces max_active_keys — even
 * for DIRECT key writes that bypass the reserve/activate RPCs.
 *
 * Each test key goes on a DISTINCT order (same server) so the per-server
 * capacity check is what's exercised, not the per-(order,server) unique index.
 *
 * SAFETY: refuses to run unless SUPABASE_URL is the known DEV project.
 * Run AFTER applying 0021:
 *   node backend/scripts/validate-server-counter-trigger.mjs
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
const TAG = `ctrtest-${Date.now()}`;
const created = { server: null, reseller: null, customer: null, plan: null, orders: [], keys: [] };

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

async function counter() {
  const { data, error } = await supabase
    .from("vpn_servers").select("current_active_keys").eq("id", created.server).single();
  if (error) throw new Error(`read counter: ${error.message}`);
  return data.current_active_keys;
}

async function insertKey(name, status, orderId) {
  const { data, error } = await supabase.from("vpn_keys").insert({
    order_id: orderId, customer_id: created.customer, reseller_id: created.reseller,
    server_id: created.server, key_name: `${TAG}-${name}`, used_bytes: 0, status, protocol: "vless",
  }).select("id").single();
  if (!error && data) created.keys.push(data.id);
  return { id: data?.id, error };
}

async function setup() {
  console.log("\n[setup] creating throwaway fixtures…");
  const reseller = await supabase.from("resellers")
    .insert({ name: `${TAG}-reseller`, commission_percent: 10, status: "active" }).select("id").single();
  if (reseller.error) throw new Error(`reseller: ${reseller.error.message}`);
  created.reseller = reseller.data.id;

  const customer = await supabase.from("vpn_customers")
    .insert({ reseller_id: created.reseller, full_name: `${TAG}-cust`, status: "active", customer_type: "normal" })
    .select("id").single();
  if (customer.error) throw new Error(`customer: ${customer.error.message}`);
  created.customer = customer.data.id;

  const plan = await supabase.from("vpn_plans").insert({
    name: `${TAG}-plan`, price_mmk: 1000, data_limit_gb: 10, duration_days: 30,
    max_devices: 1, is_active: false, is_trial: false, features: [], sort_order: 999,
  }).select("id").single();
  if (plan.error) throw new Error(`plan: ${plan.error.message}`);
  created.plan = plan.data.id;

  const server = await supabase.from("vpn_servers").insert({
    name: `${TAG}-server`, provider: "digitalocean", region: "test", status: "active",
    max_active_keys: 2, current_active_keys: 0, is_default: false, sort_order: 999,
    panel_type: "marzneshin", server_tier: "premium",
  }).select("id").single();
  if (server.error) throw new Error(`server: ${server.error.message}`);
  created.server = server.data.id;

  // 4 distinct PENDING orders (vpn_orders unique index is on active only, so
  // multiple pending orders for one customer are fine). Each key gets its own
  // order → no per-(order,server) unique-index interference.
  for (let i = 0; i < 4; i++) {
    const order = await supabase.from("vpn_orders").insert({
      customer_id: created.customer, reseller_id: created.reseller, plan_id: created.plan,
      status: "pending", price_mmk: 1000, commission_percent: 10, commission_amount_mmk: 100,
      total_paid_mmk: 0, payment_status: "unpaid", order_type: "purchase", review_status: "confirmed",
    }).select("id").single();
    if (order.error) throw new Error(`order[${i}]: ${order.error.message}`);
    created.orders.push(order.data.id);
  }
  console.log(`[setup] done. server=${created.server}, ${created.orders.length} orders`);
}

async function run() {
  const [o0, o1, o2, o3] = created.orders;

  // 1. Direct active insert → trigger sets counter to 1 (fires on any write path).
  console.log("\n[1] direct insert (active) → trigger recomputes");
  const k1 = await insertKey("k1", "active", o0);
  if (/could not find|schema cache|does not exist/i.test(k1.error?.message || "")) {
    console.log("\n  ⚠ Migration 0021 not applied (trigger missing). Apply it, then re-run.");
    throw new Error("trigger not present — apply 0021 first");
  }
  check("active key inserted", !k1.error, k1.error?.message);
  check("counter == 1 after active insert", (await counter()) === 1);

  // 2. Pending insert (distinct order) also counts toward capacity.
  console.log("\n[2] pending insert counts toward the reservation total");
  const k2 = await insertKey("k2", "pending", o1);
  check("pending key inserted", !k2.error, k2.error?.message);
  check("counter == 2 (active + pending)", (await counter()) === 2);

  // 3. Capacity: a 3rd key (distinct order) is rejected by the CAPACITY trigger.
  console.log("\n[3] capacity ceiling enforced by trigger");
  const k3 = await insertKey("k3", "active", o2);
  check("3rd key rejected by capacity trigger", !!k3.error && /capacity exceeded/i.test(k3.error.message || ""), k3.error?.message || "no error");
  check("counter still 2 after rejected insert", (await counter()) === 2);

  // 4. Soft-delete releases the reservation.
  console.log("\n[4] soft-delete releases the reservation");
  const d = await supabase.from("vpn_keys").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", k2.id);
  check("soft-delete succeeded", !d.error, d.error?.message);
  check("counter == 1 after soft-delete", (await counter()) === 1);

  // 5. Now there is room again for one more (distinct order).
  console.log("\n[5] capacity frees up after release");
  const k4 = await insertKey("k4", "active", o3);
  check("insert succeeds after a slot freed", !k4.error, k4.error?.message);
  check("counter == 2 again", (await counter()) === 2);

  // 6. Hard-delete recomputes down to 0.
  console.log("\n[6] hard-delete recomputes the counter");
  for (const id of [k1.id, k4.id]) {
    if (id) await supabase.from("vpn_keys").delete().eq("id", id);
  }
  check("counter == 0 after removing active keys", (await counter()) === 0);
}

async function cleanup() {
  console.log("\n[cleanup] removing fixtures…");
  for (const oid of created.orders) {
    await supabase.from("vpn_keys").delete().eq("order_id", oid);
  }
  for (const oid of created.orders) {
    await supabase.from("vpn_orders").delete().eq("id", oid);
  }
  if (created.customer) await supabase.from("vpn_customers").delete().eq("id", created.customer);
  if (created.plan) await supabase.from("vpn_plans").delete().eq("id", created.plan);
  if (created.reseller) await supabase.from("resellers").delete().eq("id", created.reseller);
  if (created.server) await supabase.from("vpn_servers").delete().eq("id", created.server);
  console.log("[cleanup] done.");
}

async function main() {
  console.log(`Server-counter trigger validation against DEV (${DEV}) — tag ${TAG}`);
  try { await setup(); await run(); }
  catch (e) { console.error(`\n✗ FATAL: ${e.message}`); failed++; }
  finally { try { await cleanup(); } catch (e) { console.error(`cleanup error: ${e.message}`); } }
  console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
