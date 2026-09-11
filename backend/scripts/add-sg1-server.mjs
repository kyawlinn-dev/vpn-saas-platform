#!/usr/bin/env node
/**
 * Insert the SG1 node (139.59.126.185) into the dev DB.
 * Reuses the same panel credentials as the other Marzneshin servers.
 */
import "../src/lib/loadEnv.js";
import { createClient } from "@supabase/supabase-js";

const DEV_URL = "https://huqmzvlzfcexycdrsxpn.supabase.co";
const DEV_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1cW16dmx6ZmNleHljZHJzeHBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI4NDkxMywiZXhwIjoyMDg5ODYwOTEzfQ.9dY1LRUMapO1jhGhu1T4m9xzJnAgPdRr9Rb3UdZtG9g";

if (DEV_URL.includes("daenwusz")) {
  console.error("❌ ABORT: This is the PRODUCTION database!");
  process.exit(1);
}

const supabase = createClient(DEV_URL, DEV_KEY);

// Check if SG1 already exists
const { data: existing } = await supabase
  .from("vpn_servers")
  .select("id, name")
  .eq("host_ip", "139.59.126.185")
  .maybeSingle();

if (existing) {
  console.log(`✓ SG1 already exists: ${existing.id} (${existing.name})`);
  process.exit(0);
}

// Get the encrypted password from an existing active server (same panel creds)
const { data: ref } = await supabase
  .from("vpn_servers")
  .select("panel_password_encrypted")
  .eq("status", "active")
  .not("panel_password_encrypted", "is", null)
  .limit(1)
  .single();

if (!ref?.panel_password_encrypted) {
  console.error("❌ Could not find an existing server with encrypted password");
  process.exit(1);
}

const { data, error } = await supabase
  .from("vpn_servers")
  .insert({
    name: "SG1",
    host_ip: "139.59.126.185",
    region: "sgp1",
    region_code: "SG",
    display_country: "Singapore",
    display_city: "Singapore",
    flag_emoji: "🇸🇬",
    server_tier: "premium",
    status: "active",
    panel_url: "https://panel.novanetmm.com",
    panel_username: "novanet-admin",
    panel_password_encrypted: ref.panel_password_encrypted,
    max_active_keys: 100,
    current_active_keys: 0,
  })
  .select("id, name, host_ip, status, server_tier")
  .single();

if (error) {
  console.error("Error:", error.message);
  process.exit(1);
}

console.log("✓ Inserted SG1 server:", JSON.stringify(data, null, 2));
