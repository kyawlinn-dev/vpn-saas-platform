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

function gbToBytes(gb) {
  if (!gb || Number(gb) <= 0) return null;
  return Math.floor(Number(gb) * 1024 * 1024 * 1024);
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
  const dataLimitBytes = gbToBytes(plan?.data_limit_gb);

  const { data: keys, error } = await supabase
    .from("vpn_keys")
    .select("*")
    .eq("order_id", orderId)
    .eq("status", "active");

  if (error) throw new Error(error.message);

  for (const key of keys || []) {
    if (!key.server_id || !key.outline_key_id) continue;

    const server = await getServerById(key.server_id);

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
        used_bytes: 0,
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