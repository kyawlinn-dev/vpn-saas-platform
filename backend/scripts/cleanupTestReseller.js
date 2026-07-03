#!/usr/bin/env node
/**
 * cleanupTestReseller.js
 *
 * One-off script: remove all customers (and their keys, orders, links) for a
 * specific reseller. Calls the Outline API to delete live keys before touching
 * the DB. Hard-deletes all rows in FK-safe order.
 *
 * Usage (run from inside the backend/ directory):
 *   node --env-file=.env scripts/cleanupTestReseller.js <RESELLER_ID> [--dry-run]
 *
 * --dry-run  Print what would happen; make no changes.
 *
 * Deletion order (FK-safe, children before parents):
 *   1. Outline API: deleteOutlineKey + decrementServerUsage  (live keys only)
 *   2. token_server_assignments  (references access_tokens + vpn_keys)
 *   3. access_tokens             (references vpn_orders)
 *   4. vpn_keys                  (references vpn_orders + vpn_customers)
 *   5. vpn_orders                (references vpn_customers)
 *   6. telegram_links            (references vpn_customers)
 *   7. vpn_customers             (root — no FK dependents remaining)
 */

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

// ── Args & env validation ─────────────────────────────────────────────────────

const RESELLER_ID = process.argv[2];
const DRY_RUN = process.argv.includes("--dry-run");

if (!RESELLER_ID || RESELLER_ID.startsWith("--")) {
  console.error(
    "Usage: node --env-file=.env scripts/cleanupTestReseller.js <RESELLER_ID> [--dry-run]"
  );
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
      "Run with:  node --env-file=.env scripts/cleanupTestReseller.js <RESELLER_ID>"
  );
  process.exit(1);
}

// ── Service imports (after env check so supabase.js picks up the vars) ────────

const { deleteOutlineKey } = await import("../src/services/outlineService.js");
const { decrementServerUsage } = await import("../src/services/serverService.js");

// ── Supabase client ───────────────────────────────────────────────────────────
// Own client rather than lib/supabase.js — avoids any shared-state side-effects
// in a script context.

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(ts(), ...args);
}

function warn(...args) {
  console.warn(ts(), "WARN", ...args);
}

function err(...args) {
  console.error(ts(), "ERR ", ...args);
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function dbQuery(label, promise) {
  const { data, error } = await promise;
  if (error) {
    err(`${label}: ${error.message}`);
    process.exit(1);
  }
  return data || [];
}

// ── Phase 1: Gather ───────────────────────────────────────────────────────────

console.log();
console.log("══════════════════════════════════════════════════════════");
console.log("  cleanupTestReseller.js");
console.log(`  Reseller ID : ${RESELLER_ID}`);
console.log(`  Mode        : ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE — will delete real data"}`);
console.log("══════════════════════════════════════════════════════════");
console.log();

log("Phase 1 — gathering data…");

// Customers
const customers = await dbQuery(
  "vpn_customers",
  db.from("vpn_customers")
    .select("id, full_name, telegram_username, status, created_at")
    .eq("reseller_id", RESELLER_ID)
);

if (customers.length === 0) {
  log("No customers found for this reseller. Nothing to do.");
  process.exit(0);
}

const customerIds = customers.map((c) => c.id);

// All vpn_keys (any status) — needed for DB cleanup
const allKeys = await dbQuery(
  "vpn_keys (all)",
  db.from("vpn_keys")
    .select("id, outline_key_id, status, deleted_at, customer_id, server_id, order_id")
    .in("customer_id", customerIds)
);

// Active vpn_keys only — these need Outline API calls
const liveKeys = await dbQuery(
  "vpn_keys (live)",
  db.from("vpn_keys")
    .select(`
      id, outline_key_id, customer_id, server_id,
      vpn_servers (
        id, name, flag_emoji, outline_api_url, outline_cert_sha256
      )
    `)
    .in("customer_id", customerIds)
    .eq("status", "active")
    .is("deleted_at", null)
);

// All orders
const allOrders = await dbQuery(
  "vpn_orders",
  db.from("vpn_orders")
    .select("id, status, order_type, customer_id, plan_id")
    .in("customer_id", customerIds)
);

const orderIds = allOrders.map((o) => o.id);

// telegram_links
const allLinks = await dbQuery(
  "telegram_links",
  db.from("telegram_links")
    .select("id, telegram_user_id, customer_id")
    .in("customer_id", customerIds)
);

// access_tokens (token-portal legacy flow)
const accessTokens =
  orderIds.length > 0
    ? await dbQuery(
        "access_tokens",
        db.from("access_tokens").select("id, order_id").in("order_id", orderIds)
      )
    : [];

const tokenIds = accessTokens.map((t) => t.id);

// token_server_assignments
const tokenAssignments =
  tokenIds.length > 0
    ? await dbQuery(
        "token_server_assignments",
        db.from("token_server_assignments")
          .select("id, token_id")
          .in("token_id", tokenIds)
      )
    : [];

// ── Print summary ──────────────────────────────────────────────────────────────

console.log();
console.log("── Customers ─────────────────────────────────────────────");
for (const c of customers) {
  console.log(
    `  ${c.id}  ${c.full_name}  @${c.telegram_username || "—"}  status=${c.status}  created=${c.created_at?.slice(0, 10)}`
  );
}
console.log();
console.log("── Live Outline keys (will call deleteOutlineKey) ─────────");
if (liveKeys.length === 0) {
  console.log("  (none — no active keys to remove from Outline servers)");
} else {
  for (const k of liveKeys) {
    const s = k.vpn_servers;
    console.log(
      `  key_id=${k.outline_key_id}  server=${s?.name || k.server_id}  ${s?.flag_emoji || ""}`
    );
  }
}
console.log();
console.log("── DB rows to delete ─────────────────────────────────────");
console.log(`  vpn_keys                  : ${allKeys.length}`);
console.log(`  vpn_orders                : ${allOrders.length}`);
console.log(`  telegram_links            : ${allLinks.length}`);
console.log(`  vpn_customers             : ${customers.length}`);
if (accessTokens.length > 0)
  console.log(`  access_tokens             : ${accessTokens.length}`);
if (tokenAssignments.length > 0)
  console.log(`  token_server_assignments  : ${tokenAssignments.length}`);
console.log();

if (DRY_RUN) {
  console.log("[DRY RUN] No changes made. Remove --dry-run to execute.");
  process.exit(0);
}

// ── Phase 2: Confirm ──────────────────────────────────────────────────────────

console.log("══════════════════════════════════════════════════════════");
console.log("  ⚠️  This is PERMANENT. All rows listed above will be");
console.log("     hard-deleted from the database.");
console.log("══════════════════════════════════════════════════════════");
console.log();

const answer = await confirm(
  `Type the reseller ID  [${RESELLER_ID}]  to confirm, or anything else to abort: `
);

if (answer !== RESELLER_ID) {
  console.log("Confirmation did not match — aborting. No data was changed.");
  process.exit(1);
}

console.log();
log("Phase 2 — confirmed. Proceeding with deletion…");
console.log();

// ── Phase 3: Outline API cleanup ──────────────────────────────────────────────

log("Phase 3 — removing live keys from Outline servers…");

let outlineOk = 0;
let outlineAlreadyGone = 0;
let outlineFailed = 0;

for (const key of liveKeys) {
  const server = key.vpn_servers;

  if (!server?.outline_api_url || !server?.outline_cert_sha256 || !key.outline_key_id) {
    warn(`key ${key.id}: missing server config — skipping Outline API call`);
    continue;
  }

  try {
    const result = await deleteOutlineKey({
      apiUrl: server.outline_api_url,
      certSha256: server.outline_cert_sha256,
      outlineKeyId: key.outline_key_id,
    });

    if (result.already_missing) {
      log(`  ~ key ${key.outline_key_id} was already absent from "${server.name}" (404)`);
      outlineAlreadyGone++;
    } else {
      log(`  ✓ deleted key ${key.outline_key_id} from "${server.name}"`);
      outlineOk++;
    }

    // Decrement server usage counter whether the key was live or already gone
    try {
      await decrementServerUsage(server.id);
    } catch (decErr) {
      warn(`decrementServerUsage for server ${server.id} failed: ${decErr.message}`);
    }
  } catch (apiErr) {
    err(`Outline API delete failed for key ${key.outline_key_id} on "${server.name}": ${apiErr.message}`);
    outlineFailed++;
    // Continue — DB cleanup proceeds regardless; an orphaned Outline key is
    // non-critical for a test environment cleanup.
  }
}

console.log();

// ── Phase 4: DB deletion (FK-safe order) ─────────────────────────────────────

log("Phase 4 — deleting DB rows…");

// 4a. token_server_assignments (references access_tokens)
if (tokenIds.length > 0) {
  const { error } = await db
    .from("token_server_assignments")
    .delete()
    .in("token_id", tokenIds);
  if (error) warn(`token_server_assignments: ${error.message}`);
  else log(`  ✓ deleted ${tokenAssignments.length} token_server_assignments`);
}

// 4b. access_tokens (references vpn_orders)
if (orderIds.length > 0) {
  const { error } = await db
    .from("access_tokens")
    .delete()
    .in("order_id", orderIds);
  if (error) warn(`access_tokens: ${error.message}`);
  else if (accessTokens.length > 0)
    log(`  ✓ deleted ${accessTokens.length} access_tokens`);
}

// 4c. vpn_keys (references vpn_orders + vpn_customers — delete before both)
if (customerIds.length > 0) {
  const { error } = await db
    .from("vpn_keys")
    .delete()
    .in("customer_id", customerIds);
  if (error) err(`vpn_keys delete FAILED: ${error.message} — aborting`), process.exit(1);
  else log(`  ✓ deleted ${allKeys.length} vpn_keys`);
}

// 4d. vpn_orders (references vpn_customers)
if (customerIds.length > 0) {
  const { error } = await db
    .from("vpn_orders")
    .delete()
    .in("customer_id", customerIds);
  if (error) err(`vpn_orders delete FAILED: ${error.message} — aborting`), process.exit(1);
  else log(`  ✓ deleted ${allOrders.length} vpn_orders`);
}

// 4e. telegram_links (references vpn_customers)
if (customerIds.length > 0) {
  const { error } = await db
    .from("telegram_links")
    .delete()
    .in("customer_id", customerIds);
  if (error) warn(`telegram_links: ${error.message}`);
  else log(`  ✓ deleted ${allLinks.length} telegram_links`);
}

// 4f. vpn_customers (root — all FK children are gone)
if (customerIds.length > 0) {
  const { error } = await db
    .from("vpn_customers")
    .delete()
    .in("id", customerIds);
  if (error) err(`vpn_customers delete FAILED: ${error.message}`), process.exit(1);
  else log(`  ✓ deleted ${customers.length} vpn_customers`);
}

// ── Final report ──────────────────────────────────────────────────────────────

console.log();
console.log("══════════════════════════════════════════════════════════");
console.log("  DONE");
console.log(`  Outline keys removed from servers : ${outlineOk}`);
if (outlineAlreadyGone > 0)
  console.log(`  Outline keys already absent (404) : ${outlineAlreadyGone}`);
if (outlineFailed > 0)
  console.log(`  Outline API failures (check logs) : ${outlineFailed}`);
console.log(`  vpn_customers deleted             : ${customers.length}`);
console.log(`  vpn_orders deleted                : ${allOrders.length}`);
console.log(`  vpn_keys deleted                  : ${allKeys.length}`);
console.log(`  telegram_links deleted            : ${allLinks.length}`);
if (accessTokens.length > 0)
  console.log(`  access_tokens deleted             : ${accessTokens.length}`);
if (tokenAssignments.length > 0)
  console.log(`  token_server_assignments deleted  : ${tokenAssignments.length}`);
console.log("══════════════════════════════════════════════════════════");
