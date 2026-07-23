function parseOriginList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  return [
    process.env.RESELLER_DASHBOARD_URL,
    process.env.ADMIN_DASHBOARD_URL,
    process.env.MINIAPP_URL,
    process.env.TELEGRAM_MINIAPP_URL,
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:5173",
    "http://localhost:5174",
    ...parseOriginList(process.env.CORS_ALLOWED_ORIGINS),
  ].filter(Boolean);
}

function isAllowedPreviewOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;

  try {
    const { hostname } = new URL(origin);
    return (
      hostname.endsWith(".pages.dev") ||
      hostname.endsWith(".ngrok-free.app") ||
      hostname.endsWith(".ngrok-free.dev")
    );
  } catch {
    return false;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireTrustedOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  const origin = req.headers.origin;

  if (
    !origin ||
    (!getAllowedOrigins().includes(origin) && !isAllowedPreviewOrigin(origin))
  ) {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  return next();
}
