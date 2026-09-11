#!/usr/bin/env node
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// All servers
const { data: servers, error: sErr } = await supabase
  .from("vpn_servers")
  .select("id, name, region, status, outline_api_url, current_active_keys, max_active_keys")
  .order("name");

if (sErr) { console.error("Server query error:", sErr.message); process.exit(1); }

console.log("\n=== ALL vpn_servers ===");
for (const s of (servers || [])) {
  console.log(`\n  ${s.name} (${s.region}) — status: ${s.status}`);
  console.log(`    id: ${s.id}`);
  console.log(`    outline_api_url: ${s.outline_api_url ? s.outline_api_url.substring(0, 80) : "NULL"}`);
  console.log(`    capacity: ${s.current_active_keys}/${s.max_active_keys}`);
}

// Active customer counts per server
const { data: keys } = await supabase
  .from("vpn_keys")
  .select("server_id, status")
  .eq("status", "active");

const byServer = {};
for (const k of keys || []) {
  byServer[k.server_id] = (byServer[k.server_id] || 0) + 1;
}

console.log("\n=== Active vpn_keys per server ===");
for (const [sid, count] of Object.entries(byServer)) {
  const s = servers.find(x => x.id === sid);
  console.log(`  ${s?.name || sid}: ${count} active keys`);
}

// Total customers
const { count } = await supabase
  .from("vpn_customers")
  .select("*", { count: "exact", head: true });
console.log(`\nTotal customers: ${count}`);
