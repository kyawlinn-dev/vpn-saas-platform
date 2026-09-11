// Diagnose all active Outline servers: reachability + recent sync health.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: servers } = await supabase
  .from("vpn_servers")
  .select("id, name, region, outline_api_url, current_active_keys, max_active_keys, server_health_status(outline_api_status, last_success_at, last_usage_sync_at, response_ms, consecutive_failures, last_error)")
  .eq("status", "active")
  .not("outline_api_url", "is", null);

console.log("\n" + "=".repeat(90));
console.log("Active Outline servers — health + live reachability test");
console.log("=".repeat(90));

for (const s of servers) {
  const h = Array.isArray(s.server_health_status) ? s.server_health_status[0] : s.server_health_status;
  console.log(`\n▸ ${s.name}  (${s.region})   id=${s.id.slice(0, 8)}...`);
  console.log(`    capacity:     ${s.current_active_keys}/${s.max_active_keys}`);
  console.log(`    api status:   ${h?.outline_api_status || "unknown"}`);
  console.log(`    last success: ${h?.last_success_at || "never"}`);
  console.log(`    last sync:    ${h?.last_usage_sync_at || "never"}`);
  console.log(`    response ms:  ${h?.response_ms ?? "?"}`);
  console.log(`    conseq fails: ${h?.consecutive_failures ?? 0}`);
  if (h?.last_error) console.log(`    last error:   ${h.last_error.slice(0, 200)}`);

  // Live reachability probe — HEAD request, 5s timeout
  const url = new URL("/access-keys", s.outline_api_url).toString();
  const started = Date.now();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(t);
    const elapsed = Date.now() - started;
    console.log(`    live probe:   HTTP ${res.status} in ${elapsed}ms`);
  } catch (err) {
    const elapsed = Date.now() - started;
    console.log(`    live probe:   FAILED after ${elapsed}ms — ${err.name}: ${err.message}`);
  }
}

console.log("\n" + "=".repeat(90));
