#!/usr/bin/env node
/**
 * Reset all dev DB server_health_status rows to "healthy"
 * so the server switch dialog works during local testing.
 */
import "../src/lib/loadEnv.js";
import { createClient } from "@supabase/supabase-js";

const DEV_URL = "https://huqmzvlzfcexycdrsxpn.supabase.co";
const DEV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (DEV_URL.includes("daenwusz")) {
  console.error("❌ ABORT: This is the PRODUCTION database!");
  process.exit(1);
}

const supabase = createClient(DEV_URL, DEV_KEY);

const { data, error } = await supabase
  .from("server_health_status")
  .update({
    outline_api_status: "healthy",
    last_error: null,
    consecutive_failures: 0,
  })
  .eq("outline_api_status", "failed")
  .select("server_id, outline_api_status, consecutive_failures");

if (error) {
  console.error("Error:", error.message);
  process.exit(1);
}

console.log(`✓ Reset ${data.length} servers to healthy:`);
for (const row of data) {
  console.log(`  ${row.server_id}: ${row.outline_api_status}`);
}
