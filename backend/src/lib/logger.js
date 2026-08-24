// Structured logger for the backend.
//
// - Outputs JSON to stdout (pretty in dev, raw in prod).
// - Ships to Axiom when AXIOM_TOKEN + AXIOM_DATASET are set; otherwise
//   stdout-only (safe default for local dev without an account).
// - Redacts known-secret fields so tokens, Telegram init data, screenshot
//   URLs, and passwords NEVER appear in logs regardless of caller.
//
// Usage:
//   import { logger } from "./lib/logger.js";
//   logger.info({ server_id, keys_updated: 6 }, "syncUsage complete");
//   logger.error({ err }, "provisioning failed");
//
// For HTTP request/response logging see server.js — pino-http is wired
// there and uses this same logger.

import pino from "pino";

const AXIOM_TOKEN = process.env.AXIOM_TOKEN || "";
const AXIOM_DATASET = process.env.AXIOM_DATASET || "";
const NODE_ENV = process.env.NODE_ENV || "development";

// Fields whose values must never be logged in cleartext. Wildcards match
// nested keys anywhere in the object graph.
const REDACT_PATHS = [
  // Auth + session
  '*.password',
  '*.password_hash',
  '*.token',
  '*.api_key',
  '*.access_token',
  '*.refresh_token',
  '*.bot_token',
  '*.bot_token_encrypted',
  '*.outline_api_url',      // contains the outline management secret path
  '*.outline_cert_sha256',
  '*.access_url',           // Outline access URL contains the key
  // Telegram
  '*.init_data',
  '*.initData',
  'req.headers["x-telegram-init-data"]',
  // Payment / screenshots
  '*.screenshot_url',
  '*.payment_proof_url',
  // Cookies + auth headers
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
];

// Base options shared by both configurations below.
const baseOptions = {
  level: NODE_ENV === "production" ? "info" : "debug",
  base: {
    service: "novanet-backend",
    env: NODE_ENV,
  },
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
    remove: false,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// If Axiom is configured, use pino.transport() with a target that fans out
// to both stdout (JSON) and Axiom. Otherwise write plain JSON to stdout with
// no worker thread — matches nodemon's expectations and avoids extra deps.
export const logger = AXIOM_TOKEN && AXIOM_DATASET
  ? pino(
      baseOptions,
      pino.transport({
        targets: [
          {
            target: "pino/file",
            options: { destination: 1 }, // stdout
            level: baseOptions.level,
          },
          {
            target: "@axiomhq/pino",
            options: { dataset: AXIOM_DATASET, token: AXIOM_TOKEN },
            level: "info",
          },
        ],
      })
    )
  : pino(baseOptions);

if (AXIOM_TOKEN && AXIOM_DATASET) {
  logger.info({ dataset: AXIOM_DATASET }, "[logger] Axiom shipping enabled");
} else {
  logger.info("[logger] Axiom disabled — set AXIOM_TOKEN + AXIOM_DATASET to enable");
}
