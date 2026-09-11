#!/usr/bin/env node
/**
 * Fix the broken server switch: the SG1 key was created with empty service_ids.
 *
 * 1. Delete the useless Marzneshin user on the panel
 * 2. Delete the broken vpn_keys row
 * 3. Restore the old sgp1-3111 key to "active"
 * 4. Fix server usage counters
 */
import "../src/lib/loadEnv.js";
import { decrypt } from "../src/lib/tokenEncryption.js";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";

const DEV_URL = "https://huqmzvlzfcexycdrsxpn.supabase.co";
const DEV_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1cW16dmx6ZmNleHljZHJzeHBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI4NDkxMywiZXhwIjoyMDg5ODYwOTEzfQ.9dY1LRUMapO1jhGhu1T4m9xzJnAgPdRr9Rb3UdZtG9g";

if (DEV_URL.includes("daenwusz")) {
  console.error("❌ ABORT: This is the PRODUCTION database!");
  process.exit(1);
}

const supabase = createClient(DEV_URL, DEV_KEY);

const BROKEN_KEY_ID = "77d1b457-c144-4be9-a4a6-948320e81b66";
const OLD_KEY_ID = "1fa5fde0-f236-4ef6-86b6-cf53e6aed0f9";
const SG1_SERVER_ID = "cb31e328-37eb-4369-95d4-92c8f60cf298";
const SGP1_3111_SERVER_ID = "3af71922-5e50-46a8-aa44-e3b07642f741";
const MARZNESHIN_USERNAME = "test_ss_sg1_basic_plan_o_0vfx3n";

// 1. Delete the useless Marzneshin user from the panel
const { data: srv } = await supabase
  .from("vpn_servers")
  .select("panel_url, panel_username, panel_password_encrypted")
  .eq("id", SG1_SERVER_ID)
  .single();

const password = decrypt(srv.panel_password_encrypted);
const panelUrl = srv.panel_url.replace(/\/+$/, "");

const loginRes = await axios.post(
  panelUrl + "/api/admins/token",
  new URLSearchParams({ username: srv.panel_username, password }),
  { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
);
const token = loginRes.data.access_token;

try {
  await axios.delete(panelUrl + `/api/users/${MARZNESHIN_USERNAME}`, {
    headers: { Authorization: "Bearer " + token },
    timeout: 15000,
  });
  console.log("✓ Deleted Marzneshin user:", MARZNESHIN_USERNAME);
} catch (err) {
  if (err.response?.status === 404) {
    console.log("✓ Marzneshin user already gone:", MARZNESHIN_USERNAME);
  } else {
    console.error("⚠ Failed to delete Marzneshin user:", err.message);
  }
}

// 2. Delete the broken vpn_keys row
const { error: delErr } = await supabase
  .from("vpn_keys")
  .delete()
  .eq("id", BROKEN_KEY_ID);
if (delErr) console.error("Error deleting broken key:", delErr.message);
else console.log("✓ Deleted broken vpn_keys row:", BROKEN_KEY_ID);

// 3. Restore the old key to active
const { error: restoreErr } = await supabase
  .from("vpn_keys")
  .update({ status: "active", deleted_at: null })
  .eq("id", OLD_KEY_ID);
if (restoreErr) console.error("Error restoring old key:", restoreErr.message);
else console.log("✓ Restored old key to active:", OLD_KEY_ID);

// 4. Fix server usage counters
// SG1: decrement (had been incremented during the broken switch)
await supabase.rpc("decrement_server_usage", { server_id_param: SG1_SERVER_ID });
console.log("✓ Decremented SG1 usage");

// sgp1-3111: increment (had been decremented when old key was retired)
await supabase.rpc("increment_server_usage", { server_id_param: SGP1_3111_SERVER_ID });
console.log("✓ Incremented sgp1-3111 usage");

// Also need to restore the old Marzneshin user on sgp1-3111 — but it was deleted from the panel!
// Check if it still exists:
const oldUsername = "test_ss_sgp1_3111_basic__caf540";
try {
  const userRes = await axios.get(panelUrl + `/api/users/${oldUsername}`, {
    headers: { Authorization: "Bearer " + token },
    timeout: 15000,
  });
  console.log("✓ Old Marzneshin user still exists:", oldUsername, "status:", userRes.data.status);
} catch (err) {
  if (err.response?.status === 404) {
    console.log("⚠ Old Marzneshin user was deleted from panel:", oldUsername);
    console.log("  The DB key is restored but the panel user is gone.");
    console.log("  You may need to re-provision this order.");
  } else {
    console.error("⚠ Error checking old user:", err.message);
  }
}

console.log("\nDone. Order should be back on sgp1-3111.");
