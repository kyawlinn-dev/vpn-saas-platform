#!/usr/bin/env node
/**
 * Reset all dev DB server_health_status rows to "healthy"
 * so the server switch dialog works during local testing.
 */
import { createClient } from "@supabase/supabase-js";

const DEV_URL = "https://huqmzvlzfcexycdrsxpn.supabase.co";
const DEV_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1cW16dmx6ZmNleHljZHJzeHBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI4NDkxMywiZXhwIjoyMDg5ODYwOTEzfQ.9dY1LRUMapO1jhGhu1T4m9xzJnAgPdRr9Rb3UdZtG9g";

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
