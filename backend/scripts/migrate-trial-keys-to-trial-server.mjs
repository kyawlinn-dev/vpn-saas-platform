// One-off production maintenance script.
//
// Moves active trial-order keys from premium/non-trial Outline servers onto a
// dedicated server_tier='trial' server while preserving each customer's
// remaining trial quota.
//
// Dry run is the default:
//   node scripts/migrate-trial-keys-to-trial-server.mjs
//
// Execute explicitly after reviewing dry-run output:
//   node scripts/migrate-trial-keys-to-trial-server.mjs --target-server-id=<uuid> --execute
//
// Optional flags:
//   --target-server-id=<uuid>  Use a specific trial server. Otherwise first ready trial server.
//   --reseller-id=<uuid>       Limit to one reseller.
//   --limit=<number>           Limit how many candidate orders to process.
//
// Safety order per order:
//   1. Create the replacement key on the trial server.
//   2. Store the replacement DB row.
//   3. Delete the old Outline key.
//   4. Mark the old DB row deleted and decrement old server usage.
//
// If old key deletion fails, the new key is rolled back so customers keep their
// current working access until the failure can be investigated.

import { supabase } from "../src/lib/supabase.js";
import {
  clearServerError,
  decrementServerUsage,
  getActiveServers,
  getServerById,
  incrementServerUsage,
} from "../src/services/serverService.js";
import {
  createOutlineKey,
  deleteOutlineKey,
  getOutlineTransferMetrics,
} from "../src/services/outlineService.js";
import { getTokenByOrderId } from "../src/services/tokenService.js";
import {
  keyUsageForMigration,
  replacementDataLimitBytesForMigration,
} from "../src/services/trialKeyMigrationService.js";

const args = new Set(process.argv.slice(2));
const EXECUTE = args.has("--execute") || args.has("--apply");

function getFlagValue(name) {
  const prefix = `${name}=`;
  const match = [...args].find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : null;
}

function toPositiveInteger(value, fallback = null) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
}

function normalizeTier(value) {
  return String(value || "").trim().toLowerCase() === "trial" ? "trial" : "premium";
}

function isReadyTrialServer(server) {
  return (
    server &&
    String(server.status || "").toLowerCase() === "active" &&
    normalizeTier(server.server_tier) === "trial" &&
    typeof server.outline_api_url === "string" &&
    server.outline_api_url.trim() &&
    typeof server.outline_cert_sha256 === "string" &&
    server.outline_cert_sha256.trim()
  );
}

function hasCapacity(server) {
  const current = Number(server?.current_active_keys || 0);
  const max = Number(server?.max_active_keys || 0);
  return max > 0 && current < max;
}

function formatBytes(value) {
  if (value == null) return "unlimited";
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "unknown";
  const gb = bytes / 1024 / 1024 / 1024;
  return `${gb.toFixed(gb >= 10 ? 1 : 2)} GB`;
}

function byId(rows = []) {
  return new Map((rows || []).map((row) => [row.id, row]));
}

function buildKeyName({ customer, server, order, plan }) {
  return [
    customer?.full_name || "Customer",
    server?.name || "Trial Server",
    plan?.name || "Trial",
    `ORD-${order.id}`,
  ].join(" | ");
}

async function findTrialTargetServer() {
  const targetServerId = getFlagValue("--target-server-id");

  if (targetServerId) {
    const server = await getServerById(targetServerId);
    if (!isReadyTrialServer(server)) {
      throw new Error(
        `Target server ${targetServerId} is not an active, ready trial server.`
      );
    }
    if (!hasCapacity(server)) {
      throw new Error(`Target server ${server.name} is full.`);
    }
    return server;
  }

  const [server] = await getActiveServers({ serverTier: "trial", limit: 1 });
  if (!server) {
    throw new Error(
      "No active, ready server_tier='trial' server found. Add the trial server first, then re-run."
    );
  }
  return server;
}

async function fetchActiveKeys(resellerId) {
  let query = supabase
    .from("vpn_keys")
    .select(
      "id, order_id, customer_id, reseller_id, server_id, outline_key_id, key_name, access_url, data_limit_bytes, used_bytes, status, deleted_at, created_at"
    )
    .eq("status", "active")
    .is("deleted_at", null)
    .not("order_id", "is", null)
    .not("server_id", "is", null);

  if (resellerId) query = query.eq("reseller_id", resellerId);

  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchOrders(orderIds) {
  if (!orderIds.length) return new Map();

  const { data, error } = await supabase
    .from("vpn_orders")
    .select(
      "id, customer_id, reseller_id, status, order_type, plan_id, expiry_date, plan:vpn_plans(id, name, data_limit_gb), customer:vpn_customers!vpn_orders_customer_id_fkey(id, full_name)"
    )
    .in("id", orderIds);

  if (error) throw new Error(error.message);
  return byId(data || []);
}

async function fetchServers(serverIds) {
  if (!serverIds.length) return new Map();

  const { data, error } = await supabase
    .from("vpn_servers")
    .select(
      "id, name, server_tier, status, outline_api_url, outline_cert_sha256, current_active_keys, max_active_keys"
    )
    .in("id", serverIds);

  if (error) throw new Error(error.message);
  return byId(data || []);
}

async function fetchOrderKeys(orderIds) {
  if (!orderIds.length) return new Map();

  const { data, error } = await supabase
    .from("vpn_keys")
    .select(
      "id, order_id, customer_id, reseller_id, server_id, outline_key_id, data_limit_bytes, used_bytes, status, deleted_at, created_at"
    )
    .in("order_id", orderIds)
    .in("status", ["active", "deleted"]);

  if (error) throw new Error(error.message);

  const grouped = new Map();
  for (const key of data || []) {
    const rows = grouped.get(key.order_id) || [];
    rows.push(key);
    grouped.set(key.order_id, rows);
  }
  return grouped;
}

async function fetchMetricsByServer(serversById, sourceServerIds) {
  const metricsByServerId = new Map();

  for (const serverId of sourceServerIds) {
    const server = serversById.get(serverId);
    if (!server?.outline_api_url || !server?.outline_cert_sha256) {
      metricsByServerId.set(serverId, {
        metrics: {},
        error: "Missing Outline API config on source server",
      });
      continue;
    }

    try {
      const metrics = await getOutlineTransferMetrics({
        apiUrl: server.outline_api_url,
        certSha256: server.outline_cert_sha256,
      });
      metricsByServerId.set(serverId, { metrics: metrics || {}, error: null });
    } catch (error) {
      metricsByServerId.set(serverId, { metrics: {}, error: error.message });
    }
  }

  return metricsByServerId;
}

function buildCandidates({ activeKeys, ordersById, serversById, orderKeysByOrderId, targetServer }) {
  const byOrderId = new Map();

  for (const key of activeKeys) {
    const rows = byOrderId.get(key.order_id) || [];
    rows.push(key);
    byOrderId.set(key.order_id, rows);
  }

  const candidates = [];
  const skipped = [];

  for (const [orderId, orderActiveKeys] of byOrderId.entries()) {
    const order = ordersById.get(orderId);
    const sourceKeys = orderActiveKeys.filter((key) => key.server_id !== targetServer.id);
    const targetKeys = orderActiveKeys.filter((key) => key.server_id === targetServer.id);
    const sourceKey = sourceKeys[0];
    const sourceServer = sourceKey ? serversById.get(sourceKey.server_id) : null;

    const label = order?.customer?.full_name || sourceKey?.customer_id || orderId;

    if (!order) {
      skipped.push({ orderId, label, reason: "order_not_found" });
      continue;
    }

    if (order.order_type !== "trial" || order.status !== "active") {
      continue;
    }

    if (targetKeys.length) {
      skipped.push({ orderId, label, reason: "already_has_active_trial_server_key" });
      continue;
    }

    if (sourceKeys.length !== 1) {
      skipped.push({ orderId, label, reason: `expected_1_source_key_found_${sourceKeys.length}` });
      continue;
    }

    if (!sourceServer) {
      skipped.push({ orderId, label, reason: "source_server_not_found" });
      continue;
    }

    if (normalizeTier(sourceServer.server_tier) === "trial") {
      skipped.push({ orderId, label, reason: "source_server_is_already_trial_tier" });
      continue;
    }

    if (!sourceKey.outline_key_id) {
      skipped.push({ orderId, label, reason: "missing_outline_key_id" });
      continue;
    }

    if (!sourceServer.outline_api_url || !sourceServer.outline_cert_sha256) {
      skipped.push({ orderId, label, reason: "missing_source_outline_config" });
      continue;
    }

    candidates.push({
      order,
      sourceKey,
      sourceServer,
      allOrderKeys: orderKeysByOrderId.get(orderId) || orderActiveKeys,
    });
  }

  return { candidates, skipped };
}

function metricsForCandidate(candidate, metricsByServerId) {
  return metricsByServerId.get(candidate.sourceServer.id) || {
    metrics: {},
    error: "Metrics not fetched",
  };
}

async function deleteNewOutlineKeyBestEffort({ targetServer, outlineKeyId }) {
  if (!outlineKeyId) return;

  try {
    await deleteOutlineKey({
      apiUrl: targetServer.outline_api_url,
      certSha256: targetServer.outline_cert_sha256,
      outlineKeyId,
    });
  } catch (error) {
    console.warn(`    rollback warning: new Outline key cleanup failed: ${error.message}`);
  }
}

async function markNewDbKeyDeletedBestEffort(keyId) {
  if (!keyId) return;

  try {
    await supabase
      .from("vpn_keys")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", keyId);
  } catch (error) {
    console.warn(`    rollback warning: new DB key cleanup failed: ${error.message}`);
  }
}

async function refreshLegacyTokenAssignment({ order, targetServer, newVpnKey }) {
  try {
    const token = await getTokenByOrderId(order.id);
    if (!token?.id) return;

    await supabase
      .from("token_server_assignments")
      .update({ is_active: false })
      .eq("token_id", token.id);

    const { error } = await supabase.from("token_server_assignments").insert({
      token_id: token.id,
      server_id: targetServer.id,
      vpn_key_id: newVpnKey.id,
      is_active: true,
    });

    if (error) throw new Error(error.message);
  } catch (error) {
    console.warn(`    warning: legacy token assignment update failed: ${error.message}`);
  }
}

async function refreshTelegramCurrentServer({ order, sourceServerId, targetServerId }) {
  try {
    const { error } = await supabase
      .from("telegram_links")
      .update({ current_server_id: targetServerId })
      .eq("customer_id", order.customer_id)
      .eq("reseller_id", order.reseller_id)
      .eq("current_server_id", sourceServerId);

    if (error) throw new Error(error.message);
  } catch (error) {
    console.warn(`    warning: telegram current server update failed: ${error.message}`);
  }
}

async function migrateCandidate({ candidate, targetServer, metricsByKeyId }) {
  const now = new Date().toISOString();
  const { order, sourceKey, sourceServer, allOrderKeys } = candidate;
  const dataLimitBytes = replacementDataLimitBytesForMigration(allOrderKeys, metricsByKeyId);
  const oldUsedBytes = keyUsageForMigration(sourceKey, metricsByKeyId);
  const keyName = buildKeyName({
    customer: order.customer,
    server: targetServer,
    order,
    plan: order.plan,
  });

  let outlineKeyId = null;
  let insertedKey = null;
  let incrementedTarget = false;
  let oldOutlineDeleted = false;

  try {
    const outlineKey = await createOutlineKey({
      apiUrl: targetServer.outline_api_url,
      certSha256: targetServer.outline_cert_sha256,
      name: keyName,
      dataLimitBytes,
    });
    outlineKeyId = outlineKey.outline_key_id;

    const { data, error: insertError } = await supabase
      .from("vpn_keys")
      .insert({
        order_id: order.id,
        customer_id: order.customer_id,
        reseller_id: order.reseller_id,
        server_id: targetServer.id,
        outline_key_id: outlineKey.outline_key_id,
        key_name: outlineKey.key_name || keyName,
        access_url: outlineKey.access_url,
        data_limit_bytes: dataLimitBytes,
        used_bytes: 0,
        status: "active",
        is_used: true,
        used_at: now,
      })
      .select()
      .single();

    if (insertError || !data) {
      throw new Error(insertError?.message || "Failed to store replacement vpn key");
    }
    insertedKey = data;

    await incrementServerUsage(targetServer.id);
    incrementedTarget = true;
    await clearServerError(targetServer.id);

    await deleteOutlineKey({
      apiUrl: sourceServer.outline_api_url,
      certSha256: sourceServer.outline_cert_sha256,
      outlineKeyId: sourceKey.outline_key_id,
    });
    oldOutlineDeleted = true;

    const { error: updateOldError } = await supabase
      .from("vpn_keys")
      .update({
        status: "deleted",
        deleted_at: now,
        used_bytes: oldUsedBytes,
      })
      .eq("id", sourceKey.id);

    if (updateOldError) throw new Error(updateOldError.message);

    await decrementServerUsage(sourceServer.id);
    await refreshLegacyTokenAssignment({ order, targetServer, newVpnKey: insertedKey });
    await refreshTelegramCurrentServer({
      order,
      sourceServerId: sourceServer.id,
      targetServerId: targetServer.id,
    });

    return insertedKey;
  } catch (error) {
    if (oldOutlineDeleted) {
      throw new Error(
        `${error.message}. The old Outline key was already deleted, so the replacement key was kept active. Review old DB key ${sourceKey.id} manually.`
      );
    }

    if (insertedKey?.id) {
      await markNewDbKeyDeletedBestEffort(insertedKey.id);
    }
    if (incrementedTarget) {
      try {
        await decrementServerUsage(targetServer.id);
      } catch (decrementError) {
        console.warn(`    rollback warning: target usage decrement failed: ${decrementError.message}`);
      }
    }
    await deleteNewOutlineKeyBestEffort({ targetServer, outlineKeyId });
    throw error;
  }
}

async function main() {
  const resellerId = getFlagValue("--reseller-id");
  const limit = toPositiveInteger(getFlagValue("--limit"));
  const targetServer = await findTrialTargetServer();

  console.log(EXECUTE ? "Mode: EXECUTE" : "Mode: DRY RUN");
  console.log(`Trial target: ${targetServer.name} (${targetServer.id})`);
  if (resellerId) console.log(`Reseller filter: ${resellerId}`);
  if (limit) console.log(`Limit: ${limit}`);
  console.log("");

  const activeKeys = await fetchActiveKeys(resellerId);
  const orderIds = [...new Set(activeKeys.map((key) => key.order_id).filter(Boolean))];
  const serverIds = [...new Set(activeKeys.map((key) => key.server_id).filter(Boolean))];

  const [ordersById, serversById, orderKeysByOrderId] = await Promise.all([
    fetchOrders(orderIds),
    fetchServers(serverIds),
    fetchOrderKeys(orderIds),
  ]);

  const { candidates: allCandidates, skipped } = buildCandidates({
    activeKeys,
    ordersById,
    serversById,
    orderKeysByOrderId,
    targetServer,
  });
  const candidates = limit ? allCandidates.slice(0, limit) : allCandidates;

  console.log(`Candidate trial orders: ${allCandidates.length}`);
  if (limit && allCandidates.length > candidates.length) {
    console.log(`Processing first ${candidates.length} because --limit is set.`);
  }
  if (skipped.length) {
    console.log(`Skipped rows needing review: ${skipped.length}`);
    for (const item of skipped.slice(0, 20)) {
      console.log(`  - ${item.label} (${item.orderId}): ${item.reason}`);
    }
    if (skipped.length > 20) {
      console.log(`  ... ${skipped.length - 20} more skipped row(s)`);
    }
  }
  console.log("");

  const sourceServerIds = [...new Set(candidates.map((item) => item.sourceServer.id))];
  const metricsByServerId = await fetchMetricsByServer(serversById, sourceServerIds);

  const results = {
    migrated: 0,
    dryRun: 0,
    failed: 0,
    skippedMetrics: 0,
  };

  for (const candidate of candidates) {
    const { order, sourceKey, sourceServer } = candidate;
    const { metrics, error: metricsError } = metricsForCandidate(candidate, metricsByServerId);
    const label = `${order.customer?.full_name || order.customer_id} / order ${order.id}`;

    if (metricsError) {
      console.log(`[SKIP] ${label}: cannot read source usage metrics (${metricsError})`);
      results.skippedMetrics++;
      continue;
    }

    const nextLimit = replacementDataLimitBytesForMigration(candidate.allOrderKeys, metrics);
    const oldUsedBytes = keyUsageForMigration(sourceKey, metrics);

    console.log(
      `${EXECUTE ? "[MOVE]" : "[DRY RUN]"} ${label}: ` +
        `${sourceServer.name} -> ${targetServer.name}, ` +
        `used ${formatBytes(oldUsedBytes)}, replacement limit ${formatBytes(nextLimit)}`
    );

    if (!EXECUTE) {
      results.dryRun++;
      continue;
    }

    try {
      const newKey = await migrateCandidate({
        candidate,
        targetServer,
        metricsByKeyId: metrics,
      });
      console.log(`  created replacement key ${newKey.id}`);
      results.migrated++;
    } catch (error) {
      console.error(`  FAILED: ${error.message}`);
      results.failed++;
    }
  }

  console.log("");
  console.log("Summary:", results);
  if (!EXECUTE) {
    console.log("No database writes or key changes were made. Re-run with --execute to migrate.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error.message);
    process.exit(1);
  });
