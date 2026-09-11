/**
 * marzneshinService.js — Marzneshin panel API client.
 *
 * Drop-in companion to outlineService.js.  Every exported function accepts a
 * `server` object (the vpn_servers row) instead of raw apiUrl/certSha256, and
 * returns the same shapes so subscriptionProvisionService / vpnProviderService
 * can treat both providers identically.
 *
 * Marzneshin REST surface (panel v0.6+):
 *   POST /api/admins/token          — login (form-urlencoded → JWT)
 *   GET  /api/users                 — list users
 *   GET  /api/users/{username}      — get user
 *   POST /api/users                 — create user
 *   PUT  /api/users/{username}      — update user (data_limit, status, …)
 *   DELETE /api/users/{username}    — delete user
 *   GET  /api/system                — system info (health check)
 *   GET  /api/nodes                 — list nodes
 *   GET  /api/users/{username}/usage — per-user traffic (if supported)
 */

import axios from "axios";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_TIMEOUT_MS =
  Number(process.env.MARZNESHIN_API_TIMEOUT_MS) || 30_000;

// JWT tokens live ~24 h by default; we refresh well before that.
const TOKEN_REFRESH_MARGIN_MS = 2 * 60 * 60 * 1000; // 2 h before expiry

// In-memory token cache: panelUrl → { token, expiresAt }
const tokenCache = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePanelUrl(url) {
  return String(url || "")
    .replace(/\/+$/, "")
    .trim();
}

function normalizeError(error, context = "Marzneshin API request failed") {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = error.response?.data;

    const bodyMessage =
      typeof body?.detail === "string"
        ? body.detail
        : typeof body?.message === "string"
          ? body.message
          : typeof body === "string"
            ? body
            : null;

    const detail = bodyMessage || error.message || "Unknown axios error";
    const wrapped = new Error(
      status ? `${context} (${status}): ${detail}` : `${context}: ${detail}`
    );

    wrapped.name = "MarzneshinApiError";
    wrapped.status = status;
    wrapped.response = body;
    return wrapped;
  }

  const wrapped = new Error(
    `${context}: ${error?.message || "Unknown error"}`
  );
  wrapped.name = "MarzneshinApiError";
  return wrapped;
}

function shouldRetry(error) {
  const status = error?.status || error?.response?.status;
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;

  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("socket hang up") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("econnrefused") ||
    msg.includes("network error")
  );
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, { attempts = 3, baseDelayMs = 400 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      await sleep(baseDelayMs * attempt);
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Auth — JWT bearer token, cached per panel URL
// ---------------------------------------------------------------------------

function decodeJwtExpiry(token) {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (decoded.exp) return decoded.exp * 1000; // seconds → ms
  } catch {
    // fall through
  }
  // fallback: assume 24 h from now
  return Date.now() + 24 * 60 * 60 * 1000;
}

async function authenticate(panelUrl, username, password) {
  const url = `${normalizePanelUrl(panelUrl)}/api/admins/token`;

  const { data } = await axios.post(
    url,
    new URLSearchParams({ username, password, grant_type: "password" }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: API_TIMEOUT_MS,
    }
  );

  if (!data?.access_token) {
    throw new Error("Marzneshin auth response missing access_token");
  }

  return {
    token: data.access_token,
    expiresAt: decodeJwtExpiry(data.access_token),
  };
}

async function getToken(server) {
  const panelUrl = normalizePanelUrl(server.panel_url);
  const cached = tokenCache.get(panelUrl);

  if (cached && cached.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
    return cached.token;
  }

  const username = server.panel_username;
  const password = server._panel_password; // decrypted by caller

  if (!username || !password) {
    throw new Error(
      "Marzneshin panel credentials missing (panel_username / _panel_password)"
    );
  }

  const result = await authenticate(panelUrl, username, password);
  tokenCache.set(panelUrl, result);
  return result.token;
}

// ---------------------------------------------------------------------------
// Axios client factory
// ---------------------------------------------------------------------------

async function createClient(server) {
  const panelUrl = normalizePanelUrl(server.panel_url);
  const token = await getToken(server);

  return axios.create({
    baseURL: `${panelUrl}/api`,
    timeout: API_TIMEOUT_MS,
    validateStatus: (s) => s >= 200 && s < 300,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

// ---------------------------------------------------------------------------
// Subscription URL builder
// ---------------------------------------------------------------------------

function buildSubscriptionUrl(server, username, subscriptionKey) {
  const panelUrl = normalizePanelUrl(server.panel_url);
  // Use the public-facing panel URL (HTTPS via Nginx), not internal 127.0.0.1
  const publicUrl = server.panel_public_url
    ? normalizePanelUrl(server.panel_public_url)
    : panelUrl;
  return `${publicUrl}/sub/${encodeURIComponent(username)}/${subscriptionKey}`;
}

// ---------------------------------------------------------------------------
// Username generator
//
// Marzneshin usernames must be unique. We build a deterministic, readable
// slug from the key name (customer | server | plan | order) and append a
// random suffix to guarantee uniqueness on retries.
// ---------------------------------------------------------------------------

function buildUsername(name) {
  const slug = String(name || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);

  const rand = Math.random().toString(36).slice(2, 8);
  return `${slug}_${rand}`;
}

// ---------------------------------------------------------------------------
// Public API — mirrors outlineService function signatures
// ---------------------------------------------------------------------------

/**
 * Test connectivity to the Marzneshin panel.
 *
 * Returns the system info payload on success, throws on failure.
 */
export async function testMarzneshinServer(server) {
  try {
    const client = await createClient(server);
    // Marzneshin has no /api/system endpoint; /api/nodes is the lightest
    // authenticated call that proves the panel is alive and the JWT is valid.
    const { data } = await withRetry(() => client.get("/nodes"), {
      attempts: 2,
      baseDelayMs: 300,
    });
    return data;
  } catch (error) {
    throw normalizeError(error, "Failed to test Marzneshin server");
  }
}

/**
 * Create a VPN user on the Marzneshin panel.
 *
 * Maps to outlineService.createOutlineKey():
 *   - outline_key_id  → Marzneshin username
 *   - key_name        → display name
 *   - access_url      → subscription URL
 *
 * Protocol determines which service IDs to assign:
 *   - "shadowsocks" → server.marzneshin_service_ids (per-node SS service)
 *   - "vless"       → server.marzneshin_vless_service_ids (global all-nodes VLESS service)
 */
export async function createMarzneshinUser({
  server,
  name,
  dataLimitBytes = null,
  serviceIds = null,
  protocol = "shadowsocks",
}) {
  const client = await createClient(server);
  const username = buildUsername(name);

  // Resolve service IDs based on protocol:
  //   explicit param > protocol-specific column > generic fallback
  let services;
  if (serviceIds) {
    services = serviceIds;
  } else if (protocol === "vless" || protocol === "hysteria2") {
    services = server.marzneshin_vless_service_ids?.length
      ? server.marzneshin_vless_service_ids
      : server.marzneshin_service_ids || [];
  } else {
    // shadowsocks — per-server SS service
    services = server.marzneshin_service_ids || [];
  }

  if (!services.length) {
    throw new Error(
      `Server ${server.id} (${server.name}) has no Marzneshin service IDs configured for protocol "${protocol}". ` +
        `Set marzneshin_service_ids (SS) or marzneshin_vless_service_ids (VLESS) on the vpn_servers row.`
    );
  }

  const payload = {
    username,
    service_ids: services,
    data_limit: dataLimitBytes ? Math.floor(Number(dataLimitBytes)) : 0,
    data_limit_reset_strategy: "no_reset",
    expire_strategy: "never",
    note: name || "",
  };

  try {
    const { data: created } = await withRetry(
      () => client.post("/users", payload),
      { attempts: 3, baseDelayMs: 500 }
    );

    if (!created?.username) {
      throw new Error("Marzneshin API did not return a valid user");
    }

    // The subscription key is returned on creation
    const subscriptionKey =
      created.key || created.subscription_url?.split("/").pop() || "";

    const accessUrl = buildSubscriptionUrl(
      server,
      created.username,
      subscriptionKey
    );

    return {
      outline_key_id: created.username,
      key_name: name || created.username,
      access_url: accessUrl,
      _marzneshin_meta: {
        username: created.username,
        subscription_key: subscriptionKey,
        service_ids: services,
      },
    };
  } catch (error) {
    throw normalizeError(error, "Failed to create Marzneshin user");
  }
}

/**
 * Delete a VPN user from the Marzneshin panel.
 *
 * Maps to outlineService.deleteOutlineKey().
 * `outlineKeyId` is the Marzneshin username.
 */
export async function deleteMarzneshinUser({ server, outlineKeyId }) {
  const client = await createClient(server);
  const username = encodeURIComponent(String(outlineKeyId));

  try {
    await withRetry(() => client.delete(`/users/${username}`), {
      attempts: 2,
      baseDelayMs: 300,
    });

    return { success: true, deleted: true };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return { success: true, deleted: false, already_missing: true };
    }
    throw normalizeError(
      error,
      `Failed to delete Marzneshin user ${outlineKeyId}`
    );
  }
}

/**
 * Get a single Marzneshin user.
 *
 * Maps to outlineService.getOutlineKey().
 */
export async function getMarzneshinUser({ server, outlineKeyId }) {
  const client = await createClient(server);
  const username = encodeURIComponent(String(outlineKeyId));

  try {
    const { data } = await withRetry(() => client.get(`/users/${username}`), {
      attempts: 2,
      baseDelayMs: 300,
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw normalizeError(
      error,
      `Failed to get Marzneshin user ${outlineKeyId}`
    );
  }
}

/**
 * List all Marzneshin users.
 *
 * Maps to outlineService.listOutlineKeys().
 */
export async function listMarzneshinUsers(server) {
  const client = await createClient(server);

  try {
    // Marzneshin paginates with page/size, returns { items, total, page, pages }
    const allUsers = [];
    let page = 1;
    const size = 50;

    while (true) {
      const { data } = await withRetry(
        () => client.get("/users", { params: { page, size } }),
        { attempts: 2, baseDelayMs: 300 }
      );

      const users = Array.isArray(data?.items) ? data.items : [];
      allUsers.push(...users);

      // Stop if we've fetched all pages
      if (page >= (data?.pages || 1)) break;
      page += 1;

      // safety valve
      if (allUsers.length > 10_000) break;
    }

    return allUsers;
  } catch (error) {
    throw normalizeError(error, "Failed to list Marzneshin users");
  }
}

/**
 * Update data limit for a Marzneshin user.
 *
 * Maps to outlineService.updateOutlineKeyDataLimit().
 */
/**
 * Read-modify-write helper.
 *
 * Marzneshin's PUT /users/{username} is a full-replace — partial payloads
 * return 422. This helper reads the current user, merges the patch, and
 * PUTs the full object back.
 */
async function patchMarzneshinUser(server, outlineKeyId, patch, context) {
  const client = await createClient(server);
  const rawUsername = String(outlineKeyId);
  const encodedUsername = encodeURIComponent(rawUsername);

  // 1. Read current state
  const { data: current } = await withRetry(
    () => client.get(`/users/${encodedUsername}`),
    { attempts: 2, baseDelayMs: 300 }
  );

  // 2. Build full PUT body — only the fields Marzneshin accepts on update
  const body = {
    username: current.username,
    service_ids: current.service_ids || [],
    expire_strategy: current.expire_strategy || "never",
    expire_date: current.expire_date || null,
    data_limit: current.data_limit ?? 0,
    data_limit_reset_strategy: current.data_limit_reset_strategy || "no_reset",
    note: current.note || "",
    enabled: current.enabled ?? true,
    ...patch,
  };

  // 3. Write back
  const { data: updated } = await withRetry(
    () => client.put(`/users/${encodedUsername}`, body),
    { attempts: 3, baseDelayMs: 400 }
  );

  return updated;
}

export async function updateMarzneshinUserDataLimit({
  server,
  outlineKeyId,
  dataLimitBytes,
}) {
  const normalizedBytes =
    dataLimitBytes && Number(dataLimitBytes) > 0
      ? Math.floor(Number(dataLimitBytes))
      : 0; // 0 = unlimited in Marzneshin

  try {
    await patchMarzneshinUser(server, outlineKeyId, {
      data_limit: normalizedBytes,
    }, "update data limit");

    return {
      success: true,
      data_limit_bytes: normalizedBytes || null,
    };
  } catch (error) {
    throw normalizeError(
      error,
      `Failed to update data limit for Marzneshin user ${outlineKeyId}`
    );
  }
}

/**
 * Rename (update note) for a Marzneshin user.
 */
export async function renameMarzneshinUser({ server, outlineKeyId, name }) {
  try {
    await patchMarzneshinUser(server, outlineKeyId, {
      note: name,
    }, "rename");
    return { success: true };
  } catch (error) {
    throw normalizeError(
      error,
      `Failed to rename Marzneshin user ${outlineKeyId}`
    );
  }
}

/**
 * Get transfer metrics for all users on a Marzneshin panel.
 *
 * Maps to outlineService.getOutlineTransferMetrics().
 * Returns { [username]: bytesTransferred }.
 */
export async function getMarzneshinTransferMetrics(server) {
  try {
    const users = await listMarzneshinUsers(server);

    const metrics = {};
    for (const user of users) {
      // Marzneshin tracks used_traffic (bytes) per user
      const usedBytes = Number(user.used_traffic || 0);
      if (usedBytes > 0) {
        metrics[user.username] = usedBytes;
      }
    }

    return metrics;
  } catch (error) {
    throw normalizeError(
      error,
      "Failed to fetch Marzneshin transfer metrics"
    );
  }
}

/**
 * Reset used traffic for a Marzneshin user.
 */
export async function resetMarzneshinUserTraffic({ server, outlineKeyId }) {
  const client = await createClient(server);
  const username = encodeURIComponent(String(outlineKeyId));

  try {
    await withRetry(
      () => client.post(`/users/${username}/reset`),
      { attempts: 2, baseDelayMs: 300 }
    );
    return { success: true };
  } catch (error) {
    throw normalizeError(
      error,
      `Failed to reset traffic for Marzneshin user ${outlineKeyId}`
    );
  }
}

/**
 * Enable / disable a Marzneshin user.
 */
export async function setMarzneshinUserStatus({
  server,
  outlineKeyId,
  enabled,
}) {
  try {
    await patchMarzneshinUser(server, outlineKeyId, {
      enabled: !!enabled,
    }, "set status");
    return { success: true };
  } catch (error) {
    throw normalizeError(
      error,
      `Failed to ${enabled ? "enable" : "disable"} Marzneshin user ${outlineKeyId}`
    );
  }
}

// ---------------------------------------------------------------------------
// Subscription parsing — extract individual protocol configs
// ---------------------------------------------------------------------------

/**
 * Fetch the Marzneshin subscription URL and parse out protocol-specific
 * connection details.
 *
 * The subscription URL returns base64-encoded lines (one per protocol):
 *   ss://base64(method:password@host:port)#label
 *   vless://uuid@host:port?params#label
 *   hysteria2://password@host:port?params#label
 *
 * Returns { ss, vless, hysteria2 } — each is null if not found.
 */
export async function fetchSubscriptionConfigs(subscriptionUrl) {
  const { data: raw } = await axios.get(subscriptionUrl, {
    headers: { "User-Agent": "v2ray" }, // triggers base64 response
    timeout: API_TIMEOUT_MS,
    responseType: "text",
  });

  const decoded = Buffer.from(String(raw).trim(), "base64").toString("utf8");
  const lines = decoded.split("\n").map((l) => l.trim()).filter(Boolean);

  const result = { ss: null, vless: null, hysteria2: null };

  for (const line of lines) {
    if (line.startsWith("ss://")) {
      result.ss = parseSsUri(line);
    } else if (line.startsWith("vless://")) {
      result.vless = line;
    } else if (line.startsWith("hysteria2://")) {
      result.hysteria2 = line;
    }
  }

  return result;
}

/**
 * Parse an ss:// URI into { server, port, method, password }.
 * Format: ss://base64(method:password@host:port)#fragment
 */
function parseSsUri(uri) {
  try {
    const withoutFragment = uri.split("#")[0];
    const encoded = withoutFragment.replace(/^ss:\/\//, "");
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    // method:password@host:port
    const [methodPassword, hostPort] = decoded.split("@");
    if (!methodPassword || !hostPort) return null;

    const colonIdx = methodPassword.indexOf(":");
    const method = methodPassword.slice(0, colonIdx);
    const password = methodPassword.slice(colonIdx + 1);

    const lastColon = hostPort.lastIndexOf(":");
    const server = hostPort.slice(0, lastColon);
    const port = Number(hostPort.slice(lastColon + 1));

    return { server, port, method, password };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache management (for tests / graceful shutdown)
// ---------------------------------------------------------------------------

export function clearTokenCache() {
  tokenCache.clear();
}
