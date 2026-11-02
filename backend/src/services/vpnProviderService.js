/** Marzneshin access operations behind the existing service interface. */

import {
  createMarzneshinUser,
  deleteMarzneshinUser,
  getMarzneshinUser,
  getMarzneshinTransferMetrics,
  listMarzneshinUsers,
  renameMarzneshinUser,
  testMarzneshinServer,
  updateMarzneshinUserDataLimit,
  updateMarzneshinUserServices,
} from "./marzneshinService.js";
import { decrypt } from "../lib/tokenEncryption.js";
import { withCustomerInfrastructureMutation, registerCreatedCustomerUser } from "./infrastructure/customerMutationGuard.js";
import { isPublicServerAccessEnabled, resolveServerAccessContext, validateServerAccessContext } from "./serverAccessContext.js";
import { evaluateServerAccess, selectServiceIds, ServerAccessPolicyError } from "./serverAccessPolicy.js";
export function providerForServer(server) {
  if (server?.panel_type === "marzneshin" && server?.panel_url) return "marzneshin";
  throw new Error(`Server ${server?.id || "unknown"} is not a Marzneshin server`);
}

// ---------------------------------------------------------------------------
// Credential guard + password decryption
// ---------------------------------------------------------------------------

function requireCredentials(server) {
  if (!server.panel_url) {
    throw new Error(
      `Server ${server.id} (${server.name}) missing panel_url`
    );
  }
  if (!server.panel_username) {
    throw new Error(
      `Server ${server.id} (${server.name}) missing panel_username`
    );
  }
}

/**
 * Ensure server._panel_password is populated. Decrypts from
 * panel_password_encrypted if needed. Mutates the server object.
 */
function ensureDecryptedPassword(server) {
  if (server._panel_password) return;
  if (!server.panel_password_encrypted) {
    throw new Error(
      `Server ${server.id} (${server.name}) missing panel_password_encrypted`
    );
  }
  server._panel_password = decrypt(server.panel_password_encrypted);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function testServer(server) {
  providerForServer(server);
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return testMarzneshinServer(server);
}

export function serviceIdsForOrder({ server, protocol, orderType, accessContext }) {
  providerForServer(server);
  if (accessContext?.publicAccessEnabled) {
    validateServerAccessContext(accessContext);
    return selectServiceIds({ server, protocol, pool: accessContext.pool });
  }
  if (isPublicServerAccessEnabled()) throw new ServerAccessPolicyError("PUBLIC_ACCESS_CONTEXT_REQUIRED");
  if (orderType !== "trial" || !["vless", "hysteria2"].includes(protocol)) return null;
  if (server?.server_tier !== "trial") {
    throw new Error("Trial VLESS access requires a trial server");
  }
  const ids = server.marzneshin_vless_trial_service_ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("Trial VLESS service is not configured for this server");
  }
  return ids;
}

/**
 * Create a VPN user.
 * Returns { outline_key_id, key_name, access_url, _marzneshin_meta }.
 * outline_key_id = Marzneshin username.
 * access_url     = subscription URL.
 *
 * @param {string} protocol - "shadowsocks" | "vless" | "hysteria2"
 *   SS → assigns per-server SS service (one node only)
 *   VLESS → assigns trial-only service for trial orders, global service otherwise
 */
/**
 * @param {object} opts
 * @param {object}   opts.server
 * @param {string}   opts.name
 * @param {number}   [opts.dataLimitBytes]
 * @param {string}   [opts.protocol]         "shadowsocks" | "vless" | "hysteria2"
 * @param {number[]} [opts.serviceIds]        Override Marzneshin service IDs.
 *                                            Pass the trial-specific service IDs here
 *                                            when provisioning trial VLESS keys so the
 *                                            user only gets the trial node, not all nodes.
 * @param {string}   opts.expiryDate           Order expiry date (YYYY-MM-DD).
 */
export async function createKey(input) {
  return withCustomerInfrastructureMutation({ serverIds: [input.server?.id] }, () => createKeyUnchecked(input));
}
async function createKeyUnchecked({ server, name, dataLimitBytes = null, protocol = "shadowsocks", serviceIds = null, expiryDate, accessContext }) {
  providerForServer(server);
  const context = await resolveServerAccessContext(accessContext);
  if (context.publicAccessEnabled) {
    const decision = evaluateServerAccess({ server, protocol, orderType: "purchase", environment: context.environment, poolId: context.poolId, purpose: "assign" });
    if (!decision.allowed) throw new ServerAccessPolicyError(decision.code);
    const expected = selectServiceIds({ server, protocol, pool: context.pool });
    if (serviceIds !== null && JSON.stringify(serviceIds) !== JSON.stringify(expected)) throw new ServerAccessPolicyError("SERVICE_CONFIGURATION_INVALID");
    serviceIds = expected;
  }
  requireCredentials(server);
  ensureDecryptedPassword(server);
  const created = await createMarzneshinUser({ server, name, dataLimitBytes, protocol, serviceIds, expiryDate });
  await registerCreatedCustomerUser({ server, created });
  return created;
}

export async function deleteKey(input) {
  return withCustomerInfrastructureMutation({ serverIds: [input.server?.id] }, () => deleteKeyUnchecked(input));
}
async function deleteKeyUnchecked({ server, keyId }) {
  providerForServer(server);
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return deleteMarzneshinUser({ server, outlineKeyId: keyId });
}

export async function getKey({ server, keyId }) {
  providerForServer(server);
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return getMarzneshinUser({ server, outlineKeyId: keyId });
}

export async function listKeys(server) {
  providerForServer(server);
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return listMarzneshinUsers(server);
}

export async function updateKeyDataLimit(input) {
  return withCustomerInfrastructureMutation({ serverIds: [input.server?.id] }, () => updateKeyDataLimitUnchecked(input));
}
async function updateKeyDataLimitUnchecked({ server, keyId, dataLimitBytes, expiryDate }) {
  providerForServer(server);
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return updateMarzneshinUserDataLimit({
    server,
    outlineKeyId: keyId,
    dataLimitBytes,
    expiryDate,
  });
}

export async function updateKeyServices(input) {
  return withCustomerInfrastructureMutation({ serverIds: [input.server?.id] }, () => updateKeyServicesUnchecked(input));
}
async function updateKeyServicesUnchecked({ server, keyId, serviceIds }) {
  providerForServer(server);
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return updateMarzneshinUserServices({
    server,
    outlineKeyId: keyId,
    serviceIds,
  });
}

export async function renameKey(input) {
  return withCustomerInfrastructureMutation({ serverIds: [input.server?.id] }, () => renameKeyUnchecked(input));
}
async function renameKeyUnchecked({ server, keyId, name }) {
  providerForServer(server);
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return renameMarzneshinUser({ server, outlineKeyId: keyId, name });
}

/**
 * Returns { [username]: bytesTransferred }.
 */
export async function getTransferMetrics(server) {
  providerForServer(server);
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return getMarzneshinTransferMetrics(server);
}
