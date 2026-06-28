import crypto from "crypto";

function parseInitData(initData) {
  const params = new URLSearchParams(String(initData || ""));
  const data = {};

  for (const [key, value] of params.entries()) {
    data[key] = value;
  }

  return data;
}

function buildDataCheckString(data) {
  return Object.keys(data)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join("\n");
}

export function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) {
    throw new Error("Missing Telegram initData or bot token");
  }

  const parsed = parseInitData(initData);
  const receivedHash = parsed.hash;

  if (!receivedHash) {
    throw new Error("Missing Telegram hash");
  }

  const dataCheckString = buildDataCheckString(parsed);

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== receivedHash) {
    throw new Error("Invalid Telegram initData signature");
  }

  const authDate = Number(parsed.auth_date || 0);
  const now = Math.floor(Date.now() / 1000);

  if (!authDate || now - authDate > 60 * 60 * 24) {
    throw new Error("Telegram initData expired");
  }

  let user = null;
  if (parsed.user) {
    try {
      user = JSON.parse(parsed.user);
    } catch {
      throw new Error("Invalid Telegram user payload");
    }
  }

  if (!user?.id) {
    throw new Error("Missing Telegram user");
  }

  return {
    user,
    authDate,
    raw: parsed,
  };
}