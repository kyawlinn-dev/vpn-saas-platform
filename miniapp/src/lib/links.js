import { openExternalLink } from "./telegram";

// ── Protocol-aware helpers ──────────────────────────────────────────────────

/**
 * Returns the customer's protocol from the vpn_key payload.
 * Falls back to "shadowsocks" for legacy responses.
 */
export function getKeyProtocol(vpnKey) {
  return vpnKey?.protocol || "shadowsocks";
}

export function isShadowsocks(vpnKey) {
  return getKeyProtocol(vpnKey) === "shadowsocks";
}

// ── URL getters ─────────────────────────────────────────────────────────────

export function getDynamicAccessUrl(keyOrServer) {
  return String(keyOrServer?.dynamic_access_url || "").trim();
}

export function getSsconfUrl(keyOrServer) {
  return String(keyOrServer?.ssconf_url || "").trim();
}

export function getSubscriptionUrl(keyOrServer) {
  return String(keyOrServer?.subscription_url || "").trim();
}

/**
 * Primary import URL for this key.
 *
 * All protocols (SS, VLESS, Hysteria2) use the Marzneshin subscription URL.
 * Customers paste it into Hiddify or Xray to configure their VPN.
 * Falls back to dynamic_access_url / ssconf_url for legacy Outline keys.
 */
export function getImportUrl(keyOrServer) {
  return (
    getSubscriptionUrl(keyOrServer) ||
    getDynamicAccessUrl(keyOrServer) ||
    getSsconfUrl(keyOrServer)
  );
}

export function getShareUrl(keyOrServer) {
  return getImportUrl(keyOrServer);
}

/**
 * Open VPN subscription URL in the default external browser.
 * Hiddify / Xray handle the URL if installed; otherwise it opens in browser.
 * All protocols go through the same Marzneshin subscription URL.
 */
export function openVpnKey(keyOrServer) {
  const subUrl = getImportUrl(keyOrServer);
  if (!subUrl) {
    throw new Error("Please choose server first.");
  }
  openExternalLink(subUrl);
}

// Legacy alias — kept for import compatibility
export const openOutlineKey = openVpnKey;
