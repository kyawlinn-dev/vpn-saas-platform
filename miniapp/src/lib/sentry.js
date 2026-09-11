// Sentry initialization for the Mini App.
//
// No-op when VITE_SENTRY_DSN is unset — safe to ship without a DSN.
// Imported once from main.jsx before any component renders.

import * as Sentry from "@sentry/react";
import { MINIAPP_BUILD_ID } from "./buildInfo";

const dsn = import.meta.env.VITE_SENTRY_DSN || "";
const environment = import.meta.env.MODE || "development";

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: MINIAPP_BUILD_ID,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // Sample 10% of transactions in prod, all in dev.
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,
    // No PII — user IDs, IPs, cookies. Telegram init data must never leave the browser.
    sendDefaultPii: false,
  });
  console.info("[sentry] enabled", { environment, release: MINIAPP_BUILD_ID });
} else {
  console.info("[sentry] disabled — set VITE_SENTRY_DSN to enable");
}

export { Sentry };
