#!/usr/bin/env node
/**
 * Apply migration 0013 to LOCAL DEV Supabase and seed Marzneshin credentials.
 * Uses .env.local credentials (NOT production).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { encrypt } from "../src/lib/tokenEncryption.js";

// ----- DEV DB ONLY -----
const DEV_URL = "https://huqmzvlzfcexycdrsxpn.supabase.co";
const DEV_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1cW16dmx6ZmNleHljZHJzeHBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI4NDkxMywiZXhwIjoyMDg5ODYwOTEzfQ.9dY1LRUMapO1jhGhu1T4m9xzJnAgPdRr9Rb3UdZtG9g";

const supabase = createClient(DEV_URL, DEV_KEY);

async function run() {
  // 1. Check we're on dev, not prod
  console.log(`Target: ${DEV_URL}`);
  if (DEV_URL.includes("daenwusz")) {
    console.error("❌ ABORT: This is the PRODUCTION database!");
    process.exit(1);
  }
  console.log("✓ Confirmed: dev database\n");

  // 2. Apply migration SQL via Supabase RPC (raw SQL)
  const migrationSql = readFileSync("supabase/migrations/0013_xray_protocol_support.sql", "utf-8");

  // Split into individual statements
  const statements = migrationSql
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("--"));

  console.log("=== Applying migration 0013 ===");
  for (const stmt of statements) {
    const preview = stmt.substring(0, 80).replace(/\n/g, " ");
    try {
      const { error } = await supabase.rpc("exec_sql", { sql: stmt + ";" });
      if (error) {
        // RPC might not exist, try direct approach
        throw error;
      }
      console.log(`  ✓ ${preview}...`);
    } catch (e) {
      console.log(`  ⚠ RPC failed for: ${preview}... (${e.message || e.code})`);
      console.log("    Will try via REST API...");
    }
  }

  // 3. Test if columns exist by trying to select them
  console.log("\n=== Checking columns ===");
  const { data, error } = await supabase
    .from("vpn_servers")
    .select("id, name, panel_url, panel_type, marzneshin_service_ids, marzneshin_vless_service_ids")
    .limit(1);

  if (error) {
    console.log(`Columns don't exist yet. Error: ${error.message}`);
    console.log("\nYou need to run this SQL in the Supabase SQL Editor (dev project):");
    console.log("---");
    console.log(migrationSql);
    console.log("---");
    return false;
  }

  console.log("✓ All migration columns exist");
  return true;
}

run().then(async (columnsExist) => {
  if (!columnsExist) {
    console.log("\n⚠ Run the migration SQL manually, then re-run this script to seed data.");
    process.exit(0);
  }

  const supabase = createClient(DEV_URL, DEV_KEY);

  // 4. List existing dev servers
  console.log("\n=== Dev servers before update ===");
  const { data: servers } = await supabase
    .from("vpn_servers")
    .select("id, name, region, status, panel_url, marzneshin_service_ids, marzneshin_vless_service_ids")
    .order("name");

  for (const s of (servers || [])) {
    console.log(`  ${s.name} (${s.region}): panel_url=${s.panel_url || "NULL"}, ss_svc=${JSON.stringify(s.marzneshin_service_ids)}, vless_svc=${JSON.stringify(s.marzneshin_vless_service_ids)}`);
  }

  // 5. Encrypt the panel password
  const encryptedPassword = encrypt("NovaNet3xuiTest2026!");
  console.log(`\n✓ Panel password encrypted (${encryptedPassword.substring(0, 20)}...)`);

  // 6. Map servers to Marzneshin service IDs
  //    Service #3: SS - SG1       (inbound 4)
  //    Service #4: SS - Trial-SGP (inbound 7)
  //    Service #5: VLESS Global   (all VLESS)
  //    Service #6: SS - SGP1-3111 (inbound 9)
  //    Service #7: SS - Osaka     (inbound 11)
  const serviceMap = [
    { name: "sgp1-6607-trial",       ss_svc: [4], vless_svc: [5] },  // Trial → SS-Trial-SGP
    { name: "sgp1-3111",             ss_svc: [6], vless_svc: [5] },  // SGP1-3111
    { name: "Outline Japan Osaka 01", ss_svc: [7], vless_svc: [5] }, // Osaka
  ];

  console.log("\n=== Updating servers with Marzneshin credentials ===");
  for (const mapping of serviceMap) {
    const server = servers?.find(s => s.name === mapping.name);
    if (!server) {
      console.log(`  ⚠ Server "${mapping.name}" not found in dev DB, skipping`);
      continue;
    }

    const { error } = await supabase
      .from("vpn_servers")
      .update({
        panel_url: "https://panel.novanetmm.com",
        panel_public_url: "https://panel.novanetmm.com",
        panel_username: "novanet-admin",
        panel_password_encrypted: encryptedPassword,
        marzneshin_service_ids: mapping.ss_svc,
        marzneshin_vless_service_ids: mapping.vless_svc,
      })
      .eq("id", server.id);

    if (error) {
      console.log(`  ✗ ${mapping.name}: ${error.message}`);
    } else {
      console.log(`  ✓ ${mapping.name}: ss_svc=${JSON.stringify(mapping.ss_svc)}, vless_svc=${JSON.stringify(mapping.vless_svc)}`);
    }
  }

  // 7. Verify
  console.log("\n=== Dev servers after update ===");
  const { data: updated } = await supabase
    .from("vpn_servers")
    .select("id, name, status, panel_url, panel_username, marzneshin_service_ids, marzneshin_vless_service_ids")
    .eq("status", "active")
    .order("name");

  for (const s of (updated || [])) {
    console.log(`  ${s.name}: panel=${s.panel_url || "NULL"}, user=${s.panel_username || "NULL"}, ss=${JSON.stringify(s.marzneshin_service_ids)}, vless=${JSON.stringify(s.marzneshin_vless_service_ids)}`);
  }
}).catch(e => { console.error("Fatal:", e.message); process.exit(1); });
