/**
 * botSession.js
 *
 * Thin wrapper around Upstash Redis for bot conversation state.
 * Each session is keyed per reseller + Telegram user and expires
 * automatically after SESSION_TTL_SECONDS of inactivity.
 *
 * Session shape (stored as JSON):
 *   { step: "awaiting_screenshot", planId, planName, priceMmk, durationDays, dataLimitGb }
 */

import { redis } from "../lib/redis.js";

const SESSION_TTL_SECONDS = 600; // 10 minutes — user must act within this window

function sessionKey(resellerId, telegramUserId) {
  return `bot:session:${resellerId}:${telegramUserId}`;
}

/** @returns {object|null} */
export async function getSession(resellerId, telegramUserId) {
  const data = await redis.get(sessionKey(resellerId, telegramUserId));
  return data ?? null;
}

/** Upsert a session. Resets the TTL on every call. */
export async function setSession(resellerId, telegramUserId, payload) {
  await redis.set(sessionKey(resellerId, telegramUserId), payload, {
    ex: SESSION_TTL_SECONDS,
  });
}

/** Delete a session (purchase complete, cancelled, or errored). */
export async function clearSession(resellerId, telegramUserId) {
  await redis.del(sessionKey(resellerId, telegramUserId));
}
