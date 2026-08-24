// Sentry initialization for the reseller dashboard.
// No-op when VITE_SENTRY_DSN is unset.

import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN || "";
const environment = import.meta.env.MODE || "development";

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
  console.info("[sentry] enabled", { environment });
} else {
  console.info("[sentry] disabled — set VITE_SENTRY_DSN to enable");
}

export { Sentry };
