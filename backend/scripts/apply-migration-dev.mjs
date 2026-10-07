#!/usr/bin/env node
// Retained for existing workflows, but deliberately read-only. Run schema SQL
// through the reviewed migration workflow, not an ad hoc service-role RPC.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });

const expectedHost = "huqmzvlzfcexycdrsxpn.supabase.co";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key || new URL(url).hostname !== expectedHost) {
  throw new Error("Refusing to inspect a missing or non-development Supabase project");
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (const [table, column] of [
  ["vpn_servers", "panel_type"],
  ["vpn_servers", "marzneshin_vless_trial_service_ids"],
  ["vpn_customers", "protocol_preference"],
  ["vpn_keys", "protocol"],
  ["reseller_miniapps", "trial_protocol"],
]) {
  const { error } = await supabase.from(table).select(column).limit(1);
  console.log(`${table}.${column}: ${error ? "missing or inaccessible" : "present"}`);
}

console.log("Read-only preflight complete. This script does not apply SQL or seed credentials.");
