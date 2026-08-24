// Sentry initialization for the backend.
//
// This file is preloaded via `node --import ./src/lib/sentry.js src/server.js`
// so it runs BEFORE express (or anything else) is imported. That means we
// must also load env vars here — server.js's loadEnv.js hasn't run yet.
//
// Behavior: if SENTRY_DSN is unset, Sentry.init() runs with an empty DSN
// which is a no-op capture path — no data leaves the process.

import "./loadEnv.js";
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN || "";
const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";
const release = process.env.SENTRY_RELEASE || process.env.GIT_COMMIT || undefined;

Sentry.init({
  dsn,
  environment,
  release,
  // Send at most 10% of transactions in prod; full sampling in dev.
  tracesSampleRate: environment === "production" ? 0.1 : 1.0,
  // Do NOT capture request bodies — they may contain Telegram init data,
  // screenshot URLs, or other secrets. Sentry already scrubs common tokens
  // but the safest posture is to disable body capture entirely.
  sendDefaultPii: false,
  // Loaded via `node --import ./src/lib/sentry.js`, so ESM loader hooks work
  // and Sentry can auto-instrument express for tracing.
  registerEsmLoaderHooks: true,
});

if (dsn) {
  console.log(`[sentry] enabled (env=${environment}${release ? `, release=${release}` : ""})`);
} else {
  console.log("[sentry] disabled — set SENTRY_DSN to enable error reporting");
}

export { Sentry };
