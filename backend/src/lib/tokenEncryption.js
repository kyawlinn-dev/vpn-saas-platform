import crypto from "node:crypto";

let _key = null;

function _getKey() {
  if (_key) return _key;
  const hex = process.env.BOT_TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "BOT_TOKEN_ENCRYPTION_KEY is not set. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      `BOT_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${hex.length}.`
    );
  }
  _key = Buffer.from(hex, "hex");
  return _key;
}

export function validateEncryptionKey() {
  _getKey();
}

export function encrypt(plaintext) {
  const key = _getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decrypt(stored) {
  const key = _getKey();
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format");
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
