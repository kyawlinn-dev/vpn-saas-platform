import "./lib/loadEnv.js";
import "./lib/sentry.js"; // MUST be imported before express so Sentry can instrument it
import * as Sentry from "@sentry/node";
import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { requireAuth } from "./middleware/requireAuth.js";
import { requireAdmin } from "./middleware/requireAdmin.js";
import { requireAdminAuth } from "./middleware/requireAdminAuth.js";
import { requireActiveReseller } from "./middleware/requireActiveReseller.js";
import { requireTrustedOrigin } from "./middleware/requireTrustedOrigin.js";
import { startAutoStopJob } from "./jobs/autoStopJob.js";
import { startSyncUsageJob } from "./jobs/syncUsageJob.js";
import { startServerHealthJob } from "./jobs/serverHealthJob.js";
import { startCleanupScreenshotsJob } from "./jobs/cleanupScreenshotsJob.js";
import { startCleanupAppEventsJob } from "./jobs/cleanupAppEventsJob.js";
import { startCustomerNotificationsJob } from "./jobs/customerNotificationsJob.js";
import { validateEncryptionKey } from "./lib/tokenEncryption.js";

import resellerSessionRouter from "./routes/auth/resellerSessionRouter.js";
import adminSessionRouter from "./routes/admin/adminSessionRouter.js";
import adminMeRouter from "./routes/admin/adminMeRouter.js";
import adminServersRouter from "./routes/admin/adminServersRouter.js";
import adminResellersRouter from "./routes/admin/adminResellersRouter.js";
import adminPlansRouter from "./routes/admin/adminPlansRouter.js";
import adminSettlementsRouter from "./routes/admin/adminSettlementsRouter.js";
import adminOrderActionsRouter from "./routes/admin/adminOrderActionsRouter.js";
import adminDataRouter from "./routes/admin/adminDataRouter.js";
import adminLaunchReadinessRouter from "./routes/admin/launchReadinessRouter.js";
import adminMonitoringRouter from "./routes/admin/adminMonitoringRouter.js";
import resellerMeRouter from "./routes/reseller/resellerMeRouter.js";
import resellerWorkspaceRouter from "./routes/reseller/resellerWorkspaceRouter.js";
import resellerNotificationTemplatesRouter from "./routes/reseller/resellerNotificationTemplatesRouter.js";
import resellerLaunchReadinessRouter from "./routes/reseller/launchReadinessRouter.js";

import resellerOrdersRouter from "./routes/reseller/resellerOrdersRouter.js";
import resellerServerSwitchRouter from "./routes/reseller/resellerServerSwitchRouter.js";
import resellerCustomersRouter from "./routes/reseller/resellerCustomersRouter.js";
import resellerStatsRouter from "./routes/reseller/resellerStatsRouter.js";
import resellerKeysRouter from "./routes/reseller/resellerKeysRouter.js";
import resellerPlansRouter from "./routes/reseller/resellerPlansRouter.js";
import resellerAccountingRouter from "./routes/reseller/resellerAccountingRouter.js";
import orderActionRoutes from "./routes/reseller/orderActionRoutes.js";
import resellerMiniappRoutes from "./routes/public/resellerMiniappRoutes.js";
import ssconfRouter from "./routes/public/ssconfRouter.js";
import portalRouter from "./routes/public/portalRouter.js";
import botWebhookRouter from "./bot/webhookRouter.js";
import * as botManager from "./bot/manager.js";

validateEncryptionKey(); // fails loudly at boot if key is absent or wrong length

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

if (process.env.NODE_ENV === "development") {
  logger.warn(
    "NODE_ENV=development — Telegram HMAC dev bypass is active in resellerMiniappRoutes. Never deploy with this setting."
  );
}

app.set("trust proxy", 1);

// Structured HTTP request/response logging.
// - Attaches req.log for handler-level logging with the request id already bound.
// - Skips /api/health so uptime probes don't drown out the real signal.
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === "/api/health",
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    // Trim the noisy default serializers — we only want method/url/status/duration.
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);

function parseOriginList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  return [
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:5173",
    "http://localhost:5174",
    process.env.RESELLER_DASHBOARD_URL,
    process.env.ADMIN_DASHBOARD_URL,
    process.env.MINIAPP_URL,
    process.env.TELEGRAM_MINIAPP_URL,
    ...parseOriginList(process.env.CORS_ALLOWED_ORIGINS),
  ].filter(Boolean);
}

function isAllowedPreviewOrigin(origin) {
  if (isProduction) return false;

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

function isAllowedOrigin(origin) {
  return getAllowedOrigins().includes(origin) || isAllowedPreviewOrigin(origin);
}

function isBackendRoute(pathname) {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/k") ||
    pathname === "/open-key"
  );
}

function createDevMiniappProxy() {
  const target = String(process.env.DEV_MINIAPP_PROXY_TARGET || "").replace(/\/$/, "");

  if (process.env.NODE_ENV !== "development" || !target) {
    return (_req, _res, next) => next();
  }

  console.info(`[dev] Mini App proxy enabled -> ${target}`);

  return async (req, res, next) => {
    if (isBackendRoute(req.path)) return next();

    try {
      const upstreamUrl = new URL(req.originalUrl || req.url, target);
      const headers = new Headers();

      for (const [key, value] of Object.entries(req.headers)) {
        const normalized = key.toLowerCase();
        if (["host", "connection", "content-length"].includes(normalized)) continue;
        if (Array.isArray(value)) {
          for (const item of value) headers.append(key, item);
        } else if (value != null) {
          headers.set(key, String(value));
        }
      }

      const fetchOptions = {
        method: req.method,
        headers,
        redirect: "manual",
      };

      if (!["GET", "HEAD"].includes(req.method)) {
        fetchOptions.body = req;
        fetchOptions.duplex = "half";
      }

      const upstream = await fetch(upstreamUrl, fetchOptions);

      res.status(upstream.status);
      res.removeHeader("Content-Security-Policy");
      res.removeHeader("X-Frame-Options");
      res.setHeader(
        "Content-Security-Policy",
        "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org"
      );

      upstream.headers.forEach((value, key) => {
        if (
          [
            "content-encoding",
            "content-length",
            "transfer-encoding",
            "content-security-policy",
            "x-frame-options",
          ].includes(key.toLowerCase())
        ) {
          return;
        }
        res.setHeader(key, value);
      });

      const body = Buffer.from(await upstream.arrayBuffer());
      return res.send(body);
    } catch (err) {
      console.error("[dev] Mini App proxy failed:", err.message);
      return res.status(502).send("Mini App dev server is not reachable. Start miniapp with npm run dev.");
    }
  };
}

/**
 * CORS must run before helmet, rate limiters, JSON parser, and routes so
 * preflight requests get a response before protected middleware runs.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;

  res.setHeader("Vary", "Origin");

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Telegram-Init-Data, ngrok-skip-browser-warning"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." },
});

const actionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "VPN reseller backend is running" });
});

/**
 * public
 */
app.use("/api/miniapp", resellerMiniappRoutes);
app.use("/k", ssconfRouter);
app.use("/", portalRouter);
// Bot webhooks - public, authenticated only by X-Telegram-Bot-Api-Secret-Token header
app.use("/api/bot-webhook", botWebhookRouter);

/**
 * admin auth routes (public — protected only by credentials)
 */
app.use(
  "/api/admin/auth",
  authLimiter,
  requireTrustedOrigin,
  adminSessionRouter
);

/**
 * reseller auth routes
 */
app.use(
  "/api/auth/reseller",
  authLimiter,
  requireTrustedOrigin,
  resellerSessionRouter
);

/**
 * reseller protected
 */
app.use(
  "/api/reseller/me",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerMeRouter
);

app.use(
  "/api/reseller/workspace",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerWorkspaceRouter
);

app.use(
  "/api/reseller/notification-templates",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerNotificationTemplatesRouter
);

app.use(
  "/api/reseller/launch-readiness",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerLaunchReadinessRouter
);

app.use(
  "/api/reseller/orders",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerOrdersRouter
);

app.use(
  "/api/reseller/orders",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerServerSwitchRouter
);

app.use(
  "/api/reseller/customers",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerCustomersRouter
);

app.use(
  "/api/reseller/stats",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerStatsRouter
);

app.use(
  "/api/reseller/plans",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerPlansRouter
);

app.use(
  "/api/reseller/keys",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerKeysRouter
);

app.use(
  "/api/reseller/accounting",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerAccountingRouter
);

app.use(
  "/api/reseller/order-actions",
  actionLimiter,
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  orderActionRoutes
);

/**
 * admin protected
 */
app.use(
  "/api/admin/me",
  requireTrustedOrigin,
  requireAdminAuth,
  requireAdmin,
  adminMeRouter
);

app.use(
  "/api/admin/servers",
  requireTrustedOrigin,
  requireAdminAuth,
  requireAdmin,
  adminServersRouter
);

// /api/admin/resellers must be mounted before /api/admin so Express matches
// the more specific path first (GET, POST, PATCH all go to adminResellersRouter).
app.use(
  "/api/admin/resellers",
  requireTrustedOrigin,
  requireAdminAuth,
  requireAdmin,
  adminResellersRouter
);

// Must be mounted before the /api/admin catch-all so Express matches the specific path first
app.use(
  "/api/admin/plans",
  requireTrustedOrigin,
  requireAdminAuth,
  requireAdmin,
  adminPlansRouter
);

app.use(
  "/api/admin/order-actions",
  actionLimiter,
  requireTrustedOrigin,
  requireAdminAuth,
  requireAdmin,
  adminOrderActionsRouter
);

app.use(
  "/api/admin/settlements",
  requireTrustedOrigin,
  requireAdminAuth,
  requireAdmin,
  adminSettlementsRouter
);

app.use(
  "/api/admin/launch-readiness",
  requireTrustedOrigin,
  requireAdminAuth,
  requireAdmin,
  adminLaunchReadinessRouter
);

app.use(
  "/api/admin/monitoring",
  requireTrustedOrigin,
  requireAdminAuth,
  requireAdmin,
  adminMonitoringRouter
);

// Generic data endpoints: /api/admin/customers, /orders, /plans, /keys
app.use(
  "/api/admin",
  requireTrustedOrigin,
  requireAdminAuth,
  requireAdmin,
  adminDataRouter
);

app.use(createDevMiniappProxy());

// Sentry Express error handler — must come after all routes/middleware that
// might throw, and before our own JSON error responder below. No-op when
// SENTRY_DSN is unset. See src/lib/sentry.js.
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);

  const message = isProduction
    ? "Internal server error"
    : err?.message || "Internal server error";

  return res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, `server listening on http://localhost:${PORT}`);
  startAutoStopJob();
  startSyncUsageJob();
  startServerHealthJob();
  startCleanupScreenshotsJob();
  startCleanupAppEventsJob();
  startCustomerNotificationsJob();
  void botManager.start(); // registers webhooks for all configured reseller bots
});
