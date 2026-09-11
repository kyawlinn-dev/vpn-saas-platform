// Force Telegram out of exponential backoff by re-calling setWebhook with the
// current in-memory secret. Uses the bot manager's restartBot() so the secret
// stays in sync with what activeBots holds.

import { restartBot } from "../src/bot/manager.js";

const RESELLER_ID = "e51b3a9f-dca4-450a-aeb4-147064420a88"; // Shadow VPN

console.log("[kick] restarting bot for", RESELLER_ID);
await restartBot(RESELLER_ID);
console.log("[kick] restartBot returned — Telegram should now retry pending updates within seconds");
