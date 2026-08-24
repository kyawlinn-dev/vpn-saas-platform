// Telegram alert service.
//
// Sends short admin alerts to a private Telegram chat when infrastructure
// state degrades. Deliberately independent of the reseller bots managed in
// src/bot/manager.js — those bots belong to resellers, not to us. Alerts use
// a separate operator-owned bot.
//
// Configuration (all optional; no-op if either is unset):
//   ALERT_TELEGRAM_BOT_TOKEN  — bot token from @BotFather
//   ALERT_TELEGRAM_CHAT_ID    — chat id to receive alerts (get via @userinfobot)
//
// Called from:
//   - jobs/serverHealthJob.js       (once per tick, checks recent state)
//   - services/healthMonitoringService.js (on state change)
//
// Throttling: per (subject) with a 1-hour cooldown so we don't spam the chat
// during an incident. Stored in-memory (resets on backend restart) — fine for
// a single-process deployment; if we ever go multi-process, move to Redis.

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const lastSentAt = new Map(); // subject -> unix ms

function isEnabled() {
  return Boolean(process.env.ALERT_TELEGRAM_BOT_TOKEN && process.env.ALERT_TELEGRAM_CHAT_ID);
}

function shouldSend(subject) {
  const last = lastSentAt.get(subject) || 0;
  if (Date.now() - last < COOLDOWN_MS) return false;
  lastSentAt.set(subject, Date.now());
  return true;
}

/**
 * Send an alert to the operator's Telegram chat.
 * @param {object} args
 * @param {string} args.subject - short key used for throttling (e.g. "job:syncUsage:failing")
 * @param {string} args.text    - Markdown-safe message body
 * @param {boolean} [args.force] - bypass cooldown (use sparingly, e.g. resolved notifications)
 * @returns {Promise<boolean>} true if sent, false if suppressed/disabled
 */
export async function sendAlert({ subject, text, force = false }) {
  if (!isEnabled()) return false;
  if (!subject || !text) return false;
  if (!force && !shouldSend(subject)) return false;

  const token = process.env.ALERT_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ALERT_TELEGRAM_CHAT_ID;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🚨 NovaNet alert\n\n${text}`,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error("[alert] Telegram sendMessage failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[alert] Telegram sendMessage exception:", err.message);
    return false;
  }
}

/**
 * Convenience: report a failing job.
 */
export async function alertJobFailure({ jobName, consecutiveFailures, lastError }) {
  return sendAlert({
    subject: `job:${jobName}:failing`,
    text: `Job *${jobName}* has failed ${consecutiveFailures} time(s) in a row.\n\nLast error: \`${(lastError || "unknown").slice(0, 300)}\``,
  });
}

/**
 * Convenience: report a server whose Outline API went down.
 */
export async function alertServerDown({ serverId, serverName, lastError }) {
  return sendAlert({
    subject: `server:${serverId}:down`,
    text: `Server *${serverName || serverId}* Outline API is *failed*.\n\nLast error: \`${(lastError || "unknown").slice(0, 300)}\``,
  });
}

export function isAlertingEnabled() {
  return isEnabled();
}
