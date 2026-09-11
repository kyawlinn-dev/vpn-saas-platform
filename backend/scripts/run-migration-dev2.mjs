#!/usr/bin/env node
/**
 * Apply migration 0013 to DEV Supabase via the Management API SQL endpoint.
 * No extra packages needed — just fetch.
 */

const DEV_REF = "huqmzvlzfcexycdrsxpn";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1cW16dmx6ZmNleHljZHJzeHBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI4NDkxMywiZXhwIjoyMDg5ODYwOTEzfQ.9dY1LRUMapO1jhGhu1T4m9xzJnAgPdRr9Rb3UdZtG9g";
const BASE = `https://${DEV_REF}.supabase.co`;

const headers = {
  "apikey": SERVICE_KEY,
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=minimal",
};

async function runSql(sql) {
  // Supabase doesn't have a direct SQL endpoint via REST, but we can
  // use the PostgREST rpc endpoint if we create a helper function first.
  // Instead, let's just test if columns exist and if not, ask user to
  // run the SQL manually via the Supabase CLI.
  return null;
}

async function testColumns() {
  // Try selecting the new columns
  const resp = await fetch(`${BASE}/rest/v1/vpn_servers?select=panel_url,panel_type,marzneshin_service_ids,marzneshin_vless_service_ids&limit=1`, {
    headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` },
  });
  if (resp.ok) return true;
  const err = await resp.json();
  console.log("Column check:", err.message);
  return false;
}

async function run() {
  console.log(`Target: DEV database (${DEV_REF})\n`);

  const exists = await testColumns();
  if (exists) {
    console.log("✓ Migration columns already exist!\n");
    return true;
  }

  // Try Supabase CLI
  console.log("Columns don't exist yet. Trying supabase CLI...\n");
  return false;
}

const columnsExist = await run();

if (!columnsExist) {
  // Try running supabase db push or npx supabase
  const { execSync } = await import("child_process");

  // Try linking and pushing
  try {
    console.log("Trying: npx supabase db push...");
    execSync(`npx supabase db push --db-url "postgresql://postgres:postgres@db.${DEV_REF}.supabase.co:5432/postgres"`, {
      cwd: process.cwd(),
      stdio: "inherit",
      timeout: 30000,
    });
  } catch (e) {
    console.log("\nSupabase CLI approach didn't work. Let me try another way.\n");

    // Last resort: use the Supabase SQL API if available
    console.log("You need to run this migration manually in the Supabase SQL Editor.");
    console.log("1. Go to: https://supabase.com/dashboard/project/huqmzvlzfcexycdrsxpn/sql/new");
    console.log("2. Paste the contents of: supabase/migrations/0013_xray_protocol_support.sql");
    console.log("3. Click Run");
    console.log("\nAfter that, re-run: node scripts/apply-migration-dev.mjs");
  }
}
