import { OUTLINE_BRIDGE_BASE } from "../constants/app";
import { openExternalLink } from "./telegram";

export function getDynamicAccessUrl(keyOrServer) {
  return String(keyOrServer?.dynamic_access_url || "").trim();
}

export function getSsconfUrl(keyOrServer) {
  return String(keyOrServer?.ssconf_url || "").trim();
}

export function getImportUrl(keyOrServer) {
  return getDynamicAccessUrl(keyOrServer) || getSsconfUrl(keyOrServer);
}

export function getShareUrl(keyOrServer) {
  return getDynamicAccessUrl(keyOrServer);
}

export function openOutlineKey(keyOrServer) {
  const ssconfUrl = getImportUrl(keyOrServer);

  if (!ssconfUrl) {
    throw new Error("Please choose server first.");
  }

  const bridgeUrl = `${OUTLINE_BRIDGE_BASE}/open-key?url=${encodeURIComponent(ssconfUrl)}`;
  openExternalLink(bridgeUrl);
}
