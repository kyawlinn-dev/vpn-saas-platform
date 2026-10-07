#!/usr/bin/env node

import "../src/lib/loadEnv.js";
import { supabase } from "../src/lib/supabase.js";
import { getServerById } from "../src/services/serverService.js";
import { getKey, updateKeyDataLimit } from "../src/services/vpnProviderService.js";
import { buildOrderQuotaSnapshot } from "../src/services/subscriptionProvisionService.js";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function requiredInteger(name) {
  const rawValue = argument(name);
  if (rawValue == null) throw new Error(`--${name} is required`);
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative safe integer`);
  }
  return value;
}

function toGb(bytes) {
  return Number((Number(bytes || 0) / 1024 / 1024 / 1024).toFixed(2));
}

const orderId = argument("order-id");
const usageBaselineBytes = requiredInteger("usage-baseline-bytes");
const quotaLimitBytes = requiredInteger("quota-limit-bytes");
const apply = process.argv.includes("--apply");

if (!orderId) throw new Error("--order-id is required");
if (quotaLimitBytes <= 0) throw new Error("This repair command requires a finite positive quota");

const { data: order, error: orderError } = await supabase
  .from("vpn_orders")
  .select("id, customer_id, reseller_id, expiry_date, usage_baseline_bytes, quota_limit_bytes")
  .eq("id", orderId)
  .single();
if (orderError || !order) throw new Error(orderError?.message || "Order not found");

const { data: keys, error: keysError } = await supabase
  .from("vpn_keys")
  .select("id, server_id, outline_key_id, status, deleted_at, data_limit_bytes, used_bytes")
  .eq("order_id", orderId)
  .in("status", ["active", "deleted"])
  .order("created_at", { ascending: true });
if (keysError) throw new Error(keysError.message);

const activeKeys = (keys || []).filter((key) => key.status === "active" && !key.deleted_at);
if (activeKeys.length !== 1) {
  throw new Error(`Expected exactly one active key; found ${activeKeys.length}`);
}

const activeKey = activeKeys[0];
const server = await getServerById(activeKey.server_id);
const panelUser = await getKey({ server, keyId: activeKey.outline_key_id });
if (!panelUser) throw new Error("Active Marzneshin user was not found");

const liveActiveUsedBytes = Math.max(
  Number(activeKey.used_bytes || 0),
  Number(panelUser.used_traffic || 0)
);
const keysWithLiveUsage = (keys || []).map((key) =>
  key.id === activeKey.id ? { ...key, used_bytes: liveActiveUsedBytes } : key
);
const quota = buildOrderQuotaSnapshot(keysWithLiveUsage, {
  usage_baseline_bytes: usageBaselineBytes,
  quota_limit_bytes: quotaLimitBytes,
});
const activePanelLimitBytes = liveActiveUsedBytes + Number(quota.remainingBytes || 0);

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  project: new URL(process.env.SUPABASE_URL).hostname,
  order_id: order.id,
  active_key_id: activeKey.id,
  usage_baseline_bytes: usageBaselineBytes,
  quota_limit_bytes: quotaLimitBytes,
  period_used_bytes: quota.totalUsedBytes,
  period_used_gb: toGb(quota.totalUsedBytes),
  remaining_bytes: quota.remainingBytes,
  remaining_gb: toGb(quota.remainingBytes),
  live_active_used_bytes: liveActiveUsedBytes,
  active_panel_limit_bytes: activePanelLimitBytes,
}, null, 2));

if (!apply) {
  console.log("Dry run only. Re-run with --apply after verifying the project and values.");
  process.exit(0);
}

const previousPanelLimit = Number(panelUser.data_limit || 0);
await updateKeyDataLimit({
  server,
  keyId: activeKey.outline_key_id,
  dataLimitBytes: activePanelLimitBytes,
  expiryDate: order.expiry_date,
});

const { error: orderUpdateError } = await supabase
  .from("vpn_orders")
  .update({
    usage_baseline_bytes: usageBaselineBytes,
    quota_limit_bytes: quotaLimitBytes,
  })
  .eq("id", order.id)
  .eq("customer_id", order.customer_id)
  .eq("reseller_id", order.reseller_id);

if (orderUpdateError) {
  await updateKeyDataLimit({
    server,
    keyId: activeKey.outline_key_id,
    dataLimitBytes: previousPanelLimit || null,
    expiryDate: order.expiry_date,
  }).catch(() => {});
  throw new Error(`Order update failed; panel rollback attempted: ${orderUpdateError.message}`);
}

const { error: keyUpdateError } = await supabase
  .from("vpn_keys")
  .update({
    used_bytes: liveActiveUsedBytes,
    data_limit_bytes: activePanelLimitBytes,
  })
  .eq("id", activeKey.id)
  .eq("order_id", order.id)
  .eq("reseller_id", order.reseller_id);

if (keyUpdateError) {
  await supabase
    .from("vpn_orders")
    .update({
      usage_baseline_bytes: order.usage_baseline_bytes,
      quota_limit_bytes: order.quota_limit_bytes,
    })
    .eq("id", order.id);
  await updateKeyDataLimit({
    server,
    keyId: activeKey.outline_key_id,
    dataLimitBytes: previousPanelLimit || null,
    expiryDate: order.expiry_date,
  }).catch(() => {});
  throw new Error(`Key update failed; order and panel rollback attempted: ${keyUpdateError.message}`);
}

console.log("Quota repair applied successfully.");
