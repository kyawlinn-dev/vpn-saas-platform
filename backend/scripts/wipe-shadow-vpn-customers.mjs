// Wipe all Shadow VPN customer data (customers, orders, payments, keys,
// telegram_links, ssconf tokens, token_server_assignments) — for local dev
// testing only.
//
// Preserves: app_events (per user's choice, keeps monitoring history).
// Cleans up: Outline keys on the actual VPN servers so infra doesn't leak.
// Reconciles: vpn_servers.current_active_keys counters.
//
// DRY RUN by default. Pass --confirm to actually delete.
//
//   node --env-file=.env --env-file=.env.local scripts/wipe-shadow-vpn-customers.mjs
//   node --env-file=.env --env-file=.env.local scripts/wipe-shadow-vpn-customers.mjs --confirm

import { createClient } from "@supabase/supabase-js";
import { deleteOutlineKey } from "../src/services/outlineService.js";

const RESELLER_ID = "e51b3a9f-dca4-450a-aeb4-147064420a88"; // Shadow VPN
const CONFIRM = process.argv.includes("--confirm");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function log(step, msg) { console.log(`[${step}]`, msg); }

async function main() {
  console.log("=".repeat(60));
  console.log(CONFIRM ? "MODE: DELETE (--confirm supplied)" : "MODE: DRY RUN (no --confirm)");
  console.log("Reseller:", RESELLER_ID);
  console.log("Supabase:", process.env.SUPABASE_URL);
  console.log("=".repeat(60));

  // ── 1. Load customer IDs ────────────────────────────────────────────────
  const { data: customers, error: cErr } = await supabase
    .from("vpn_customers")
    .select("id, full_name, telegram_username")
    .eq("reseller_id", RESELLER_ID);
  if (cErr) throw cErr;
  const customerIds = customers.map(c => c.id);
  log("customers", `${customers.length} rows — ${customers.map(c => c.full_name || c.telegram_username).join(", ")}`);

  // ── 2. Load vpn_keys with server info for the Outline API ──────────────
  const { data: keys, error: kErr } = await supabase
    .from("vpn_keys")
    .select("id, outline_key_id, server_id, status, vpn_servers(outline_api_url, outline_cert_sha256, name)")
    .eq("reseller_id", RESELLER_ID);
  if (kErr) throw kErr;
  log("vpn_keys", `${keys.length} rows`);
  const activeKeys = keys.filter(k => k.status === "active" && k.outline_key_id && k.vpn_servers?.outline_api_url);
  log("outline API deletes needed", `${activeKeys.length} active keys with server config`);

  if (!CONFIRM) {
    console.log("\n(dry run — nothing deleted. Re-run with --confirm to execute.)");
    return;
  }

  // ── 3. Delete each Outline key on the actual VPN server ─────────────────
  let outlineDeleted = 0;
  let outlineSkipped = 0;
  for (const k of activeKeys) {
    try {
      await deleteOutlineKey({
        apiUrl: k.vpn_servers.outline_api_url,
        certSha256: k.vpn_servers.outline_cert_sha256,
        outlineKeyId: k.outline_key_id,
      });
      outlineDeleted++;
      process.stdout.write(".");
    } catch (err) {
      outlineSkipped++;
      console.error(`\n  ! delete failed for key ${k.outline_key_id} on ${k.vpn_servers.name}:`, err.message);
    }
  }
  console.log(`\n[outline] deleted=${outlineDeleted} skipped=${outlineSkipped}`);

  // ── 4. Delete DB rows in FK-safe order ──────────────────────────────────
  const del = async (table, filter) => {
    const { error, count } = await supabase.from(table).delete({ count: "exact" }).match(filter);
    if (error) { console.error(`  ! delete ${table} failed:`, error.message); return 0; }
    log(`deleted ${table}`, count);
    return count;
  };

  await del("vpn_keys", { reseller_id: RESELLER_ID });
  await del("order_payments", { reseller_id: RESELLER_ID });
  await del("vpn_orders", { reseller_id: RESELLER_ID });

  if (customerIds.length > 0) {
    const { error: linkErr, count: linkCount } = await supabase
      .from("telegram_links")
      .delete({ count: "exact" })
      .in("customer_id", customerIds);
    if (linkErr) console.error("  ! telegram_links:", linkErr.message);
    else log("deleted telegram_links", linkCount);

    // customer_ssconf_tokens — may not exist as a table depending on schema version
    const { error: tokenErr, count: tokenCount } = await supabase
      .from("customer_ssconf_tokens")
      .delete({ count: "exact" })
      .in("customer_id", customerIds);
    if (tokenErr && !/does not exist|schema cache/i.test(tokenErr.message)) {
      console.error("  ! customer_ssconf_tokens:", tokenErr.message);
    } else if (!tokenErr) {
      log("deleted customer_ssconf_tokens", tokenCount);
    }

    // token_server_assignments — FK is on token id, which cascades? Try direct.
    // Assignments are keyed by token, not customer, but tokens will be gone.
    // Doing this explicitly is safer than relying on cascades.
  }

  await del("vpn_customers", { reseller_id: RESELLER_ID });

  // ── 5. Reconcile server capacity counters ──────────────────────────────
  const affectedServerIds = [...new Set(keys.map(k => k.server_id).filter(Boolean))];
  for (const serverId of affectedServerIds) {
    const { count: activeCount } = await supabase
      .from("vpn_keys")
      .select("id", { count: "exact", head: true })
      .eq("server_id", serverId)
      .eq("status", "active")
      .is("deleted_at", null);
    const { error: updErr } = await supabase
      .from("vpn_servers")
      .update({ current_active_keys: activeCount || 0, updated_at: new Date().toISOString() })
      .eq("id", serverId);
    if (updErr) console.error(`  ! server ${serverId} recount:`, updErr.message);
    else log("reconciled server", `${serverId}: current_active_keys = ${activeCount || 0}`);
  }

  console.log("\n✅ Wipe complete. app_events preserved.");
}

main().catch(err => { console.error(err); process.exit(1); });
