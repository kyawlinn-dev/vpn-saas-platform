#!/usr/bin/env node
/**
 * Diagnostic: show vpn_keys state after server-switch testing
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocalPath = path.resolve(__dirname, "../.env.local");
config({ path: envLocalPath });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL?.includes("huqmzvlzfcexycdrsxpn")) {
  console.error("SAFETY: Not pointing at dev DB. Got:", SUPABASE_URL);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function run() {
  // ── VPN Servers ──────────────────────────────────────────────────────────
  console.log("=== VPN Servers (active with panel) ===");
  const { data: servers } = await supabase
    .from("vpn_servers")
    .select("id, name, host_ip, status, is_active, server_tier, panel_url, marzneshin_service_ids, marzneshin_vless_service_ids, current_active_keys")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  for (const s of servers || []) {
    console.log(`  ${s.name} (${s.host_ip}) — ${s.server_tier} | ss_svc=${JSON.stringify(s.marzneshin_service_ids)} | vless_svc=${JSON.stringify(s.marzneshin_vless_service_ids)} | counter=${s.current_active_keys}`);
  }

  // ── Recent VPN Keys ──────────────────────────────────────────────────────
  console.log("\n=== VPN Keys (last 24h, all statuses) ===");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: keys } = await supabase
    .from("vpn_keys")
    .select(`
      id, order_id, server_id, outline_key_id, status, used_bytes, data_limit_bytes,
      created_at, deleted_at,
      vpn_servers ( name, host_ip, panel_url )
    `)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  for (const k of keys || []) {
    const usedMB = (Number(k.used_bytes) / 1024 / 1024).toFixed(1);
    const limitGB = k.data_limit_bytes ? (Number(k.data_limit_bytes) / 1024 / 1024 / 1024).toFixed(1) + "GB" : "∞";
    const createdAgo = Math.round((Date.now() - new Date(k.created_at)) / 60000);
    const delInfo = k.deleted_at ? ` → DELETED ${Math.round((Date.now() - new Date(k.deleted_at)) / 60000)}m ago` : " → STILL ACTIVE";
    console.log(`  [${k.status}] ${k.vpn_servers?.name || k.server_id} | user=${k.outline_key_id} | ${usedMB}MB / ${limitGB} | created ${createdAgo}m ago${delInfo}`);
  }

  // ── Real-time DB key counts per active server ─────────────────────────────
  console.log("\n=== Active Key Counts (real DB count vs counter) ===");
  const { data: activeServers } = await supabase
    .from("vpn_servers")
    .select("id, name, current_active_keys")
    .eq("is_active", true);

  for (const s of activeServers || []) {
    const { count } = await supabase
      .from("vpn_keys")
      .select("id", { count: "exact", head: true })
      .eq("server_id", s.id)
      .eq("status", "active")
      .is("deleted_at", null);
    const match = count === s.current_active_keys ? "✓" : `✗ MISMATCH`;
    console.log(`  ${s.name}: DB real count=${count}, counter=${s.current_active_keys} ${match}`);
  }

  // ── Orders for the test order ID ─────────────────────────────────────────
  const TEST_ORDER_ID = "d18460b2-1f25-41d6-a6fa-36509bb8d03d";
  console.log(`\n=== Order ${TEST_ORDER_ID} ===`);
  const { data: order } = await supabase
    .from("vpn_orders")
    .select(`
      id, customer_id, order_type, status, plan_id, created_at, expires_at,
      total_data_used_bytes, data_limit_bytes,
      vpn_plans ( name, data_limit_gb ),
      vpn_customers ( full_name, telegram_username, protocol_preference )
    `)
    .eq("id", TEST_ORDER_ID)
    .maybeSingle();

  if (order) {
    const usedGB = (Number(order.total_data_used_bytes || 0) / 1024 / 1024 / 1024).toFixed(2);
    const limitGB = order.data_limit_bytes ? (Number(order.data_limit_bytes) / 1024 / 1024 / 1024).toFixed(0) + "GB" : "∞";
    console.log(`  Customer: ${order.vpn_customers?.full_name} (@${order.vpn_customers?.telegram_username})`);
    console.log(`  Protocol: ${order.vpn_customers?.protocol_preference}`);
    console.log(`  Plan: ${order.vpn_plans?.name} (${order.vpn_plans?.data_limit_gb}GB)`);
    console.log(`  Status: ${order.status}`);
    console.log(`  Usage: ${usedGB}GB / ${limitGB}`);
    console.log(`  Expires: ${order.expires_at}`);
  } else {
    console.log("  Not found");
  }

  // ── All recent orders ─────────────────────────────────────────────────────
  console.log("\n=== Recent vpn_orders (last 3 days) ===");
  const since3d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentOrders, error: oe } = await supabase
    .from("vpn_orders")
    .select(`
      id, order_type, status, plan_id, created_at,
      vpn_plans ( name, data_limit_gb ),
      vpn_customers ( full_name, telegram_username )
    `)
    .gte("created_at", since3d)
    .order("created_at", { ascending: false })
    .limit(10);

  if (oe) console.log("  Error:", oe.message);
  for (const o of recentOrders || []) {
    console.log(`  [${o.status}] [${o.order_type}] ${o.vpn_customers?.full_name || "?"} — ${o.vpn_plans?.name} | ${o.id.slice(0,8)}…`);
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
