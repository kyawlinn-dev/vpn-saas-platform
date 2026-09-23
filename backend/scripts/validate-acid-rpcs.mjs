#!/usr/bin/env node
/**
 * Validate the Phase 1 ACID provisioning RPCs (migration 0020) end-to-end
 * against the DEV database, without touching the real buy flow.
 *
 * It stands up throwaway fixtures (reseller, customer, plan, server, order),
 * exercises reserve_pending_key / activate_vpn_key / fail_pending_key across
 * five scenarios, verifies the server counter and key rows after each, then
 * deletes everything it created.
 *
 * SAFETY: refuses to run unless SUPABASE_URL is the known DEV project. Creds
 * come from backend/.env.local. Run AFTER applying 0020 in the SQL Editor:
 *
 *   node backend/scripts/validate-acid-rpcs.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { randomUUID } from "crypto";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_PROJECT_REF = "huqmzvlzfcexycdrsxpn";

// ── DEV-DB SAFETY GUARD ─────────────────────────────────────────────────────
if (!URL || !KEY) {
  console.error("✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in backend/.env.local");
  process.exit(1);
}
if (!URL.includes(DEV_PROJECT_REF)) {
  console.error(`✗ Refusing to run: SUPABASE_URL is not the known dev project (${DEV_PROJECT_REF}).`);
  console.error("  This script writes data and must never run against production.");
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const TAG = `acidtest-${Date.now()}`;
const created = { server: null, reseller: null, customer: null, plan: null, order: null, keys: [] };

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function serverCounter() {
  const { data, error } = await supabase
    .from("vpn_servers")
    .select("current_active_keys, max_active_keys")
    .eq("id", created.server)
    .single();
  if (error) throw new Error(`read server counter: ${error.message}`);
  return data;
}

async function keyRow(id) {
  const { data, error } = await supabase
    .from("vpn_keys")
    .select("id, status, access_url, outline_key_id, key_credentials")
    .eq("id", id)
    .single();
  if (error) throw new Error(`read key ${id}: ${error.message}`);
  return data;
}

async function setupFixtures() {
  console.log("\n[setup] creating throwaway fixtures…");

  const reseller = await supabase
    .from("resellers")
    .insert({ name: `${TAG}-reseller`, commission_percent: 10, status: "active" })
    .select("id").single();
  if (reseller.error) throw new Error(`reseller: ${reseller.error.message}`);
  created.reseller = reseller.data.id;

  const customer = await supabase
    .from("vpn_customers")
    .insert({ reseller_id: created.reseller, full_name: `${TAG}-customer`, status: "active", customer_type: "normal" })
    .select("id").single();
  if (customer.error) throw new Error(`customer: ${customer.error.message}`);
  created.customer = customer.data.id;

  const plan = await supabase
    .from("vpn_plans")
    .insert({
      name: `${TAG}-plan`, price_mmk: 1000, data_limit_gb: 10, duration_days: 30,
      max_devices: 1, is_active: false, is_trial: false, features: [], sort_order: 999,
    })
    .select("id").single();
  if (plan.error) throw new Error(`plan: ${plan.error.message}`);
  created.plan = plan.data.id;

  // Capacity ceiling of 2, so we can prove the atomic capacity check.
  const server = await supabase
    .from("vpn_servers")
    .insert({
      name: `${TAG}-server`, provider: "digitalocean", region: "test", status: "active",
      max_active_keys: 2, current_active_keys: 0, is_default: false, sort_order: 999,
      panel_type: "marzneshin", server_tier: "premium",
    })
    .select("id").single();
  if (server.error) throw new Error(`server: ${server.error.message}`);
  created.server = server.data.id;

  const order = await supabase
    .from("vpn_orders")
    .insert({
      customer_id: created.customer, reseller_id: created.reseller, plan_id: created.plan,
      status: "pending", price_mmk: 1000, commission_percent: 10, commission_amount_mmk: 100,
      total_paid_mmk: 0, payment_status: "unpaid", order_type: "purchase", review_status: "confirmed",
    })
    .select("id").single();
  if (order.error) throw new Error(`order: ${order.error.message}`);
  created.order = order.data.id;

  console.log(`[setup] done. order=${created.order} server=${created.server}`);
}

async function reserve(name, protocol = "vless", resellerOverride = null) {
  const { data, error } = await supabase.rpc("reserve_pending_key", {
    p_order_id: created.order,
    p_customer_id: created.customer,
    p_reseller_id: resellerOverride || created.reseller,
    p_server_id: created.server,
    p_key_name: `${TAG}-${name}`,
    p_data_limit_bytes: 10737418240,
    p_protocol: protocol,
  });
  if (!error && data) created.keys.push(data);
  return { keyId: data, error };
}

function isMissingFn(error) {
  return /could not find the function|schema cache/i.test(error?.message || "");
}

async function runScenarios() {
  // ── 1. Happy path: reserve reserves capacity + inserts pending ────────────
  console.log("\n[1] reserve_pending_key — reserve + pending insert");
  const r1 = await reserve("key1");
  if (isMissingFn(r1.error)) {
    console.log("\n  ⚠ Migration 0020 is not applied — the RPCs do not exist yet.");
    console.log("    Apply backend/supabase/migrations/0020_acid_purchase_rpcs.sql in the");
    console.log("    Supabase SQL Editor (dev project), then re-run this script.");
    throw new Error("RPCs not found — apply migration 0020 first");
  }
  check("reserve returned a key id", !r1.error && !!r1.keyId, r1.error?.message);
  check("server counter incremented to 1", (await serverCounter()).current_active_keys === 1);
  if (r1.keyId) {
    const k = await keyRow(r1.keyId);
    check("key status is 'pending'", k.status === "pending", `got ${k.status}`);
    check("pending key has no access_url yet", k.access_url === null);
  }

  // ── 2. activate flips pending -> active with panel result ─────────────────
  console.log("\n[2] activate_vpn_key — pending -> active");
  const a = await supabase.rpc("activate_vpn_key", {
    p_key_id: r1.keyId, p_reseller_id: created.reseller,
    p_outline_key_id: "test-user-1", p_access_url: "https://panel.example/sub/test1",
    p_key_credentials: { username: "test1", subscription_key: "abc" },
  });
  check("activate returned no error", !a.error, a.error?.message);
  if (r1.keyId) {
    const k = await keyRow(r1.keyId);
    check("key status is 'active'", k.status === "active", `got ${k.status}`);
    check("access_url set from panel result", k.access_url === "https://panel.example/sub/test1");
    check("outline_key_id set", k.outline_key_id === "test-user-1");
    check("key_credentials stored", k.key_credentials?.username === "test1");
  }
  check("counter unchanged by activate (still 1)", (await serverCounter()).current_active_keys === 1);

  // ── 3. fail_pending_key releases reservation + soft-deletes ───────────────
  console.log("\n[3] fail_pending_key — compensation");
  const r2 = await reserve("key2");
  check("second reserve → counter 2", (await serverCounter()).current_active_keys === 2, "before fail");
  const f = await supabase.rpc("fail_pending_key", { p_key_id: r2.keyId, p_reseller_id: created.reseller });
  check("fail returned no error", !f.error, f.error?.message);
  check("counter released back to 1", (await serverCounter()).current_active_keys === 1);
  {
    const k = await keyRow(r2.keyId);
    check("failed key soft-deleted", k.status === "deleted", `got ${k.status}`);
  }

  // ── 4. fail is idempotent (calling again does nothing) ────────────────────
  console.log("\n[4] fail_pending_key — idempotent");
  const f2 = await supabase.rpc("fail_pending_key", { p_key_id: r2.keyId, p_reseller_id: created.reseller });
  check("second fail returned no error", !f2.error, f2.error?.message);
  check("counter still 1 (no double-decrement)", (await serverCounter()).current_active_keys === 1);

  // ── 5. atomic capacity check: server full is rejected, counter unchanged ──
  console.log("\n[5] reserve_pending_key — capacity ceiling");
  const r3 = await reserve("key3"); // counter 1 -> 2 (at max)
  check("reserve to capacity (counter 2)", !r3.error && (await serverCounter()).current_active_keys === 2, r3.error?.message);
  const r4 = await reserve("key4"); // should be rejected
  check("reserve beyond capacity is rejected", !!r4.error && /capacity exceeded|full or missing/i.test(r4.error.message || ""), r4.error?.message || "no error");
  check("counter NOT incremented past max (still 2)", (await serverCounter()).current_active_keys === 2);

  // ── 6. tenant guard: wrong reseller is rejected, no side effects ──────────
  console.log("\n[6] reserve_pending_key — tenant guard");
  const before = (await serverCounter()).current_active_keys;
  const r5 = await reserve("key5", "vless", randomUUID()); // wrong reseller
  check("reserve with wrong reseller is rejected", !!r5.error && /does not belong/i.test(r5.error.message || ""), r5.error?.message || "no error");
  check("counter unchanged by rejected reserve", (await serverCounter()).current_active_keys === before);
}

async function cleanup() {
  console.log("\n[cleanup] removing fixtures…");
  for (const kid of created.keys) {
    if (kid) await supabase.from("vpn_keys").delete().eq("id", kid);
  }
  // Also sweep any keys by order_id in case an id wasn't captured.
  if (created.order) await supabase.from("vpn_keys").delete().eq("order_id", created.order);
  if (created.order) await supabase.from("vpn_orders").delete().eq("id", created.order);
  if (created.customer) await supabase.from("vpn_customers").delete().eq("id", created.customer);
  if (created.plan) await supabase.from("vpn_plans").delete().eq("id", created.plan);
  if (created.reseller) await supabase.from("resellers").delete().eq("id", created.reseller);
  if (created.server) await supabase.from("vpn_servers").delete().eq("id", created.server);
  console.log("[cleanup] done.");
}

async function main() {
  console.log(`ACID RPC validation against DEV (${DEV_PROJECT_REF}) — tag ${TAG}`);
  try {
    await setupFixtures();
    await runScenarios();
  } catch (e) {
    console.error(`\n✗ FATAL: ${e.message}`);
    failed += 1;
  } finally {
    try { await cleanup(); } catch (e) { console.error(`cleanup error: ${e.message}`); }
  }
  console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
