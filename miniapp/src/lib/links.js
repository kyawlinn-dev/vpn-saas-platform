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
  const importUrl = getImportUrl(keyOrServer);

  if (!importUrl) {
    throw new Error("Please choose server first.");
  }

  window.location.href = importUrl;
}
