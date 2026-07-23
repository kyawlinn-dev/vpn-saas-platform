function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
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
    normalizeBaseUrl(process.env.PUBLIC_SUBSCRIPTION_BASE_URL) ||
    normalizeBaseUrl(process.env.WEBHOOK_BASE_URL) ||
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
