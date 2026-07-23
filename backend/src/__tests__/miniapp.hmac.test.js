import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTelegramInitData } from "../utils/telegramInitData.js";

function buildValidInitData(botToken, overrides = {}) {
  const user = overrides.user ?? JSON.stringify({ id: 123456, first_name: "Test" });
  const authDate = overrides.auth_date ?? String(Math.floor(Date.now() / 1000));
  const params = new URLSearchParams({ user, auth_date: authDate });
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

const BOT_TOKEN = "test-bot-token-12345";

describe("verifyTelegramInitData", () => {
  it("accepts valid initData with correct HMAC", () => {
    const result = verifyTelegramInitData(buildValidInitData(BOT_TOKEN), BOT_TOKEN);
    expect(result.valid).toBe(true);
    expect(result.user).toMatchObject({ id: 123456 });
  });

  it("rejects a tampered hash", () => {
    const params = new URLSearchParams(buildValidInitData(BOT_TOKEN));
    params.set("hash", "a".repeat(64));
    expect(verifyTelegramInitData(params.toString(), BOT_TOKEN).valid).toBe(false);
  });

  it("rejects initData signed with another bot token", () => {
    const initData = buildValidInitData("wrong-bot-token");
    expect(verifyTelegramInitData(initData, BOT_TOKEN).valid).toBe(false);
  });

  it("rejects initData older than 24 hours", () => {
    const authDate = String(Math.floor(Date.now() / 1000) - 86401);
    const initData = buildValidInitData(BOT_TOKEN, { auth_date: authDate });
    expect(verifyTelegramInitData(initData, BOT_TOKEN).valid).toBe(false);
  });

  it("rejects initData too far in the future", () => {
    const authDate = String(Math.floor(Date.now() / 1000) + 300);
    const initData = buildValidInitData(BOT_TOKEN, { auth_date: authDate });
    expect(verifyTelegramInitData(initData, BOT_TOKEN).valid).toBe(false);
  });

  it("rejects a missing hash", () => {
    const params = new URLSearchParams(buildValidInitData(BOT_TOKEN));
    params.delete("hash");
    expect(verifyTelegramInitData(params.toString(), BOT_TOKEN).valid).toBe(false);
  });

  it("rejects a malformed hash", () => {
    const params = new URLSearchParams(buildValidInitData(BOT_TOKEN));
    params.set("hash", "tooshort");
    expect(verifyTelegramInitData(params.toString(), BOT_TOKEN).valid).toBe(false);
  });

  it("rejects a user without an id", () => {
    const user = JSON.stringify({ first_name: "NoId" });
    const initData = buildValidInitData(BOT_TOKEN, { user });
    expect(verifyTelegramInitData(initData, BOT_TOKEN).valid).toBe(false);
  });

  it("rejects empty input", () => {
    expect(verifyTelegramInitData("", BOT_TOKEN).valid).toBe(false);
  });
});
