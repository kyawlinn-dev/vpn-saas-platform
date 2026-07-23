import { supabase } from "../lib/supabase.js";
import {
  createOutlineKey,
  deleteOutlineKey,
  updateOutlineKeyDataLimit,
} from "./outlineService.js";
import { parseSsUrl } from "../utils/parseSsUrl.js";
import {
  incrementServerUsage,
  decrementServerUsage,
  setServerError,
  clearServerError,
  getServerById,
} from "./serverService.js";
import { getTokenByOrderId } from "./tokenService.js";

function gbToBytes(gb) {
  if (!gb || Number(gb) <= 0) return null;
  return Math.floor(Number(gb) * 1024 * 1024 * 1024);
}

function usageBytesForQuota(key) {
  const storedBytes = Number(key?.used_bytes || 0);
  const liveBytes = Number(key?.used_bytes_30d || 0);
  return Math.max(storedBytes, liveBytes, 0);
}

function isActiveKey(key) {
  return normalizeKeyStatus(key?.status) === "active" && !key?.deleted_at;
}

export function calculateExtendedDataLimitBytes(currentLimitBytes, packageLimitBytes) {
  const packageBytes = Number(packageLimitBytes);
  if (!Number.isFinite(packageBytes) || packageBytes <= 0) return null;

  const currentBytes = Number(currentLimitBytes);
  if (!Number.isFinite(currentBytes) || currentBytes <= 0) return null;

  return Math.floor(currentBytes + packageBytes);
}

export function buildOrderQuotaSnapshot(keys = []) {
  const rows = Array.isArray(keys) ? keys : [];
  const totalUsedBytes = rows.reduce((sum, key) => sum + usageBytesForQuota(key), 0);
  const activeKeys = rows.filter(isActiveKey);

  if (activeKeys.some((key) => key.data_limit_bytes == null)) {
    return {
      isUnlimited: true,
      totalUsedBytes,
      totalAllowanceBytes: null,
      remainingBytes: null,
    };
  }

  const activeLimitBytes = activeKeys.reduce((max, key) => {
    const value = Number(key?.data_limit_bytes);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);

  if (activeLimitBytes <= 0) {
    return {
      isUnlimited: false,
      totalUsedBytes,
      totalAllowanceBytes: null,
      remainingBytes: null,
    };
  }

  const historicalUsedBytes = rows
    .filter((key) => !isActiveKey(key))
    .reduce((sum, key) => sum + usageBytesForQuota(key), 0);
  const totalAllowanceBytes = historicalUsedBytes + activeLimitBytes;

  return {
    isUnlimited: false,
    totalUsedBytes,
    totalAllowanceBytes,
    remainingBytes: Math.max(totalAllowanceBytes - totalUsedBytes, 0),
  };
}

export async function getOrderQuotaSnapshot(orderId) {
  const { data: keys, error } = await supabase
    .from("vpn_keys")
    .select("id, status, deleted_at, data_limit_bytes, used_bytes")
    .eq("order_id", orderId)
    .in("status", ["active", "deleted"]);

  if (error) throw new Error(error.message);
  return buildOrderQuotaSnapshot(keys || []);
}

function buildKeyName({ customer, server, order, plan }) {
  return [
    customer?.full_name || "Customer",
    server?.name || "Server",
    plan?.name || "Plan",
    `ORD-${order.id}`,
  ].join(" | ");
}

function normalizeKeyStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function formatServerConfig(server, accessUrl) {
  const parsed = parseSsUrl(accessUrl);

  return {
    tag: server.name,
    region: server.region,
    server: parsed.server,
    port: parsed.port,
    method: parsed.method,
    password: parsed.password,
  };
}

async function getOrderServerKeys(orderId, serverId) {
  const { data, error } = await supabase
    .from("vpn_keys")
    .select("*")
    .eq("order_id", orderId)
    .eq("server_id", serverId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

function pickReusableVpnKey(rows) {
  const active = rows.find(
    (row) => normalizeKeyStatus(row.status) === "active" && row.access_url
  );
  if (active) return active;

  const fallback = rows.find(
    (row) => row.access_url && normalizeKeyStatus(row.status) !== "deleted"
  );
  if (fallback) return fallback;

  return null;
}

async function ensureAssignmentForToken({ tokenId, serverId, vpnKeyId }) {
  const { data: existingRows, error: readErr } = await supabase
    .from("token_server_assignments")
    .select("*")
    .eq("token_id", tokenId)
    .eq("server_id", serverId)
    .order("created_at", { ascending: false });

  if (readErr) throw new Error(readErr.message);

  const matchingKeyRow = (existingRows || []).find(
    (row) => row.vpn_key_id === vpnKeyId
  );

  if (matchingKeyRow) {
    const { error: updateErr } = await supabase
      .from("token_server_assignments")
      .update({
        is_active: true,
        vpn_key_id: vpnKeyId,
      })
      .eq("id", matchingKeyRow.id);

    if (updateErr) throw new Error(updateErr.message);
    return matchingKeyRow.id;
  }

  const latestRow = (existingRows || [])[0];
  if (latestRow) {
    const { error: updateErr } = await supabase
      .from("token_server_assignments")
      .update({
        vpn_key_id: vpnKeyId,
        is_active: true,
      })
      .eq("id", latestRow.id);

    if (updateErr) throw new Error(updateErr.message);
    return latestRow.id;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("token_server_assignments")
    .insert({
      token_id: tokenId,
      server_id: serverId,
      vpn_key_id: vpnKeyId,
      is_active: true,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message || "Failed to create token assignment");
  }

  return inserted.id;
}

async function reactivateExistingVpnKey({
  token,
  order,
  customer,
  reseller,
  server,
  plan,
  vpnKey,
  dataLimitBytes,
}) {
  const patch = {
    customer_id: customer.id,
    reseller_id: reseller.id,
    key_name: vpnKey.key_name || buildKeyName({ customer, server, order, plan }),
    data_limit_bytes: dataLimitBytes,
    status: "active",
    is_used: true,
    used_at: new Date().toISOString(),
    deleted_at: null,
  };

  const { data: updatedKey, error: updateErr } = await supabase
    .from("vpn_keys")
    .update(patch)
    .eq("id", vpnKey.id)
    .select()
    .single();

  if (updateErr || !updatedKey) {
    throw new Error(updateErr?.message || "Failed to reactivate vpn key");
  }

  await ensureAssignmentForToken({
    tokenId: token.id,
    serverId: server.id,
    vpnKeyId: updatedKey.id,
  });

  await clearServerError(server.id);
  return formatServerConfig(server, updatedKey.access_url);
}

async function cleanupNewOutlineKey({ server, outlineKeyId }) {
  if (!outlineKeyId) return;

  try {
    await deleteOutlineKey({
      apiUrl: server.outline_api_url,
      certSha256: server.outline_cert_sha256,
      outlineKeyId,
    });
  } catch {
    // best effort cleanup only
  }
}

export async function deactivateTokenAssignments(tokenId) {
  const { error } = await supabase
    .from("token_server_assignments")
    .update({ is_active: false })
    .eq("token_id", tokenId);

  if (error) throw new Error(error.message);
}

export async function deleteProvisionedKeysForOrder(orderId) {
  const { data: keys, error } = await supabase
    .from("vpn_keys")
    .select("*")
    .eq("order_id", orderId)
    .eq("status", "active");

  if (error) throw new Error(error.message);

  for (const key of keys || []) {
    try {
      const server = key.server_id ? await getServerById(key.server_id) : null;

      if (server?.outline_api_url && server?.outline_cert_sha256 && key.outline_key_id) {
        await deleteOutlineKey({
          apiUrl: server.outline_api_url,
          certSha256: server.outline_cert_sha256,
          outlineKeyId: key.outline_key_id,
        });
      }
    } catch (err) {
      await setServerError(key.server_id, err.message);
    }

    try {
      if (key.server_id) await decrementServerUsage(key.server_id);
    } catch {}

    await supabase
      .from("vpn_keys")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
      })
      .eq("id", key.id);
  }
}

export async function updateProvisionedKeyLimitsForOrder({ orderId, plan }) {
  const packageLimitBytes = gbToBytes(plan?.data_limit_gb);

  const { data: keys, error } = await supabase
    .from("vpn_keys")
    .select("*")
    .eq("order_id", orderId)
    .eq("status", "active");

  if (error) throw new Error(error.message);

  for (const key of keys || []) {
    if (!key.server_id || !key.outline_key_id) continue;

    const server = await getServerById(key.server_id);
    const dataLimitBytes = calculateExtendedDataLimitBytes(
      key.data_limit_bytes,
      packageLimitBytes
    );

    await updateOutlineKeyDataLimit({
      apiUrl: server.outline_api_url,
      certSha256: server.outline_cert_sha256,
      outlineKeyId: key.outline_key_id,
      dataLimitBytes,
    });

    await supabase
      .from("vpn_keys")
      .update({
        data_limit_bytes: dataLimitBytes,
      })
      .eq("id", key.id);
  }
}

export async function provisionServersForToken({
  token,
  order,
  customer,
  reseller,
  plan,
  servers,
}) {
  const created = [];
  const dataLimitBytes = gbToBytes(plan?.data_limit_gb);

  for (const server of servers) {
    let vpnKeyRow = null;
    let assignmentId = null;
    let incremented = false;
    let outlineKeyId = null;

    try {
      const existingKeys = await getOrderServerKeys(order.id, server.id);
      const reusableKey = pickReusableVpnKey(existingKeys);

      // Idempotent retry path:
      // if order+server already has a usable key, reuse it instead of creating a new Outline key
      if (reusableKey) {
        const reusedConfig = await reactivateExistingVpnKey({
          token,
          order,
          customer,
          reseller,
          server,
          plan,
          vpnKey: reusableKey,
          dataLimitBytes,
        });

        created.push(reusedConfig);
        continue;
      }

      const outlineKey = await createOutlineKey({
        apiUrl: server.outline_api_url,
        certSha256: server.outline_cert_sha256,
        name: buildKeyName({ customer, server, order, plan }),
        dataLimitBytes,
      });

      outlineKeyId = outlineKey.outline_key_id;

      const { data: vpnKey, error: keyErr } = await supabase
        .from("vpn_keys")
        .insert({
          order_id: order.id,
          customer_id: customer.id,
          reseller_id: reseller.id,
          server_id: server.id,
          outline_key_id: outlineKey.outline_key_id,
          key_name: outlineKey.key_name,
          access_url: outlineKey.access_url,
          data_limit_bytes: dataLimitBytes,
          used_bytes: 0,
          status: "active",
          is_used: true,
          used_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (keyErr || !vpnKey) {
        throw new Error(keyErr?.message || "Failed to store vpn key");
      }

      vpnKeyRow = vpnKey;

      assignmentId = await ensureAssignmentForToken({
        tokenId: token.id,
        serverId: server.id,
        vpnKeyId: vpnKey.id,
      });

      await incrementServerUsage(server.id);
      incremented = true;
      await clearServerError(server.id);

      created.push(formatServerConfig(server, outlineKey.access_url));
    } catch (err) {
      // rollback local state as much as possible
      if (incremented) {
        try {
          await decrementServerUsage(server.id);
        } catch {}
      }

      if (assignmentId) {
        try {
          await supabase
            .from("token_server_assignments")
            .update({ is_active: false })
            .eq("id", assignmentId);
        } catch {}
      }

      if (vpnKeyRow?.id) {
        try {
          await supabase
            .from("vpn_keys")
            .update({
              status: "deleted",
              deleted_at: new Date().toISOString(),
            })
            .eq("id", vpnKeyRow.id);
        } catch {}
      }

      // if Outline key was created but DB failed, clean it up so retries do not duplicate infra keys
      await cleanupNewOutlineKey({ server, outlineKeyId });
      await setServerError(server.id, err.message);
      throw err;
    }
  }

  return created;
}

// Migrate a single active order from a decommissioned server to `newServer`.
// Creates a fresh Outline key, stores it, wires up token/miniapp assignments.
// The order stays active with its existing expiry — only the key location changes.
export async function migrateActiveOrderToServer({ order, newServer, oldServerId }) {
  const dataLimitBytes = gbToBytes(order.plan?.data_limit_gb);
  const keyName = [
    order.customer?.full_name || "Customer",
    newServer.name,
    order.plan?.name || "Plan",
    `ORD-${order.id}`,
  ].join(" | ");

  let outlineKeyId = null;
  let vpnKey = null;

  try {
    const outlineKey = await createOutlineKey({
      apiUrl: newServer.outline_api_url,
      certSha256: newServer.outline_cert_sha256,
      name: keyName,
      dataLimitBytes,
    });
    outlineKeyId = outlineKey.outline_key_id;

    const { data: inserted, error: keyErr } = await supabase
      .from("vpn_keys")
      .insert({
        order_id: order.id,
        customer_id: order.customer_id,
        reseller_id: order.reseller_id,
        server_id: newServer.id,
        outline_key_id: outlineKey.outline_key_id,
        key_name: keyName,
        access_url: outlineKey.access_url,
        data_limit_bytes: dataLimitBytes,
        used_bytes: 0,
        status: "active",
        is_used: true,
        used_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (keyErr || !inserted) {
      throw new Error(keyErr?.message || "Failed to store migrated vpn key");
    }
    vpnKey = inserted;

    await incrementServerUsage(newServer.id);

    // Token portal: update server assignment so the existing ssconf:// URL keeps working
    const token = await getTokenByOrderId(order.id);
    if (token?.id) {
      await ensureAssignmentForToken({
        tokenId: token.id,
        serverId: newServer.id,
        vpnKeyId: vpnKey.id,
      });
    }

    // Miniapp: update the customer's current server so the UI reflects the new server
    await supabase
      .from("telegram_links")
      .update({ current_server_id: newServer.id })
      .eq("customer_id", order.customer_id)
      .eq("current_server_id", oldServerId);

    await clearServerError(newServer.id);
    return vpnKey;
  } catch (err) {
    // Best-effort rollback: remove the Outline key and DB row we just created
    if (outlineKeyId) {
      try {
        await deleteOutlineKey({
          apiUrl: newServer.outline_api_url,
          certSha256: newServer.outline_cert_sha256,
          outlineKeyId,
        });
      } catch {}
    }
    if (vpnKey?.id) {
      try {
        await supabase
          .from("vpn_keys")
          .update({ status: "deleted", deleted_at: new Date().toISOString() })
          .eq("id", vpnKey.id);
        await decrementServerUsage(newServer.id);
      } catch {}
    }
    throw err;
  }
}
