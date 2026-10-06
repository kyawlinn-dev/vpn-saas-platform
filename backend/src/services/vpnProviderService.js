/**
 * VPN provider interface for legacy Outline and Marzneshin servers.
 *
 * Thin re-export layer so consumers have a stable import path.
 * A server's panel_type selects the provider. Keep legacy Outline rows until
 * their last customer key is retired.
 */

import {
  createMarzneshinUser,
  deleteMarzneshinUser,
  getMarzneshinUser,
  getMarzneshinTransferMetrics,
  listMarzneshinUsers,
  renameMarzneshinUser,
  testMarzneshinServer,
  updateMarzneshinUserDataLimit,
} from "./marzneshinService.js";
import { decrypt } from "../lib/tokenEncryption.js";
import {
  createOutlineKey,
  deleteOutlineKey,
  getOutlineKey,
  getOutlineTransferMetrics,
  listOutlineKeys,
  renameOutlineKey,
  testOutlineServer,
  updateOutlineKeyDataLimit,
} from "./outlineService.js";

export function providerForServer(server) {
  if (server?.panel_type === "outline" || server?.panel_type === "marzneshin") {
    return server.panel_type;
  }
  if (server?.panel_type) {
    throw new Error(`Server ${server.id || "unknown"} has an unsupported VPN provider`);
  }
  if (server?.outline_api_url && !server?.panel_url) return "outline";
  if (server?.panel_url && !server?.outline_api_url) return "marzneshin";
  throw new Error(`Server ${server?.id || "unknown"} has no unambiguous VPN provider`);
}

function outlineConnection(server) {
  if (!server?.outline_api_url || !server?.outline_cert_sha256) {
    throw new Error(`Server ${server?.id || "unknown"} missing Outline credentials`);
  }
  return { apiUrl: server.outline_api_url, certSha256: server.outline_cert_sha256 };
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
  if (providerForServer(server) === "outline") {
    return testOutlineServer(outlineConnection(server));
  }
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return testMarzneshinServer(server);
}

export function serviceIdsForOrder({ server, protocol, orderType }) {
  if (server?.panel_type === "outline" || (server?.outline_api_url && !server?.panel_url)) {
    if (protocol !== "shadowsocks") throw new Error("Outline supports Shadowsocks only");
    return null;
  }
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
export async function createKey({ server, name, dataLimitBytes = null, protocol = "shadowsocks", serviceIds = null, expiryDate }) {
  if (providerForServer(server) === "outline") {
    if (protocol !== "shadowsocks") throw new Error("Outline supports Shadowsocks only");
    return createOutlineKey({ ...outlineConnection(server), name, dataLimitBytes });
  }
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return createMarzneshinUser({ server, name, dataLimitBytes, protocol, serviceIds, expiryDate });
}

export async function deleteKey({ server, keyId }) {
  if (providerForServer(server) === "outline") {
    return deleteOutlineKey({ ...outlineConnection(server), outlineKeyId: keyId });
  }
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return deleteMarzneshinUser({ server, outlineKeyId: keyId });
}

export async function getKey({ server, keyId }) {
  if (providerForServer(server) === "outline") {
    return getOutlineKey({ ...outlineConnection(server), outlineKeyId: keyId });
  }
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return getMarzneshinUser({ server, outlineKeyId: keyId });
}

export async function listKeys(server) {
  if (providerForServer(server) === "outline") {
    return listOutlineKeys(outlineConnection(server));
  }
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return listMarzneshinUsers(server);
}

export async function updateKeyDataLimit({ server, keyId, dataLimitBytes, expiryDate }) {
  if (providerForServer(server) === "outline") {
    return updateOutlineKeyDataLimit({
      ...outlineConnection(server), outlineKeyId: keyId, dataLimitBytes,
    });
  }
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return updateMarzneshinUserDataLimit({
    server,
    outlineKeyId: keyId,
    dataLimitBytes,
    expiryDate,
  });
}

export async function renameKey({ server, keyId, name }) {
  if (providerForServer(server) === "outline") {
    return renameOutlineKey({ ...outlineConnection(server), outlineKeyId: keyId, name });
  }
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return renameMarzneshinUser({ server, outlineKeyId: keyId, name });
}

/**
 * Returns { [username]: bytesTransferred }.
 */
export async function getTransferMetrics(server) {
  if (providerForServer(server) === "outline") {
    return getOutlineTransferMetrics(outlineConnection(server));
  }
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return getMarzneshinTransferMetrics(server);
}
