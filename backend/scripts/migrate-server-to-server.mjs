// Generalized one-off migration: move all ACTIVE keys from --source-server-id
// onto --target-server-id, giving each new key the order's TRUE PLAN REMAINING
// (plan entitlement − total lifetime used), which corrects historical
// server-switch/reset drift (allowance floating above plan). Same tested flow
// as migrate-osaka1-to-live.mjs, parameterized.
//
// The deployed ssconf resolver serves the most-recent active, non-deleted
// vpn_keys row for the active order, so customers' subscription URLs pick up
// the new key automatically. The old source key's DB row is retired but its
// Outline key is left alive on the (still-running) source server, so there is
// ZERO forced downtime until the source server is destroyed — stragglers keep
// working on the source until then, and reconnect onto the target via ssconf.
//
// Entitlement rule: plan.data_limit_gb (0/null = unlimited). We deliberately
// do NOT add extend/topup package GB, because in this fleet those were trial→paid
// CONVERSIONS whose plan limit already IS the entitlement (adding would
// double-count); renewals already point the current order at the renewed plan.
// Verified against the data before running. Revisit if reused elsewhere.
//
// DRY RUN by default. Canary one order:  --prod --execute --limit=1
// Apply all:                             --prod --execute
//
//   node --env-file=backend/.env backend/scripts/migrate-server-to-server.mjs \
//     --source-server-id=<uuid> --target-server-id=<uuid> --prod --execute

import { createClient } from "@supabase/supabase-js";
import { createOutlineKey, deleteOutlineKey } from "../src/services/outlineService.js";

const PROD_REF = "daenwuszqdfkbjiatsjs";
const GB = 1073741824;

const args = new Set(process.argv.slice(2));
const flag = (name) => {
  const p = `${name}=`;
  const hit = [...args].find((a) => a.startsWith(p));
  return hit ? hit.slice(p.length) : null;
};
const EXECUTE = args.has("--execute");
const ARMED = args.has("--prod");
const LIMIT = Number(flag("--limit")) || null;
const SOURCE_ID = flag("--source-server-id");
const TARGET_ID = flag("--target-server-id");

if (!SOURCE_ID || !TARGET_ID) {
  console.error("Required: --source-server-id=<uuid> --target-server-id=<uuid>");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const G = (b) => (b == null ? "unlimited" : (Number(b) / GB).toFixed(2) + " GB");

function keyName({ customer, server, plan, orderId }) {
  return [customer?.full_name || "Customer", server?.name || "Server", plan?.name || "Plan", `ORD-${orderId}`].join(" | ");
}

async function recountServer(serverId) {
  const { count } = await supabase
    .from("vpn_keys").select("*", { count: "exact", head: true })
    .eq("server_id", serverId).eq("status", "active").is("deleted_at", null);
  await supabase.from("vpn_servers")
    .update({ current_active_keys: count ?? 0, updated_at: new Date().toISOString() })
    .eq("id", serverId);
  return count ?? 0;
}

async function main() {
  console.log("project :", process.env.SUPABASE_URL);
  const willWrite = EXECUTE && ARMED;
  console.log("mode    :", willWrite ? "EXECUTE" : "DRY RUN");
  if (willWrite && !new RegExp(PROD_REF).test(process.env.SUPABASE_URL || "")) {
    console.error(`Refusing: SUPABASE_URL is not the known prod project (${PROD_REF}).`); process.exit(1);
  }

  const { data: source } = await supabase.from("vpn_servers").select("*").eq("id", SOURCE_ID).maybeSingle();
  const { data: target } = await supabase.from("vpn_servers").select("*").eq("id", TARGET_ID).maybeSingle();
  if (!source) throw new Error("source server not found");
  if (!target) throw new Error("target server not found");
  if (target.status !== "active") throw new Error(`target ${target.name} not active`);
  if (!target.outline_api_url || !target.outline_cert_sha256) throw new Error(`target ${target.name} missing Outline creds`);
  console.log("source  :", source.name, source.host_ip);
  console.log("target  :", target.name, target.host_ip, `keys ${target.current_active_keys}/${target.max_active_keys}`);
  console.log();

  const { data: stranded, error } = await supabase
    .from("vpn_keys")
    .select("id, order_id, customer_id, reseller_id, outline_key_id")
    .eq("server_id", SOURCE_ID).eq("status", "active").is("deleted_at", null);
  if (error) throw error;

  let targets = stranded || [];
  if (LIMIT) targets = targets.slice(0, LIMIT);
  console.log(`Active keys on source: ${stranded.length}${LIMIT ? ` (processing ${targets.length})` : ""}`);

  const capacityLeft = Number(target.max_active_keys || 0) - Number(target.current_active_keys || 0);
  if (targets.length > capacityLeft) {
    console.error(`Refusing: target capacity ${capacityLeft} < ${targets.length} keys to move.`); process.exit(1);
  }

  const oidList = targets.map((k) => k.order_id);
  const cidList = [...new Set(targets.map((k) => k.customer_id))];
  const { data: orders } = await supabase
    .from("vpn_orders").select("id, status, plan:vpn_plans(id, name, data_limit_gb)").in("id", oidList);
  const { data: custs } = await supabase.from("vpn_customers").select("id, full_name").in("id", cidList);
  const om = new Map((orders || []).map((o) => [o.id, o]));
  const cm = new Map((custs || []).map((c) => [c.id, c]));

  const results = { moved: 0, skipped: 0, failed: 0, dry: 0 };

  for (const oldKey of targets) {
    const order = om.get(oldKey.order_id);
    const customer = cm.get(oldKey.customer_id);
    const who = `${customer?.full_name || oldKey.customer_id} / ${String(oldKey.order_id).slice(0, 8)}`;

    if (!order || order.status !== "active") { console.log(`[SKIP] ${who}: order not active`); results.skipped++; continue; }

    const { data: elsewhere } = await supabase
      .from("vpn_keys").select("id").eq("order_id", oldKey.order_id)
      .eq("status", "active").is("deleted_at", null).neq("server_id", SOURCE_ID);
    if (elsewhere && elsewhere.length) { console.log(`[SKIP] ${who}: already active on another server`); results.skipped++; continue; }

    // TRUE plan remaining = plan entitlement − total lifetime used.
    const { data: allKeys } = await supabase
      .from("vpn_keys").select("used_bytes").eq("order_id", oldKey.order_id).in("status", ["active", "deleted"]);
    const totalUsed = (allKeys || []).reduce((a, k) => a + Math.max(Number(k.used_bytes || 0), 0), 0);
    const planGb = Number(order.plan?.data_limit_gb ?? 0);
    const unlimited = planGb <= 0;
    const newLimitBytes = unlimited ? null : Math.max(1, Math.floor(planGb * GB - totalUsed));

    const line = `${who}: plan ${unlimited ? "∞" : planGb + "GB"}, used ${G(totalUsed)}, new key ${G(newLimitBytes)} → ${target.name}`;
    if (!willWrite) { console.log(`[DRY] ${line}`); results.dry++; continue; }

    let createdOutlineKeyId = null;
    try {
      const nk = await createOutlineKey({
        apiUrl: target.outline_api_url, certSha256: target.outline_cert_sha256,
        name: keyName({ customer, server: target, plan: order.plan, orderId: oldKey.order_id }),
        dataLimitBytes: newLimitBytes,
      });
      createdOutlineKeyId = nk.outline_key_id;

      const { data: inserted, error: insErr } = await supabase.from("vpn_keys").insert({
        order_id: oldKey.order_id, customer_id: oldKey.customer_id, reseller_id: oldKey.reseller_id,
        server_id: target.id, outline_key_id: nk.outline_key_id, key_name: nk.key_name,
        access_url: nk.access_url, data_limit_bytes: newLimitBytes, used_bytes: 0,
        status: "active", is_used: true, used_at: new Date().toISOString(), deleted_at: null,
      }).select("id").single();
      if (insErr || !inserted) throw new Error(insErr?.message || "insert failed");

      // Retire the old source DB row. Leave the source Outline key alive (source
      // still running → zero forced downtime until it is destroyed).
      await supabase.from("vpn_keys").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", oldKey.id);

      await supabase.from("telegram_links").update({ current_server_id: target.id })
        .eq("customer_id", oldKey.customer_id).eq("current_server_id", SOURCE_ID);

      const { data: tok } = await supabase.from("access_tokens").select("id")
        .eq("order_id", oldKey.order_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (tok?.id) {
        await supabase.from("token_server_assignments").update({ is_active: false }).eq("token_id", tok.id);
        await supabase.from("token_server_assignments").insert({ token_id: tok.id, server_id: target.id, vpn_key_id: inserted.id, is_active: true });
      }

      console.log(`[MOVED] ${line}  (key ${inserted.id.slice(0, 8)})`);
      results.moved++;
    } catch (err) {
      if (createdOutlineKeyId) {
        try { await deleteOutlineKey({ apiUrl: target.outline_api_url, certSha256: target.outline_cert_sha256, outlineKeyId: createdOutlineKeyId }); } catch {}
      }
      console.error(`[FAIL] ${who}: ${err.message}`); results.failed++;
    }
  }

  if (willWrite && results.moved > 0) {
    const n = await recountServer(target.id);
    await recountServer(SOURCE_ID);
    console.log(`\nRecounted ${target.name}: current_active_keys = ${n}`);
  }
  console.log("\nSummary:", results);
  if (!willWrite) console.log("Dry run only. Add --prod --execute to apply.");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FATAL:", e); process.exit(1); });
