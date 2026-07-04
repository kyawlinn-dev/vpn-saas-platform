import express from "express";
import dotenv from "dotenv";
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
import { validateEncryptionKey } from "./lib/tokenEncryption.js";

import resellerSessionRouter from "./routes/auth/resellerSessionRouter.js";
import adminSessionRouter from "./routes/admin/adminSessionRouter.js";
import adminMeRouter from "./routes/admin/adminMeRouter.js";
import adminServersRouter from "./routes/admin/adminServersRouter.js";
import adminResellersRouter from "./routes/admin/adminResellersRouter.js";
import adminPlansRouter from "./routes/admin/adminPlansRouter.js";
import adminOrderActionsRouter from "./routes/admin/adminOrderActionsRouter.js";
import adminDataRouter from "./routes/admin/adminDataRouter.js";
import resellerMeRouter from "./routes/reseller/resellerMeRouter.js";
import resellerWorkspaceRouter from "./routes/reseller/resellerWorkspaceRouter.js";

import resellerOrdersRouter from "./routes/reseller/resellerOrdersRouter.js";
import resellerKeysRouter from "./routes/reseller/resellerKeysRouter.js";
import resellerCustomersRouter from "./routes/reseller/resellerCustomersRouter.js";
import orderActionRoutes from "./routes/reseller/orderActionRoutes.js";
import planRoutes from "./routes/public/planRoutes.js";
import subscriptionRoutes from "./routes/public/subscriptionRoutes.js";

import telegramMiniAppRoutes from "./routes/public/telegramMiniAppRoutes.js";
import resellerMiniappRoutes from "./routes/public/resellerMiniappRoutes.js";
import botWebhookRouter from "./bot/webhookRouter.js";
import * as botManager from "./bot/manager.js";

dotenv.config();
validateEncryptionKey(); // fails loudly at boot if key is absent or wrong length

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

if (process.env.NODE_ENV === "development") {
  console.warn(
    "[WARN] NODE_ENV=development — Telegram HMAC dev bypass is active in resellerMiniappRoutes. Never deploy with this setting."
  );
}

app.set("trust proxy", 1);

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
    process.env.PUBLIC_WORKER_BASE_URL,
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
    "Content-Type, Authorization, ngrok-skip-browser-warning"
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
app.use("/api/public/plans", planRoutes);
app.use("/api/public", subscriptionRoutes);
app.use("/api/public/telegram-miniapp", telegramMiniAppRoutes);
app.use("/api/miniapp", resellerMiniappRoutes);
// Bot webhooks — public, authenticated only by X-Telegram-Bot-Api-Secret-Token header
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
  "/api/reseller/orders",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerOrdersRouter
);

app.use(
  "/api/reseller/keys",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerKeysRouter
);

app.use(
  "/api/reseller/customers",
  requireTrustedOrigin,
  requireAuth,
  requireActiveReseller,
  resellerCustomersRouter
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

// Generic data endpoints: /api/admin/customers, /orders, /plans, /keys
app.use(
  "/api/admin",
  requireTrustedOrigin,
  requireAdminAuth,
  requireAdmin,
  adminDataRouter
);

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);

  const message = isProduction
    ? "Internal server error"
    : err?.message || "Internal server error";

  return res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startAutoStopJob();
  startSyncUsageJob();
  void botManager.start(); // registers webhooks for all configured reseller bots
});
