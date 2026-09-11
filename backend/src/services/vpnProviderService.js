/**
 * vpnProviderService.js — VPN provider interface (Marzneshin only).
 *
 * Thin re-export layer so consumers have a stable import path.
 * All servers use Marzneshin (SS + VLESS Reality + Hysteria2).
 * Outline Manager integration has been retired.
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
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return testMarzneshinServer(server);
}

/**
 * Create a VPN user.
 * Returns { outline_key_id, key_name, access_url, _marzneshin_meta }.
 * outline_key_id = Marzneshin username.
 * access_url     = subscription URL.
 *
 * @param {string} protocol - "shadowsocks" | "vless" | "hysteria2"
 *   SS → assigns per-server SS service (one node only)
 *   VLESS → assigns global VLESS service (all nodes)
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
 */
export async function createKey({ server, name, dataLimitBytes = null, protocol = "shadowsocks", serviceIds = null }) {
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return createMarzneshinUser({ server, name, dataLimitBytes, protocol, serviceIds });
}

export async function deleteKey({ server, keyId }) {
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return deleteMarzneshinUser({ server, outlineKeyId: keyId });
}

export async function getKey({ server, keyId }) {
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return getMarzneshinUser({ server, outlineKeyId: keyId });
}

export async function listKeys(server) {
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return listMarzneshinUsers(server);
}

export async function updateKeyDataLimit({ server, keyId, dataLimitBytes }) {
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return updateMarzneshinUserDataLimit({
    server,
    outlineKeyId: keyId,
    dataLimitBytes,
  });
}

export async function renameKey({ server, keyId, name }) {
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return renameMarzneshinUser({ server, outlineKeyId: keyId, name });
}

/**
 * Returns { [username]: bytesTransferred }.
 */
export async function getTransferMetrics(server) {
  requireCredentials(server);
  ensureDecryptedPassword(server);
  return getMarzneshinTransferMetrics(server);
}
