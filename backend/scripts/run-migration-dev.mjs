#!/usr/bin/env node
/**
 * Apply migration 0013 to DEV Supabase via direct Postgres connection.
 */
import { readFileSync } from "fs";
import pg from "pg";

// DEV database connection string (from Supabase project settings)
// Format: postgresql://postgres.[ref]:[password]@[host]:5432/postgres
const DEV_REF = "huqmzvlzfcexycdrsxpn";
const DEV_DB_PASSWORD = process.env.DEV_DB_PASSWORD;

if (!DEV_DB_PASSWORD) {
  // Try via Supabase REST API instead
  console.log("No DEV_DB_PASSWORD set, trying via supabase-js pooler workaround...\n");

  // Use the HTTP API to run SQL via the pg_net extension or a DB function
  const SUPABASE_URL = `https://${DEV_REF}.supabase.co`;
  const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1cW16dmx6ZmNleHljZHJzeHBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI4NDkxMywiZXhwIjoyMDg5ODYwOTEzfQ.9dY1LRUMapO1jhGhu1T4m9xzJnAgPdRr9Rb3UdZtG9g";

  const migrationSql = readFileSync("supabase/migrations/0013_xray_protocol_support.sql", "utf-8");

  // Try the Supabase SQL API (available on newer versions)
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    console.log("RPC endpoint status:", resp.status);
  } catch (e) {
    console.log("RPC not available:", e.message);
  }

  // The most reliable way without DB password: use pg through the pooler
  // Supabase pooler: postgresql://postgres.{ref}:{password}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
  console.log("\n⚠ Cannot run raw SQL without direct DB access.");
  console.log("Please run this migration SQL in Supabase SQL Editor.\n");
  console.log("Or provide the database password:");
  console.log("  DEV_DB_PASSWORD=<your-db-password> node scripts/run-migration-dev.mjs\n");
  console.log("You can find it in Supabase Dashboard > Project Settings > Database > Connection string");
  process.exit(0);
}

const connectionString = `postgresql://postgres.${DEV_REF}:${DEV_DB_PASSWORD}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("✓ Connected to dev database\n");

  const migrationSql = readFileSync("supabase/migrations/0013_xray_protocol_support.sql", "utf-8");

  console.log("=== Running migration 0013 ===");
  await client.query(migrationSql);
  console.log("✓ Migration applied successfully\n");

  // Verify columns
  const { rows } = await client.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'vpn_servers' AND column_name IN ('panel_url', 'panel_type', 'marzneshin_service_ids', 'marzneshin_vless_service_ids')
    ORDER BY column_name
  `);
  console.log("=== New vpn_servers columns ===");
  for (const r of rows) {
    console.log(`  ${r.column_name}: ${r.data_type} (default: ${r.column_default || "none"})`);
  }

  const { rows: rows2 } = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'vpn_customers' AND column_name = 'protocol_preference'
  `);
  console.log(`\n  vpn_customers.protocol_preference: ${rows2[0]?.data_type || "NOT FOUND"}`);

  const { rows: rows3 } = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'vpn_keys' AND column_name IN ('protocol', 'key_credentials')
    ORDER BY column_name
  `);
  for (const r of rows3) {
    console.log(`  vpn_keys.${r.column_name}: ${r.data_type}`);
  }

} finally {
  await client.end();
}
