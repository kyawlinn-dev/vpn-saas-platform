function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function isRetiredWorkerUrl(value) {
  if (process.env.NODE_ENV !== "production") return false;

  try {
    return new URL(value).hostname.endsWith(".workers.dev");
  } catch {
    return false;
  }
}

function normalizeProductionBaseUrl(value) {
  const normalized = normalizeBaseUrl(value);
  if (!normalized || isRetiredWorkerUrl(normalized)) return null;
  return normalized;
}

function getRequestBaseUrl(req) {
  if (!req) return null;

  const proto =
    String(req.headers?.["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim() ||
    req.protocol ||
    "http";

  const host =
    String(req.headers?.["x-forwarded-host"] || "")
      .split(",")[0]
      .trim() || req.get?.("host");

  if (!host) return null;
  return normalizeBaseUrl(`${proto}://${host}`);
}

export function getPublicSubscriptionBaseUrl(req) {
  return (
    normalizeProductionBaseUrl(process.env.PUBLIC_SUBSCRIPTION_BASE_URL) ||
    normalizeProductionBaseUrl(process.env.WEBHOOK_BASE_URL) ||
    getRequestBaseUrl(req)
  );
}

export function buildSsconfHttpUrl(token, { req } = {}) {
  if (!token) return null;

  const base = getPublicSubscriptionBaseUrl(req);
  if (!base) return null;

  return `${base}/k/${encodeURIComponent(token)}.json`;
}

export function buildDynamicAccessUrl(token, label, { req } = {}) {
  const httpUrl = buildSsconfHttpUrl(token, { req });
  if (!httpUrl) return null;

  const url = new URL(httpUrl);
  const fragment = label ? `#${label}` : "";
  return `ssconf://${url.host}${url.pathname}${fragment}`;
}
