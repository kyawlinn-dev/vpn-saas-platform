#!/usr/bin/env node
/**
 * listResellers.js  — READ-ONLY
 *
 * Lists every reseller with their ID, name, email, status, and customer count.
 *
 * Usage (run from inside the backend/ directory):
 *   node --env-file=.env scripts/listResellers.js
 */

import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: resellers, error } = await db
  .from("resellers")
  .select("id, name, email, status, created_at")
  .order("created_at", { ascending: true });

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

if (resellers.length === 0) {
  console.log("No resellers found.");
  process.exit(0);
}

// Fetch customer counts per reseller in one query
const { data: counts, error: countErr } = await db
  .from("vpn_customers")
  .select("reseller_id");

if (countErr) {
  console.error("Customer count query failed:", countErr.message);
  process.exit(1);
}

const customerCountMap = {};
for (const row of counts) {
  customerCountMap[row.reseller_id] = (customerCountMap[row.reseller_id] || 0) + 1;
}

console.log();
console.log("══════════════════════════════════════════════════════════════════════");
console.log(`  Resellers (${resellers.length} total)`);
console.log("══════════════════════════════════════════════════════════════════════");
console.log(
  `  ${"#".padEnd(3)}  ${"ID".padEnd(36)}  ${"Name".padEnd(20)}  ${"Email".padEnd(30)}  ${"Status".padEnd(10)}  Customers  Created`
);
console.log("  " + "─".repeat(130));

resellers.forEach((r, i) => {
  const customers = customerCountMap[r.id] || 0;
  const created = r.created_at?.slice(0, 10) ?? "—";
  console.log(
    `  ${String(i + 1).padEnd(3)}  ${r.id.padEnd(36)}  ${(r.name || "—").padEnd(20)}  ${(r.email || "—").padEnd(30)}  ${(r.status || "—").padEnd(10)}  ${String(customers).padEnd(9)}  ${created}`
  );
});

console.log("══════════════════════════════════════════════════════════════════════");
console.log();
