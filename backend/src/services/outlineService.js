import axios from "axios";
import https from "https";
import tls from "tls";
import crypto from "crypto";
import { parseSsUrl } from "../utils/parseSsUrl.js";

function normalizeFingerprint(value) {
  return String(value || "")
    .replace(/^sha256\//i, "")
    .replace(/:/g, "")
    .trim()
    .toUpperCase();
}

function parseApiUrl(apiUrl) {
  const url = new URL(apiUrl);

  return {
    origin: url.origin,
    pathname: url.pathname.replace(/\/+$/, ""),
    baseURL: `${url.origin}${url.pathname.replace(/\/+$/, "")}`,
    host: url.hostname,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    protocol: url.protocol,
  };
}

function buildPinnedTlsSocket({ host, port, expectedFingerprint, servername }) {
  return tls.connect({
    host,
    port,
    servername: servername || host,

    // self-signed Outline Manager cert support
    // trust is enforced by fingerprint pinning below
    rejectUnauthorized: false,

    checkServerIdentity: (_tlsHost, cert) => {
      const actual = crypto
        .createHash("sha256")
        .update(cert.raw)
        .digest("hex")
        .toUpperCase();

      if (!expectedFingerprint) {
        return new Error("Missing Outline certificate fingerprint");
      }

      if (actual !== expectedFingerprint) {
        return new Error(
          `Outline cert fingerprint mismatch. Expected ${expectedFingerprint}, got ${actual}`
        );
      }

      return undefined;
    },
  });
}

function createPinnedAgent({ apiUrl, certSha256 }) {
  const { host, port, protocol } = parseApiUrl(apiUrl);

  if (protocol !== "https:") {
    throw new Error("Outline API URL must use HTTPS");
  }

  const expectedFingerprint = normalizeFingerprint(certSha256);
  if (!expectedFingerprint) {
    throw new Error("Missing Outline certSha256");
  }

  return new https.Agent({
    keepAlive: true,
    maxSockets: 20,

    // self-signed cert allowed, but fingerprint must match
    rejectUnauthorized: false,

    createConnection: (_options, callback) => {
      try {
        const socket = buildPinnedTlsSocket({
          host,
          port,
          expectedFingerprint,
          servername: host,
        });

        if (callback) {
          socket.once("secureConnect", () => callback(null, socket));
          socket.once("error", (err) => callback(err));
        }

        return socket;
      } catch (err) {
        if (callback) callback(err);
        else throw err;
      }
    },
  });
}

function normalizeOutlineError(error, context = "Outline API request failed") {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = error.response?.data;

    const bodyMessage =
      typeof body?.message === "string"
        ? body.message
        : typeof body?.error === "string"
        ? body.error
        : typeof body === "string"
        ? body
        : null;

    const detail = bodyMessage || error.message || "Unknown axios error";
    const wrapped = new Error(
      status ? `${context} (${status}): ${detail}` : `${context}: ${detail}`
    );

    wrapped.name = "OutlineApiError";
    wrapped.status = status;
    wrapped.response = body;
    return wrapped;
  }

  const wrapped = new Error(
    `${context}: ${error?.message || "Unknown error"}`
  );
  wrapped.name = "OutlineApiError";
  return wrapped;
}

function shouldRetryOutlineError(error) {
  const status = error?.status || error?.response?.status;

  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;

  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("timeout") ||
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("econnrefused") ||
    message.includes("network error")
  );
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, { attempts = 3, baseDelayMs = 400 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= attempts || !shouldRetryOutlineError(error)) {
        throw error;
      }

      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError;
}

function createOutlineClient({ apiUrl, certSha256 }) {
  const { baseURL } = parseApiUrl(apiUrl);

  return axios.create({
    baseURL,
    httpsAgent: createPinnedAgent({ apiUrl, certSha256 }),
    timeout: 15000,
    validateStatus: (status) => status >= 200 && status < 300,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

export async function testOutlineServer({ apiUrl, certSha256 }) {
  const client = createOutlineClient({ apiUrl, certSha256 });

  try {
    const { data } = await withRetry(
      () => client.get("/server"),
      { attempts: 2, baseDelayMs: 300 }
    );

    return data;
  } catch (error) {
    throw normalizeOutlineError(error, "Failed to test Outline server");
  }
}

export async function listOutlineKeys({ apiUrl, certSha256 }) {
  const client = createOutlineClient({ apiUrl, certSha256 });

  try {
    const { data } = await withRetry(
      () => client.get("/access-keys"),
      { attempts: 2, baseDelayMs: 300 }
    );

    return Array.isArray(data?.accessKeys) ? data.accessKeys : [];
  } catch (error) {
    throw normalizeOutlineError(error, "Failed to list Outline keys");
  }
}

export async function getOutlineKey({ apiUrl, certSha256, outlineKeyId }) {
  const client = createOutlineClient({ apiUrl, certSha256 });

  try {
    const { data } = await withRetry(
      () => client.get(`/access-keys/${encodeURIComponent(String(outlineKeyId))}`),
      { attempts: 2, baseDelayMs: 300 }
    );

    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }

    throw normalizeOutlineError(
      error,
      `Failed to get Outline key ${outlineKeyId}`
    );
  }
}

export async function createOutlineKey({
  apiUrl,
  certSha256,
  name,
  dataLimitBytes = null,
}) {
  const client = createOutlineClient({ apiUrl, certSha256 });

  try {
    const { data: created } = await withRetry(
      () => client.post("/access-keys", { name }),
      { attempts: 3, baseDelayMs: 500 }
    );

    if (!created?.id || !created?.accessUrl) {
      throw new Error("Outline API did not return a valid access key payload");
    }

    parseSsUrl(created.accessUrl);

    if (dataLimitBytes && Number(dataLimitBytes) > 0) {
      try {
        await withRetry(
          () =>
            client.put(
              `/access-keys/${encodeURIComponent(String(created.id))}/data-limit`,
              {
                limit: { bytes: Math.floor(Number(dataLimitBytes)) },
              }
            ),
          { attempts: 3, baseDelayMs: 400 }
        );
      } catch (limitErr) {
        try {
          await client.delete(
            `/access-keys/${encodeURIComponent(String(created.id))}`
          );
        } catch {}

        throw limitErr;
      }
    }

    return {
      outline_key_id: String(created.id),
      key_name: created.name || name,
      access_url: created.accessUrl,
    };
  } catch (error) {
    throw normalizeOutlineError(error, "Failed to create Outline key");
  }
}

export async function renameOutlineKey({
  apiUrl,
  certSha256,
  outlineKeyId,
  name,
}) {
  const client = createOutlineClient({ apiUrl, certSha256 });

  try {
    await withRetry(
      () =>
        client.put(
          `/access-keys/${encodeURIComponent(String(outlineKeyId))}/name`,
          { name }
        ),
      { attempts: 2, baseDelayMs: 300 }
    );

    return { success: true };
  } catch (error) {
    throw normalizeOutlineError(
      error,
      `Failed to rename Outline key ${outlineKeyId}`
    );
  }
}

export async function updateOutlineKeyDataLimit({
  apiUrl,
  certSha256,
  outlineKeyId,
  dataLimitBytes,
}) {
  const client = createOutlineClient({ apiUrl, certSha256 });
  const keyId = encodeURIComponent(String(outlineKeyId));

  try {
    if (!dataLimitBytes || Number(dataLimitBytes) <= 0) {
      try {
        await withRetry(
          () => client.delete(`/access-keys/${keyId}/data-limit`),
          { attempts: 2, baseDelayMs: 300 }
        );
      } catch (error) {
        if (!(axios.isAxiosError(error) && error.response?.status === 404)) {
          throw error;
        }
      }

      return { success: true, data_limit_bytes: null };
    }

    const normalizedBytes = Math.floor(Number(dataLimitBytes));

    await withRetry(
      () =>
        client.put(`/access-keys/${keyId}/data-limit`, {
          limit: { bytes: normalizedBytes },
        }),
      { attempts: 3, baseDelayMs: 400 }
    );

    return { success: true, data_limit_bytes: normalizedBytes };
  } catch (error) {
    throw normalizeOutlineError(
      error,
      `Failed to update data limit for Outline key ${outlineKeyId}`
    );
  }
}

export async function deleteOutlineKey({ apiUrl, certSha256, outlineKeyId }) {
  const client = createOutlineClient({ apiUrl, certSha256 });
  const keyId = encodeURIComponent(String(outlineKeyId));

  try {
    await withRetry(
      () => client.delete(`/access-keys/${keyId}`),
      { attempts: 2, baseDelayMs: 300 }
    );

    return { success: true, deleted: true };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return { success: true, deleted: false, already_missing: true };
    }

    throw normalizeOutlineError(
      error,
      `Failed to delete Outline key ${outlineKeyId}`
    );
  }
}