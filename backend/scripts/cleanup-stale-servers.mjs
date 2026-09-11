#!/usr/bin/env node
/**
 * Deactivate stale legacy servers in dev DB that have no Marzneshin panel
 * credentials. Cleans up their health-status rows and the old
 * "outline_health_check" job run entry.
 *
 * Safe: refuses to run against the production database.
 */
import { createClient } from "@supabase/supabase-js";

const DEV_URL = "https://huqmzvlzfcexycdrsxpn.supabase.co";
const DEV_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1cW16dmx6ZmNleHljZHJzeHBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI4NDkxMywiZXhwIjoyMDg5ODYwOTEzfQ.9dY1LRUMapO1jhGhu1T4m9xzJnAgPdRr9Rb3UdZtG9g";

if (DEV_URL.includes("daenwusz")) {
  console.error("❌ ABORT: This is the PRODUCTION database!");
  process.exit(1);
}

const supabase = createClient(DEV_URL, DEV_KEY);

// 1. Find active servers with no panel_url (stale Outline-era servers)
const { data: staleServers, error: findErr } = await supabase
  .from("vpn_servers")
  .select("id, name, status, panel_url")
  .eq("status", "active")
  .is("panel_url", null);

if (findErr) {
  console.error("Error finding stale servers:", findErr.message);
  process.exit(1);
}

if (staleServers.length === 0) {
  console.log("✓ No stale servers found — nothing to do.");
  process.exit(0);
}

console.log(`Found ${staleServers.length} stale servers (active, no panel_url):`);
for (const s of staleServers) {
  console.log(`  ${s.id}  ${s.name}`);
}

// 2. Deactivate them
const staleIds = staleServers.map((s) => s.id);

const { error: deactivateErr } = await supabase
  .from("vpn_servers")
  .update({ status: "inactive" })
  .in("id", staleIds);

if (deactivateErr) {
  console.error("Error deactivating servers:", deactivateErr.message);
  process.exit(1);
}
console.log(`✓ Deactivated ${staleIds.length} servers.`);

// 3. Delete their server_health_status rows
const { data: deletedHealth, error: healthErr } = await supabase
  .from("server_health_status")
  .delete()
  .in("server_id", staleIds)
  .select("server_id");

if (healthErr) {
  console.error("Error cleaning health rows:", healthErr.message);
} else {
  console.log(`✓ Deleted ${deletedHealth.length} server_health_status rows.`);
}

// 4. Delete stale system_job_runs entry for the old "outline_health_check" job name
const { data: deletedJobs, error: jobErr } = await supabase
  .from("system_job_runs")
  .delete()
  .eq("job_name", "outline_health_check")
  .select("id, job_name");

if (jobErr) {
  console.error("Error cleaning stale job runs:", jobErr.message);
} else {
  console.log(`✓ Deleted ${deletedJobs.length} stale 'outline_health_check' job run(s).`);
}

console.log("\nDone. Only Marzneshin-configured servers remain active.");
