#!/usr/bin/env node
/**
 * deleteReseller.js
 *
 * Full hard-delete of one or more resellers and ALL their data:
 *   customers, orders, keys, links, tokens, miniapp config,
 *   commission ledger, resellers row, and Supabase auth user.
 *
 * Usage (run from inside the backend/ directory):
 *   node --env-file=.env scripts/deleteReseller.js <ID> [<ID> ...] [--dry-run]
 *
 * Deletion order (FK-safe, children before parents):
 *   1. Outline API  — deleteOutlineKey + decrementServerUsage (live keys)
 *   2. token_server_assignments
 *   3. access_tokens
 *   4. vpn_keys
 *   5. vpn_orders
 *   6. telegram_links
 *   7. vpn_customers
 *   8. reseller_miniapps
 *   9. commission_ledger
 *  10. resellers row
 *  11. Supabase auth.users
 */

import { createClient } from "@supabase/supabase-js";

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RESELLER_IDS = args.filter((a) => !a.startsWith("--"));

if (RESELLER_IDS.length === 0) {
  console.error(
    "Usage: node --env-file=.env scripts/deleteReseller.js <ID> [<ID> ...] [--dry-run]"
  );
  process.exit(1);
}

// ── Env ───────────────────────────────────────────────────────────────────────

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const { deleteOutlineKey } = await import("../src/services/outlineService.js");
const { decrementServerUsage } = await import("../src/services/serverService.js");

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function ts() { return new Date().toISOString(); }
function log(...a) { console.log(ts(), ...a); }
function warn(...a) { console.warn(ts(), "WARN", ...a); }
function fail(...a) { console.error(ts(), "ERR ", ...a); process.exit(1); }

async function q(label, promise) {
  const { data, error } = await promise;
  if (error) fail(`${label}: ${error.message}`);
  return data || [];
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log();
console.log("══════════════════════════════════════════════════════════════");
console.log("  deleteReseller.js");
console.log(`  Mode : ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE — permanent hard-delete"}`);
console.log(`  IDs  : ${RESELLER_IDS.join(", ")}`);
console.log("══════════════════════════════════════════════════════════════");
console.log();

// ── Phase 1: Gather ───────────────────────────────────────────────────────────

log("Phase 1 — gathering data for all resellers…");
console.log();

// Reseller rows
const resellers = await q(
  "resellers",
  db.from("resellers")
    .select("id, name, email, status, supabase_user_id")
    .in("id", RESELLER_IDS)
);

// Warn about any IDs not found
for (const id of RESELLER_IDS) {
  if (!resellers.find((r) => r.id === id)) {
    warn(`Reseller ID ${id} not found in resellers table — skipping`);
  }
}

const foundIds = resellers.map((r) => r.id);
if (foundIds.length === 0) {
  console.log("No matching resellers found. Nothing to do.");
  process.exit(0);
}

// Customers
const customers = await q(
  "vpn_customers",
  db.from("vpn_customers")
    .select("id, full_name, reseller_id")
    .in("reseller_id", foundIds)
);
const customerIds = customers.map((c) => c.id);

// Orders
const allOrders = customerIds.length > 0
  ? await q("vpn_orders", db.from("vpn_orders").select("id, customer_id").in("customer_id", customerIds))
  : [];
const orderIds = allOrders.map((o) => o.id);

// All vpn_keys (for DB delete)
const allKeys = customerIds.length > 0
  ? await q("vpn_keys (all)", db.from("vpn_keys").select("id, customer_id, outline_key_id, status, deleted_at, server_id").in("customer_id", customerIds))
  : [];

// Live vpn_keys (need Outline API calls)
const liveKeys = customerIds.length > 0
  ? await q(
      "vpn_keys (live)",
      db.from("vpn_keys")
        .select("id, outline_key_id, customer_id, server_id, vpn_servers(id, name, flag_emoji, outline_api_url, outline_cert_sha256)")
        .in("customer_id", customerIds)
        .eq("status", "active")
        .is("deleted_at", null)
    )
  : [];

// telegram_links
const allLinks = customerIds.length > 0
  ? await q("telegram_links", db.from("telegram_links").select("id, customer_id").in("customer_id", customerIds))
  : [];

// access_tokens
const accessTokens = orderIds.length > 0
  ? await q("access_tokens", db.from("access_tokens").select("id, order_id").in("order_id", orderIds))
  : [];
const tokenIds = accessTokens.map((t) => t.id);

// token_server_assignments
const tokenAssignments = tokenIds.length > 0
  ? await q("token_server_assignments", db.from("token_server_assignments").select("id, token_id").in("token_id", tokenIds))
  : [];

// reseller_miniapps
const miniapps = await q(
  "reseller_miniapps",
  db.from("reseller_miniapps").select("id, reseller_id, miniapp_slug").in("reseller_id", foundIds)
);

// commission_ledger
const ledger = await q(
  "commission_ledger",
  db.from("commission_ledger").select("id, reseller_id").in("reseller_id", foundIds)
);

// ── Print summary ─────────────────────────────────────────────────────────────

for (const r of resellers) {
  const rCustomers = customers.filter((c) => c.reseller_id === r.id);
  const rKeys = allKeys.filter((k) => rCustomers.some((c) => c.id === k.customer_id));
  const rOrders = allOrders.filter((o) => rCustomers.some((c) => c.id === o.customer_id));
  const rMiniapp = miniapps.find((m) => m.reseller_id === r.id);
  const rLedger = ledger.filter((l) => l.reseller_id === r.id);

  console.log(`── ${r.name} (${r.email}) ──────────────────────────────────`);
  console.log(`   reseller_id          : ${r.id}`);
  console.log(`   supabase_user_id     : ${r.supabase_user_id || "none"}`);
  console.log(`   miniapp_slug         : ${rMiniapp?.miniapp_slug || "none"}`);
  console.log(`   vpn_customers        : ${rCustomers.length}`);
  console.log(`   vpn_orders           : ${rOrders.length}`);
  console.log(`   vpn_keys (all)       : ${rKeys.length}`);
  console.log(`   vpn_keys (live)      : ${liveKeys.filter((k) => rCustomers.some((c) => c.id === k.customer_id)).length}`);
  console.log(`   telegram_links       : ${allLinks.filter((l) => rCustomers.some((c) => c.id === l.customer_id)).length}`);
  console.log(`   access_tokens        : ${accessTokens.filter((t) => rOrders.some((o) => o.id === t.order_id)).length}`);
  console.log(`   commission_ledger    : ${rLedger.length}`);
  console.log();
}

if (DRY_RUN) {
  console.log("[DRY RUN] No changes made. Remove --dry-run to execute.");
  process.exit(0);
}

// ── Phase 2: Outline API cleanup ──────────────────────────────────────────────

log("Phase 2 — removing live keys from Outline servers…");

let outlineOk = 0, outlineGone = 0, outlineFailed = 0;

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
      log(`  ~ key ${key.outline_key_id} already absent from "${server.name}"`);
      outlineGone++;
    } else {
      log(`  ✓ deleted key ${key.outline_key_id} from "${server.name}"`);
      outlineOk++;
    }
    try { await decrementServerUsage(server.id); } catch (e) {
      warn(`decrementServerUsage ${server.id}: ${e.message}`);
    }
  } catch (e) {
    warn(`Outline API failed for key ${key.outline_key_id} on "${server.name}": ${e.message}`);
    outlineFailed++;
  }
}
console.log();

// ── Phase 3: DB deletion (FK-safe order) ─────────────────────────────────────

log("Phase 3 — deleting DB rows…");

// 3a. token_server_assignments
if (tokenIds.length > 0) {
  const { error } = await db.from("token_server_assignments").delete().in("token_id", tokenIds);
  if (error) warn(`token_server_assignments: ${error.message}`);
  else log(`  ✓ ${tokenAssignments.length} token_server_assignments`);
}

// 3b. access_tokens
if (orderIds.length > 0) {
  const { error } = await db.from("access_tokens").delete().in("order_id", orderIds);
  if (error) warn(`access_tokens: ${error.message}`);
  else if (accessTokens.length > 0) log(`  ✓ ${accessTokens.length} access_tokens`);
}

// 3c. vpn_keys
if (customerIds.length > 0) {
  const { error } = await db.from("vpn_keys").delete().in("customer_id", customerIds);
  if (error) fail(`vpn_keys delete FAILED: ${error.message}`);
  else log(`  ✓ ${allKeys.length} vpn_keys`);
}

// 3d. vpn_orders
if (customerIds.length > 0) {
  const { error } = await db.from("vpn_orders").delete().in("customer_id", customerIds);
  if (error) fail(`vpn_orders delete FAILED: ${error.message}`);
  else log(`  ✓ ${allOrders.length} vpn_orders`);
}

// 3e. telegram_links
if (customerIds.length > 0) {
  const { error } = await db.from("telegram_links").delete().in("customer_id", customerIds);
  if (error) warn(`telegram_links: ${error.message}`);
  else log(`  ✓ ${allLinks.length} telegram_links`);
}

// 3f. vpn_customers
if (customerIds.length > 0) {
  const { error } = await db.from("vpn_customers").delete().in("id", customerIds);
  if (error) fail(`vpn_customers delete FAILED: ${error.message}`);
  else log(`  ✓ ${customers.length} vpn_customers`);
}

// 3g. reseller_miniapps
if (foundIds.length > 0) {
  const { error } = await db.from("reseller_miniapps").delete().in("reseller_id", foundIds);
  if (error) warn(`reseller_miniapps: ${error.message}`);
  else log(`  ✓ ${miniapps.length} reseller_miniapps`);
}

// 3h. commission_ledger
if (foundIds.length > 0) {
  const { error } = await db.from("commission_ledger").delete().in("reseller_id", foundIds);
  if (error) warn(`commission_ledger: ${error.message}`);
  else log(`  ✓ ${ledger.length} commission_ledger entries`);
}

// 3i. resellers rows
const { error: resellerDelErr } = await db.from("resellers").delete().in("id", foundIds);
if (resellerDelErr) fail(`resellers delete FAILED: ${resellerDelErr.message}`);
else log(`  ✓ ${foundIds.length} resellers rows`);

// 3j. Supabase auth users
log("Phase 4 — deleting Supabase auth users…");
let authOk = 0, authFailed = 0;
for (const r of resellers) {
  if (!r.supabase_user_id) {
    warn(`  ${r.name}: no supabase_user_id — skipping auth delete`);
    continue;
  }
  const { error } = await db.auth.admin.deleteUser(r.supabase_user_id);
  if (error) {
    warn(`  auth delete failed for ${r.name} (${r.supabase_user_id}): ${error.message}`);
    authFailed++;
  } else {
    log(`  ✓ auth user deleted: ${r.name} (${r.email})`);
    authOk++;
  }
}

// ── Final report ──────────────────────────────────────────────────────────────

console.log();
console.log("══════════════════════════════════════════════════════════════");
console.log("  DONE");
console.log(`  Resellers deleted             : ${foundIds.length}`);
console.log(`  vpn_customers deleted         : ${customers.length}`);
console.log(`  vpn_orders deleted            : ${allOrders.length}`);
console.log(`  vpn_keys deleted              : ${allKeys.length}`);
console.log(`  telegram_links deleted        : ${allLinks.length}`);
if (accessTokens.length > 0)
  console.log(`  access_tokens deleted         : ${accessTokens.length}`);
if (tokenAssignments.length > 0)
  console.log(`  token_server_assignments del  : ${tokenAssignments.length}`);
console.log(`  reseller_miniapps deleted     : ${miniapps.length}`);
if (ledger.length > 0)
  console.log(`  commission_ledger deleted     : ${ledger.length}`);
console.log(`  Outline keys removed          : ${outlineOk}`);
if (outlineGone > 0)  console.log(`  Outline keys already gone    : ${outlineGone}`);
if (outlineFailed > 0) console.log(`  Outline API failures         : ${outlineFailed}`);
console.log(`  Auth users deleted            : ${authOk}`);
if (authFailed > 0)   console.log(`  Auth delete failures         : ${authFailed}`);
console.log("══════════════════════════════════════════════════════════════");
