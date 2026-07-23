import crypto from "node:crypto";

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_CLOCK_SKEW_SECONDS = 30;

export function verifyTelegramInitData(
  initData,
  botToken,
  { nowSeconds = Math.floor(Date.now() / 1000), maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS } = {}
) {
  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { valid: false, user: null };
  }

  const hash = params.get("hash");
  if (!/^[a-f0-9]{64}$/i.test(hash || "")) {
    return { valid: false, user: null };
  }

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  try {
    if (!crypto.timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(hash, "hex"))) {
      return { valid: false, user: null };
    }
  } catch {
    return { valid: false, user: null };
  }

  const authDate = Number(params.get("auth_date"));
  const ageSeconds = nowSeconds - authDate;
  if (
    !Number.isSafeInteger(authDate) ||
    authDate <= 0 ||
    ageSeconds > maxAgeSeconds ||
    ageSeconds < -MAX_CLOCK_SKEW_SECONDS
  ) {
    return { valid: false, user: null };
  }

  try {
    const user = JSON.parse(params.get("user") || "null");
    if (!user?.id) return { valid: false, user: null };
    return { valid: true, user };
  } catch {
    return { valid: false, user: null };
  }
}
