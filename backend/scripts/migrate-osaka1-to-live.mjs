// One-off production rescue: move the active keys stranded on the dead
// "Osaka #1" Vultr box onto a live premium server, PRESERVING each order's
// remaining data balance (unlike the built-in decommission flow, which
// resets the new key to the full plan limit — see the quota-reset gap,
// 2026-09-09).
//
// The deployed ssconf resolver (routes/public/ssconfRouter.js) serves the
// "most recent active, non-deleted vpn_keys row for the active order", so a
// customer's existing subscription URL picks up the new key with NO action
// on their side.
//
// Safety order per order:
//   1. Compute remaining balance from the order's full key history.
//   2. Create the replacement Outline key on the target server with that
//      exact remaining as its data limit.
//   3. Insert the replacement vpn_keys row (used_bytes = 0).
//   4. Mark the old Osaka #1 key row deleted (the box is dead — no Outline
//      delete call, it would just error).
//   5. Fix telegram_links.current_server_id + token_server_assignments.
//   6. Recompute current_active_keys on the target server.
// If step 3 fails after step 2, the new Outline key is removed so we don't
// leak keys. The customer's OLD (dead) key row is only retired after the new
// one is committed.
//
// DRY RUN by default. To apply:
//   node --env-file=backend/.env backend/scripts/migrate-osaka1-to-live.mjs --prod --execute
//
// Flags:
//   --prod                 required to arm any writes (guards against wrong project)
//   --execute              actually write (otherwise dry run)
//   --target-server-id=<uuid>   override target (default: server named "Tokyo #1")
//   --limit=<n>            process only the first n orders

import { createClient } from "@supabase/supabase-js";
import { createOutlineKey, deleteOutlineKey } from "../src/services/outlineService.js";

const OSAKA1_ID = "e1ef6214-de34-4a52-9f6b-31ca52f47ec8";
const PROD_REF = "daenwuszqdfkbjiatsjs";

const args = new Set(process.argv.slice(2));
const flag = (name) => {
  const p = `${name}=`;
  const hit = [...args].find((a) => a.startsWith(p));
  return hit ? hit.slice(p.length) : null;
};
const EXECUTE = args.has("--execute");
const ARMED = args.has("--prod");
const LIMIT = Number(flag("--limit")) || null;
const TARGET_OVERRIDE = flag("--target-server-id");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const GB = (b) => (b == null ? "unlimited" : (Number(b) / 1073741824).toFixed(2) + " GB");

// --- inlined copy of buildOrderQuotaSnapshot (pure; avoids importing the
//     mid-refactor subscriptionProvisionService module) ------------------------
function usageBytesForQuota(key) {
  return Math.max(Number(key?.used_bytes || 0), Number(key?.used_bytes_30d || 0), 0);
}
function isActiveKey(key) {
  return String(key?.status || "").toLowerCase() === "active" && !key?.deleted_at;
}
function buildOrderQuotaSnapshot(keys = []) {
  const rows = Array.isArray(keys) ? keys : [];
  const totalUsedBytes = rows.reduce((s, k) => s + usageBytesForQuota(k), 0);
  const activeKeys = rows.filter(isActiveKey);
  if (activeKeys.some((k) => k.data_limit_bytes == null)) {
    return { isUnlimited: true, totalUsedBytes, totalAllowanceBytes: null, remainingBytes: null };
  }
  const activeLimitBytes = activeKeys.reduce((max, k) => {
    const v = Number(k?.data_limit_bytes);
    return Number.isFinite(v) && v > max ? v : max;
  }, 0);
  if (activeLimitBytes <= 0) {
    return { isUnlimited: false, totalUsedBytes, totalAllowanceBytes: null, remainingBytes: null };
  }
  const historicalUsedBytes = rows.filter((k) => !isActiveKey(k)).reduce((s, k) => s + usageBytesForQuota(k), 0);
  const totalAllowanceBytes = historicalUsedBytes + activeLimitBytes;
  return {
    isUnlimited: false,
    totalUsedBytes,
    totalAllowanceBytes,
    remainingBytes: Math.max(totalAllowanceBytes - totalUsedBytes, 0),
  };
}

function keyName({ customer, server, plan, orderId }) {
  return [customer?.full_name || "Customer", server?.name || "Server", plan?.name || "Plan", `ORD-${orderId}`].join(" | ");
}

async function recountServer(serverId) {
  const { count } = await supabase
    .from("vpn_keys")
    .select("*", { count: "exact", head: true })
    .eq("server_id", serverId)
    .eq("status", "active")
    .is("deleted_at", null);
  await supabase
    .from("vpn_servers")
    .update({ current_active_keys: count ?? 0, updated_at: new Date().toISOString() })
    .eq("id", serverId);
  return count ?? 0;
}

async function main() {
  console.log("project    :", process.env.SUPABASE_URL);
  console.log("mode       :", EXECUTE ? (ARMED ? "EXECUTE" : "EXECUTE requested but --prod missing → DRY RUN") : "DRY RUN");
  const willWrite = EXECUTE && ARMED;
  if (EXECUTE && !ARMED) {
    console.log("\n⛔ Refusing to write without --prod. Re-run with:  --prod --execute\n");
  }
  if (willWrite && !new RegExp(PROD_REF).test(process.env.SUPABASE_URL || "")) {
    console.error(`⛔ SUPABASE_URL does not look like the known production project (${PROD_REF}). Aborting.`);
    process.exit(1);
  }

  // Target server
  let target;
  if (TARGET_OVERRIDE) {
    ({ data: target } = await supabase.from("vpn_servers").select("*").eq("id", TARGET_OVERRIDE).maybeSingle());
  } else {
    ({ data: target } = await supabase.from("vpn_servers").select("*").eq("name", "Tokyo #1").maybeSingle());
  }
  if (!target) throw new Error("Target server not found (pass --target-server-id=<uuid>)");
  if (target.status !== "active") throw new Error(`Target ${target.name} is not active (status=${target.status})`);
  if (!target.outline_api_url || !target.outline_cert_sha256) throw new Error(`Target ${target.name} missing Outline creds`);
  console.log("target     :", target.name, `(${target.id}) ${target.host_ip}  keys ${target.current_active_keys}/${target.max_active_keys}`);
  console.log();

  // Active keys on Osaka #1
  const { data: strandedKeys, error } = await supabase
    .from("vpn_keys")
    .select("id, order_id, customer_id, reseller_id, outline_key_id, data_limit_bytes, used_bytes")
    .eq("server_id", OSAKA1_ID)
    .eq("status", "active")
    .is("deleted_at", null);
  if (error) throw error;

  let targets = strandedKeys || [];
  if (LIMIT) targets = targets.slice(0, LIMIT);
  console.log(`Stranded active keys on Osaka #1: ${strandedKeys.length}${LIMIT ? ` (processing ${targets.length})` : ""}\n`);

  const capacityLeft = Number(target.max_active_keys || 0) - Number(target.current_active_keys || 0);
  if (targets.length > capacityLeft) {
    console.error(`⛔ Target ${target.name} has capacity ${capacityLeft} but ${targets.length} keys to move. Raise max_active_keys or pick another target.`);
    process.exit(1);
  }

  const orderIds = targets.map((k) => k.order_id);
  const custIds = [...new Set(targets.map((k) => k.customer_id))];
  const { data: orders } = await supabase
    .from("vpn_orders")
    .select("id, plan_id, status, order_type, plan:vpn_plans(id, name, data_limit_gb, is_trial)")
    .in("id", orderIds);
  const { data: custs } = await supabase.from("vpn_customers").select("id, full_name").in("id", custIds);
  const om = new Map((orders || []).map((o) => [o.id, o]));
  const cm = new Map((custs || []).map((c) => [c.id, c]));

  const results = { moved: 0, skipped: 0, failed: 0, dry: 0 };

  for (const oldKey of targets) {
    const order = om.get(oldKey.order_id);
    const customer = cm.get(oldKey.customer_id);
    const who = `${customer?.full_name || oldKey.customer_id} / order ${String(oldKey.order_id).slice(0, 8)}`;

    if (!order || order.status !== "active") {
      console.log(`[SKIP] ${who}: order not active`);
      results.skipped++;
      continue;
    }

    // Idempotency: already has an active key somewhere other than Osaka #1?
    const { data: elsewhere } = await supabase
      .from("vpn_keys")
      .select("id, server_id")
      .eq("order_id", oldKey.order_id)
      .eq("status", "active")
      .is("deleted_at", null)
      .neq("server_id", OSAKA1_ID);
    if (elsewhere && elsewhere.length) {
      console.log(`[SKIP] ${who}: already has an active key on another server`);
      results.skipped++;
      continue;
    }

    // Remaining balance from full key history.
    const { data: allKeys } = await supabase
      .from("vpn_keys")
      .select("id, status, deleted_at, data_limit_bytes, used_bytes")
      .eq("order_id", oldKey.order_id)
      .in("status", ["active", "deleted"]);
    const snap = buildOrderQuotaSnapshot(allKeys || []);

    // TRUE plan remaining = the order's current plan entitlement minus total
    // lifetime usage. We deliberately use plan entitlement rather than the
    // snapshot's allowance because past server-switch/decommission migrations
    // that RESET a key to full plan (the quota-reset bug) inflated the
    // snapshot allowance above the plan for some orders (e.g. Ba Sai 357,
    // ကိုသာထူး 424). Correcting to plan entitlement claws that drift back.
    //   entitlement = order.plan.data_limit_gb  (0 => unlimited)
    // For these 11 the two "extend" payments were trial→paid CONVERSIONS, so
    // the plan limit already IS the entitlement — we must NOT add extend GB
    // (that would re-introduce the double-count). If this script is ever
    // reused on orders with genuine paid→paid additive extends, revisit this.
    const planGb = Number(order.plan?.data_limit_gb ?? 0);
    const isUnlimited = snap.isUnlimited || planGb <= 0;
    const totalUsedBytes = (allKeys || []).reduce(
      (a, k) => a + Math.max(Number(k.used_bytes || 0), 0),
      0
    );
    const planEntitlementBytes = planGb > 0 ? Math.floor(planGb * 1073741824) : null;
    const trueRemainingBytes = isUnlimited
      ? null
      : Math.max(1, Math.floor(planEntitlementBytes - totalUsedBytes));

    const newLimitBytes = trueRemainingBytes; // <-- corrected value the key gets

    const snapRem = snap.isUnlimited ? null : Math.max(0, Math.floor(Number(snap.remainingBytes ?? 0)));
    const drift =
      !isUnlimited && snapRem != null ? (snapRem - newLimitBytes) / 1073741824 : 0;
    const line =
      `${who}: plan ${isUnlimited ? "∞" : planGb + "GB"}, used ${GB(totalUsedBytes)}, ` +
      `TRUE remaining ${isUnlimited ? "unlimited" : GB(newLimitBytes)} ` +
      `(snapshot said ${snap.isUnlimited ? "unlimited" : GB(snapRem)}` +
      `${Math.abs(drift) >= 0.01 ? `, drift -${drift.toFixed(2)}GB` : ""}) → ${target.name}`;

    if (!willWrite) {
      console.log(`[DRY] ${line}`);
      results.dry++;
      continue;
    }

    let createdOutlineKeyId = null;
    try {
      const nk = await createOutlineKey({
        apiUrl: target.outline_api_url,
        certSha256: target.outline_cert_sha256,
        name: keyName({ customer, server: target, plan: order.plan, orderId: oldKey.order_id }),
        dataLimitBytes: newLimitBytes,
      });
      createdOutlineKeyId = nk.outline_key_id;

      const { data: inserted, error: insErr } = await supabase
        .from("vpn_keys")
        .insert({
          order_id: oldKey.order_id,
          customer_id: oldKey.customer_id,
          reseller_id: oldKey.reseller_id,
          server_id: target.id,
          outline_key_id: nk.outline_key_id,
          key_name: nk.key_name,
          access_url: nk.access_url,
          data_limit_bytes: newLimitBytes,
          used_bytes: 0,
          status: "active",
          is_used: true,
          used_at: new Date().toISOString(),
          deleted_at: null,
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw new Error(insErr?.message || "insert vpn_keys failed");

      // Retire the dead Osaka #1 key row (no Outline call — box is gone)
      await supabase
        .from("vpn_keys")
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", oldKey.id);

      // Point miniapp "current server" + legacy token assignment at the new key
      await supabase
        .from("telegram_links")
        .update({ current_server_id: target.id })
        .eq("customer_id", oldKey.customer_id)
        .eq("current_server_id", OSAKA1_ID);

      const { data: tok } = await supabase
        .from("access_tokens")
        .select("id")
        .eq("order_id", oldKey.order_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (tok?.id) {
        await supabase.from("token_server_assignments").update({ is_active: false }).eq("token_id", tok.id);
        await supabase.from("token_server_assignments").insert({
          token_id: tok.id,
          server_id: target.id,
          vpn_key_id: inserted.id,
          is_active: true,
        });
      }

      console.log(`[MOVED] ${line}  (key ${inserted.id.slice(0, 8)})`);
      results.moved++;
    } catch (err) {
      if (createdOutlineKeyId) {
        try {
          await deleteOutlineKey({
            apiUrl: target.outline_api_url,
            certSha256: target.outline_cert_sha256,
            outlineKeyId: createdOutlineKeyId,
          });
        } catch {}
      }
      console.error(`[FAIL] ${who}: ${err.message}`);
      results.failed++;
    }
  }

  if (willWrite && results.moved > 0) {
    const n = await recountServer(target.id);
    await recountServer(OSAKA1_ID);
    console.log(`\nRecounted ${target.name}: current_active_keys = ${n}`);
  }

  console.log("\nSummary:", results);
  if (!willWrite) console.log("Dry run only — no changes. Add --prod --execute to apply.");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FATAL:", e); process.exit(1); });
