import crypto from "crypto";
import { supabase } from "../lib/supabase.js";

const SAFE_METADATA_KEYS = new Set([
  "code",
  "reason",
  "slug",
  "source",
  "server_tier",
  "required_tier",
  "region",
  "duration_days",
  "data_limit_gb",
  "price_mmk",
  "order_type",
  "review_status",
  "payment_status",
  "created",
  "reused",
  "count",
]);

const DEDUPE_WINDOWS_SECONDS = {
  miniapp_config_loaded: 60,
  miniapp_authenticated: 60,
  packages_viewed: 30,
  server_page_viewed: 30,
};

const MAX_DEDUPE_CACHE_SIZE = 1000;
const dedupeCache = new Map();

function asTrimmedString(value, maxLength = 500) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function requestIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req?.ip || req?.socket?.remoteAddress || null;
}

function hashIp(ip) {
  const salt = process.env.APP_EVENT_IP_SALT || process.env.BOT_TOKEN_ENCRYPTION_KEY || "";
  if (!ip || !salt) return null;
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 20);
}

function pruneDedupeCache(now) {
  if (dedupeCache.size < MAX_DEDUPE_CACHE_SIZE) return;

  for (const [key, expiresAt] of dedupeCache.entries()) {
    if (expiresAt <= now) dedupeCache.delete(key);
  }

  while (dedupeCache.size >= MAX_DEDUPE_CACHE_SIZE) {
    const oldestKey = dedupeCache.keys().next().value;
    if (!oldestKey) break;
    dedupeCache.delete(oldestKey);
  }
}

function dedupeActorKey(payload) {
  if (payload.customer_id) return `customer:${payload.customer_id}`;
  if (payload.telegram_user_id) return `telegram:${payload.telegram_user_id}`;
  if (payload.session_id) return `session:${payload.session_id}`;
  if (payload.ip_hash && payload.user_agent) {
    return `anon:${payload.ip_hash}:${shortHash(payload.user_agent)}`;
  }
  return null;
}

function dedupeKeyForPayload(payload) {
  const actorKey = dedupeActorKey(payload);
  if (!actorKey) return null;

  return [
    payload.event_name,
    payload.status,
    payload.reseller_id || "global",
    actorKey,
    payload.page || "",
    payload.route || "",
    payload.metadata?.slug || "",
  ].join("|");
}

function dedupeWindowMs(eventName, overrideSeconds) {
  if (overrideSeconds === 0) return 0;
  const override = Number(overrideSeconds);
  if (Number.isFinite(override) && override > 0) return override * 1000;
  return (DEDUPE_WINDOWS_SECONDS[eventName] || 0) * 1000;
}

function sanitizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};

  return Object.entries(metadata).reduce((safe, [key, value]) => {
    if (!SAFE_METADATA_KEYS.has(key)) return safe;
    if (value == null) return safe;

    if (typeof value === "string") {
      safe[key] = asTrimmedString(value, 160);
    } else if (typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    }

    return safe;
  }, {});
}

export function buildRequestEventContext(req) {
  if (!req) return {};

  const route = asTrimmedString((req.originalUrl || req.url || "").split("?")[0], 240);
  const userAgent = asTrimmedString(req.get?.("user-agent"), 500);
  const sessionId =
    asTrimmedString(req.get?.("x-novanet-session-id"), 120) ||
    asTrimmedString(req.get?.("x-telegram-query-id"), 120);

  return {
    route,
    user_agent: userAgent,
    session_id: sessionId,
    ip_hash: hashIp(requestIp(req)),
  };
}

export async function recordAppEvent(event) {
  const payload = {
    event_name: asTrimmedString(event.event_name, 80),
    event_source: asTrimmedString(event.event_source, 40) || "backend",
    actor_type: asTrimmedString(event.actor_type, 40),
    reseller_id: event.reseller_id || null,
    customer_id: event.customer_id || null,
    admin_id: event.admin_id || null,
    telegram_user_id: event.telegram_user_id ? Number(event.telegram_user_id) : null,
    order_id: event.order_id || null,
    payment_id: event.payment_id || null,
    server_id: event.server_id || null,
    plan_id: event.plan_id || null,
    page: asTrimmedString(event.page, 80),
    route: asTrimmedString(event.route, 240),
    status: ["info", "success", "blocked", "failed"].includes(event.status)
      ? event.status
      : "info",
    metadata: sanitizeMetadata(event.metadata),
    session_id: asTrimmedString(event.session_id, 120),
    user_agent: asTrimmedString(event.user_agent, 500),
    ip_hash: asTrimmedString(event.ip_hash, 80),
  };

  if (!payload.event_name) return { skipped: true };

  const windowMs = dedupeWindowMs(payload.event_name, event.dedupe_window_seconds);
  const dedupeKey = windowMs > 0 ? dedupeKeyForPayload(payload) : null;
  if (dedupeKey) {
    const now = Date.now();
    const existingExpiry = dedupeCache.get(dedupeKey);
    if (existingExpiry && existingExpiry > now) {
      return { skipped: true, deduped: true };
    }

    pruneDedupeCache(now);
    dedupeCache.set(dedupeKey, now + windowMs);
  }

  const { error } = await supabase.from("app_events").insert(payload);
  if (error) {
    if (dedupeKey) dedupeCache.delete(dedupeKey);
    throw error;
  }
  return { ok: true };
}

export function trackAppEvent(event) {
  void recordAppEvent(event).catch((err) => {
    console.warn("[appEvent] failed to record event:", err.message);
  });
}
