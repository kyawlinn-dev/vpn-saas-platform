#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function run() {
  // ── Direct order lookup ───────────────────────────────────────────────────
  const TEST_ORDER_ID = "d18460b2-1f25-41d6-a6fa-36509bb8d03d";
  const { data: ord, error: oe } = await supabase
    .from("vpn_orders")
    .select("id, status, order_type, customer_id, plan_id, expiry_date, created_at")
    .eq("id", TEST_ORDER_ID)
    .maybeSingle();
  console.log("=== Order d18460b2 ===");
  if (oe) console.log("  Error:", oe.message);
  else if (!ord) console.log("  NOT FOUND in vpn_orders");
  else console.log("  Found:", JSON.stringify(ord, null, 2));

  // ── Recent vpn_orders (no join) ───────────────────────────────────────────
  console.log("\n=== Recent vpn_orders (no join) ===");
  const { data: recent, error: re } = await supabase
    .from("vpn_orders")
    .select("id, status, order_type, customer_id, created_at")
    .order("created_at", { ascending: false })
    .limit(8);
  if (re) console.log("  Error:", re.message);
  for (const o of recent || []) {
    console.log(`  [${o.status}][${o.order_type}] order=${o.id.slice(0,8)} customer=${o.customer_id?.slice(0,8)} | ${o.created_at?.slice(0,16)}`);
  }

  // ── SG1 active keys ───────────────────────────────────────────────────────
  console.log("\n=== SG1 active keys ===");
  const { data: sg1server } = await supabase.from("vpn_servers").select("id").eq("name", "SG1").single();
  if (sg1server) {
    const { data: sg1keys } = await supabase
      .from("vpn_keys")
      .select("id, order_id, outline_key_id, status, used_bytes, created_at")
      .eq("server_id", sg1server.id)
      .eq("status", "active")
      .is("deleted_at", null);
    for (const k of sg1keys || []) {
      const usedMB = (Number(k.used_bytes) / 1024 / 1024).toFixed(1);
      const age = Math.round((Date.now() - new Date(k.created_at)) / 86400000);
      console.log(`  ${k.outline_key_id} | ${usedMB}MB | ${age}d old | order=${k.order_id?.slice(0,8)}`);
    }
  }

  // ── Orphaned Marzneshin users (keys deleted in DB) from test session ─────
  console.log("\n=== Orphaned Marzneshin panel users (DB deleted, may still be in panel) ===");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: orphans } = await supabase
    .from("vpn_keys")
    .select("id, outline_key_id, deleted_at, vpn_servers(name, panel_url)")
    .eq("status", "deleted")
    .gte("deleted_at", since)
    .not("outline_key_id", "is", null);
  for (const k of orphans || []) {
    const panel = k.vpn_servers?.panel_url ? "Marzneshin panel" : "Outline (no panel)";
    console.log(`  ${k.vpn_servers?.name}: ${k.outline_key_id} — ${panel} — should be deleted from panel`);
  }

  // ── Check if Singapore #2 and Tokyo #1 have is_default correct ───────────
  console.log("\n=== Default server check ===");
  const { data: defaults } = await supabase
    .from("vpn_servers")
    .select("name, host_ip, is_default, server_tier, is_active")
    .eq("is_default", true);
  for (const s of defaults || []) {
    console.log(`  DEFAULT: ${s.name} (${s.host_ip}) — ${s.server_tier} | active=${s.is_active}`);
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
