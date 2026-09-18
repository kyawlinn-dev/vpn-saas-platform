import { supabase } from "../lib/supabase.js";
import {
  createKey,
  deleteKey,
  getKey,
  updateKeyDataLimit,
} from "./vpnProviderService.js";
// parseSsUrl no longer needed — Marzneshin returns subscription URLs, not ss:// links
import {
  incrementServerUsage,
  decrementServerUsage,
  setServerError,
  clearServerError,
  getServerById,
} from "./serverService.js";
import { trackAppEvent } from "./appEventService.js";
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

function buildKeyName({ customer, server, order, plan, protocol = "shadowsocks" }) {
  // VLESS/Hysteria2 subscriptions cover ALL servers (not server-specific), so
  // don't include server name — it would appear in the Marzneshin username and
  // therefore in the subscription URL, which is confusing for users.
  const isGlobal = protocol === "vless" || protocol === "hysteria2";
  const parts = [customer?.full_name || "Customer"];
  if (!isGlobal) parts.push(server?.name || "Server");
  parts.push(plan?.name || "Plan", `ORD-${order.id}`);
  return parts.join(" | ");
}

function normalizeKeyStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function formatServerConfig(server, accessUrl) {
  // Marzneshin: access_url is a subscription URL that VPN apps import directly.
  // Customers add this URL to their app (Hiddify, V2Box, Happ, etc.) and it
  // returns all available protocols (SS, VLESS Reality, Hysteria2).
  return {
    tag: server.name,
    region: server.region,
    subscription_url: accessUrl,
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

async function cleanupNewKey({ server, keyId }) {
  if (!keyId) return;

  try {
    await deleteKey({ server, keyId });
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

      if (server && key.outline_key_id) {
        await deleteKey({ server, keyId: key.outline_key_id });
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

    await updateKeyDataLimit({
      server,
      keyId: key.outline_key_id,
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
  protocol = "shadowsocks",
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

      await incrementServerUsage(server.id);
      incremented = true;

      const createdKey = await createKey({
        server,
        name: buildKeyName({ customer, server, order, plan, protocol }),
        dataLimitBytes,
        protocol,
      });

      outlineKeyId = createdKey.outline_key_id;

      const { data: vpnKey, error: keyErr } = await supabase
        .from("vpn_keys")
        .insert({
          order_id: order.id,
          customer_id: customer.id,
          reseller_id: reseller.id,
          server_id: server.id,
          outline_key_id: createdKey.outline_key_id,
          key_name: createdKey.key_name,
          access_url: createdKey.access_url,
          key_credentials: createdKey._marzneshin_meta || null,
          data_limit_bytes: dataLimitBytes,
          used_bytes: 0,
          status: "active",
          is_used: true,
          used_at: new Date().toISOString(),
          protocol,                              // ← persist the actual protocol so sendActiveKey routes SS vs VLESS correctly
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

      await clearServerError(server.id);

      trackAppEvent({
        event_name: "key_provisioned",
        event_source: "backend",
        actor_type: "customer",
        reseller_id: reseller.id,
        customer_id: customer.id,
        order_id: order.id,
        server_id: server.id,
        plan_id: plan?.id || order.plan_id || null,
        status: "success",
        metadata: {
          server_tier: server.server_tier || "premium",
          region: server.region,
          order_type: order.order_type || "purchase",
        },
      });

      created.push(formatServerConfig(server, createdKey.access_url));
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

      // if VPN key was created but DB failed, clean it up so retries do not duplicate infra keys
      await cleanupNewKey({ server, keyId: outlineKeyId });
      await setServerError(server.id, err.message);

      // Emit a failure event so admin monitoring can see provisioning breakage
      // per server/reseller instead of hunting through logs.
      try {
        trackAppEvent({
          event_name: "key_provisioned",
          event_source: "backend",
          actor_type: "customer",
          reseller_id: reseller.id,
          customer_id: customer.id,
          order_id: order.id,
          server_id: server.id,
          plan_id: plan?.id || order.plan_id || null,
          status: "failed",
          metadata: {
            server_tier: server.server_tier || "premium",
            region: server.region,
            order_type: order.order_type || "purchase",
            error: String(err?.message || err).slice(0, 500),
          },
        });
      } catch {}

      throw err;
    }
  }

  return created;
}

// Migrate a single active order from a decommissioned server to `newServer`.
// Creates a fresh Outline key, stores it, wires up token/miniapp assignments.
// The order stays active with its existing expiry — only the key location changes.
export async function migrateActiveOrderToServer({ order, newServer, oldServerId, protocol = "shadowsocks" }) {
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
    const createdKey = await createKey({
      server: newServer,
      name: keyName,
      dataLimitBytes,
      protocol,
    });
    outlineKeyId = createdKey.outline_key_id;

    const { data: inserted, error: keyErr } = await supabase
      .from("vpn_keys")
      .insert({
        order_id: order.id,
        customer_id: order.customer_id,
        reseller_id: order.reseller_id,
        server_id: newServer.id,
        outline_key_id: createdKey.outline_key_id,
        key_name: keyName,
        access_url: createdKey.access_url,
        key_credentials: createdKey._marzneshin_meta || null,
        data_limit_bytes: dataLimitBytes,
        used_bytes: 0,
        status: "active",
        is_used: true,
        used_at: new Date().toISOString(),
        protocol,                              // ← persist the actual protocol on the key row
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
    // Best-effort rollback: remove the VPN key and DB row we just created
    if (outlineKeyId) {
      try {
        await deleteKey({ server: newServer, keyId: outlineKeyId });
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

// Reseller-initiated server switch for a PAID order whose old server is
// still healthy (unlike migrateActiveOrderToServer's only other caller —
// admin server decommission — which deletes the old key BEFORE migrating
// because the old server is being torn down). Here the old server stays
// alive, so we must explicitly retire the old key ourselves after the new
// one is confirmed working.
//
// Order of operations matters: provision the NEW key first, and only once
// that succeeds do we tear down the OLD key. If provisioning fails, the
// customer keeps their working connection — never leave them with nothing.
export async function switchOrderServer({ order, newServer, oldKey }) {
  const migrated = await migrateActiveOrderToServer({
    order,
    newServer,
    oldServerId: oldKey.server_id,
  });

  // New key is live — now retire the old one. Best-effort: if any of this
  // fails, the customer already has a working new key, so we log and move
  // on rather than throwing (throwing here would incorrectly surface as a
  // "switch failed" to the reseller when the switch actually succeeded).
  try {
    if (oldKey.outline_key_id) {
      const oldServer = await getServerById(oldKey.server_id);
      if (oldServer) {
        await deleteKey({ server: oldServer, keyId: oldKey.outline_key_id });
      }
    }
  } catch (err) {
    console.warn(`[switchOrderServer] Failed to delete old VPN key ${oldKey.outline_key_id}:`, err.message);
  }

  try {
    await supabase
      .from("vpn_keys")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", oldKey.id);
    await decrementServerUsage(oldKey.server_id);
  } catch (err) {
    console.warn(`[switchOrderServer] Failed to retire old vpn_keys row ${oldKey.id}:`, err.message);
  }

  trackAppEvent({
    event_name: "server_switched",
    event_source: "backend",
    actor_type: "reseller",
    reseller_id: order.reseller_id,
    customer_id: order.customer_id,
    order_id: order.id,
    server_id: newServer.id,
    plan_id: order.plan_id || null,
    status: "success",
    metadata: {
      from_server_id: oldKey.server_id,
      to_server_id: newServer.id,
      to_server_tier: newServer.server_tier || "premium",
      to_server_region: newServer.region,
    },
  });

  return migrated;
}

// Re-provision an active order's key on the SAME server but with a different
// protocol (e.g. shadowsocks → vless). Marzneshin assigns a user to per-node
// SS services or the global VLESS service based on protocol, so switching
// protocol means creating a new user with the new service_ids and retiring the
// old one.
//
// Unlike a server switch, this stays on the SAME server, and a partial unique
// index forbids two active vpn_keys rows for one (order_id, server_id). So we
// must free that slot BEFORE provisioning the new key: soft-delete the old key
// ROW first (its Marzneshin user stays alive, so the customer keeps working),
// then create the new key, then tear the old Marzneshin user down. If
// provisioning fails, the old row is restored — the customer never loses access.
//
// The caller MUST update vpn_customers.protocol_preference first so the access
// URL the customer sees resolves to the right link type (ssconf for SS, the
// Marzneshin subscription URL for VLESS/Hysteria2 — never an ssconf link for a
// non-SS protocol).
export async function switchOrderProtocol({ order, server, oldKey, protocol }) {
  // Before touching anything, snapshot the live Marzneshin usage for the old
  // key. The old Marzneshin user will be deleted after the new key is created,
  // so any unsynced traffic would be silently lost. Writing it now means
  // buildOrderQuotaSnapshot's lifetime sum stays accurate even if the hourly
  // sync job hasn't run yet. Best-effort: a fetch failure should not block the
  // protocol switch — we fall back to whatever was already in the DB row.
  let snapshotBytes = Number(oldKey.used_bytes || 0);
  try {
    const liveUser = await getKey({ server, keyId: oldKey.outline_key_id });
    const liveBytes = Number(liveUser?.used_traffic || 0);
    if (liveBytes > snapshotBytes) snapshotBytes = liveBytes;
  } catch (err) {
    console.warn(
      `[switchOrderProtocol] Could not fetch live usage for key ${oldKey.outline_key_id}:`,
      err.message
    );
  }

  // 1. Free the (order_id, server_id) active-key slot. Only the DB row is
  //    retired here; the Marzneshin user is left alive so the customer stays
  //    connected until the new key is provisioned. Also persist the usage
  //    snapshot so it survives the old Marzneshin user deletion below.
  await supabase
    .from("vpn_keys")
    .update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
      used_bytes: snapshotBytes,
    })
    .eq("id", oldKey.id);
  try {
    await decrementServerUsage(server.id);
  } catch {}

  let migrated;
  try {
    migrated = await migrateActiveOrderToServer({
      order,
      newServer: server,
      oldServerId: server.id,
      protocol,
    });
  } catch (err) {
    // Restore the old key row — its Marzneshin user is still alive, so the
    // customer keeps their working connection on the original protocol.
    try {
      await supabase
        .from("vpn_keys")
        .update({ status: "active", deleted_at: null })
        .eq("id", oldKey.id);
      await incrementServerUsage(server.id);
    } catch {}
    throw err;
  }

  // 2. New key is live — delete the old Marzneshin user from the panel.
  //    Best-effort: the customer already has the new key, so a teardown hiccup
  //    shouldn't surface as a failed switch.
  try {
    if (oldKey.outline_key_id) {
      await deleteKey({ server, keyId: oldKey.outline_key_id });
    }
  } catch (err) {
    console.warn(`[switchOrderProtocol] Failed to delete old VPN key ${oldKey.outline_key_id}:`, err.message);
  }

  trackAppEvent({
    event_name: "protocol_switched",
    event_source: "backend",
    actor_type: "reseller",
    reseller_id: order.reseller_id,
    customer_id: order.customer_id,
    order_id: order.id,
    server_id: server.id,
    plan_id: order.plan_id || null,
    status: "success",
    metadata: {
      protocol,
      server_id: server.id,
    },
  });

  return migrated;
}
