function normalizeReleaseVersion(value) {
  return String(value || "").trim();
}

function normalizePath(path) {
  const value = String(path || "").trim();
  if (!value) return "";
  return value.startsWith("/") ? value : `/${value}`;
}

export function getMiniAppReleaseVersion() {
  return normalizeReleaseVersion(process.env.MINIAPP_RELEASE_VERSION);
}

/**
 * Builds the WebApp URL for a reseller's miniapp.
 *
 * `slug` identifies the reseller workspace and `v` busts Telegram WebView
 * cache after each Mini App release.
 */
export function buildWebAppUrl(miniappBaseUrl, miniappSlug, path = "") {
  const base = String(miniappBaseUrl || "").trim();
  if (!base) return "";

  const releaseVersion = getMiniAppReleaseVersion();

  try {
    const url = new URL(base);
    const extraPath = normalizePath(path);
    if (extraPath) {
      const basePath = url.pathname.replace(/\/$/, "");
      url.pathname = `${basePath}${extraPath}` || "/";
    }

    url.searchParams.set("slug", miniappSlug || "");
    if (releaseVersion) url.searchParams.set("v", releaseVersion);
    return url.toString();
  } catch {
    const cleanBase = base.replace(/\/$/, "");
    const cleanPath = normalizePath(path);
    const params = new URLSearchParams({ slug: miniappSlug || "" });
    if (releaseVersion) params.set("v", releaseVersion);
    return `${cleanBase}${cleanPath}?${params.toString()}`;
  }
}
