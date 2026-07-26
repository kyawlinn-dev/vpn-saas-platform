import { supabase } from "../lib/supabase.js";

export class ServerAvailabilityError extends Error {
  constructor(message, code = "NO_ACTIVE_SERVER") {
    super(message);
    this.name = "ServerAvailabilityError";
    this.code = code;
  }
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRegion(region) {
  return String(region || "").trim().toLowerCase();
}

function normalizeServerTier(serverTier) {
  const value = String(serverTier || "").trim().toLowerCase();
  return value === "trial" ? "trial" : "premium";
}

function isServerReady(server) {
  return (
    server &&
    String(server.status || "").toLowerCase() === "active" &&
    typeof server.outline_api_url === "string" &&
    server.outline_api_url.trim().length > 0 &&
    typeof server.outline_cert_sha256 === "string" &&
    server.outline_cert_sha256.trim().length > 0
  );
}

function hasCapacity(server) {
  const current = toNumber(server.current_active_keys, 0);
  const max = toNumber(server.max_active_keys, 0);
  return max > 0 && current < max;
}

function serverLoadRatio(server) {
  const current = toNumber(server.current_active_keys, 0);
  const max = toNumber(server.max_active_keys, 0);
  return max > 0 ? current / max : Number.POSITIVE_INFINITY;
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

export function rankProvisionableServers(servers = []) {
  return [...servers]
    .filter((server) => isServerReady(server) && hasCapacity(server))
    .sort((a, b) => {
      const loadDiff = serverLoadRatio(a) - serverLoadRatio(b);
      if (loadDiff !== 0) return loadDiff;

      if (Boolean(a.is_default) !== Boolean(b.is_default)) {
        return Boolean(a.is_default) ? -1 : 1;
      }

      const currentDiff =
        toNumber(a.current_active_keys, 0) - toNumber(b.current_active_keys, 0);
      if (currentDiff !== 0) return currentDiff;

      const sortDiff = toNumber(a.sort_order, 0) - toNumber(b.sort_order, 0);
      if (sortDiff !== 0) return sortDiff;

      const createdDiff = compareText(a.created_at, b.created_at);
      if (createdDiff !== 0) return createdDiff;

      return compareText(a.id, b.id);
    });
}

function pickRankedServersForRegions(servers, regions) {
  const ranked = rankProvisionableServers(servers);
  const normalizedRegions = (regions || []).map((region) => normalizeRegion(region)).filter(Boolean);

  if (!normalizedRegions.length) return ranked;

  const selected = [];
  const seenRegions = new Set();

  for (const region of normalizedRegions) {
    if (seenRegions.has(region)) continue;
    seenRegions.add(region);

    const match = ranked.find((server) => normalizeRegion(server.region) === region);
    if (match) selected.push(match);
  }

  return selected;
}

export async function getServerById(serverId) {
  const { data, error } = await supabase
    .from("vpn_servers")
    .select("*")
    .eq("id", serverId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Server not found");
  }

  return data;
}

export async function listServers() {
  const { data, error } = await supabase
    .from("vpn_servers")
    .select("*")
    .order("is_default", { ascending: false })
    .order("current_active_keys", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getAvailableServer() {
  const servers = rankProvisionableServers(await listServers());
  const server = servers.find((item) => normalizeServerTier(item.server_tier) === "premium");

  if (!server) {
    throw new ServerAvailabilityError(
      "No active server available. Provision a server first, then activate the order.",
      "NO_ACTIVE_SERVER"
    );
  }

  return server;
}

export async function getActiveServers({ regions = [], limit = 1, serverTier = "premium" } = {}) {
  const normalizedTier = normalizeServerTier(serverTier);
  let query = supabase
    .from("vpn_servers")
    .select("*")
    .eq("status", "active")
    .eq("server_tier", normalizedTier)
    .order("current_active_keys", { ascending: true });

  const normalizedRegions = (regions || [])
    .map((r) => normalizeRegion(r))
    .filter(Boolean);

  if (normalizedRegions.length) {
    query = query.in("region", normalizedRegions);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const filtered = pickRankedServersForRegions(data || [], normalizedRegions);

  return limit > 0 ? filtered.slice(0, limit) : filtered;
}

export async function incrementServerUsage(serverId) {
  // optimistic concurrency loop:
  // read -> conditional update where current_active_keys still equals previous value
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: row, error: readErr } = await supabase
      .from("vpn_servers")
      .select("id, current_active_keys, max_active_keys")
      .eq("id", serverId)
      .single();

    if (readErr || !row) {
      throw new Error(readErr?.message || "Server not found");
    }

    const current = toNumber(row.current_active_keys, 0);
    const max = toNumber(row.max_active_keys, 0);

    if (max > 0 && current >= max) {
      throw new ServerAvailabilityError("Server is full", "SERVER_FULL");
    }

    const next = current + 1;

    const { data: updatedRows, error: updateErr } = await supabase
      .from("vpn_servers")
      .update({
        current_active_keys: next,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", serverId)
      .eq("current_active_keys", current)
      .select("id");

    if (updateErr) {
      throw new Error(updateErr.message || "Failed to update server usage");
    }

    if (updatedRows && updatedRows.length > 0) {
      return true;
    }
  }

  throw new ServerAvailabilityError(
    "Server usage changed concurrently. Please retry activation.",
    "SERVER_USAGE_RACE"
  );
}

export async function decrementServerUsage(serverId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: row, error: readErr } = await supabase
      .from("vpn_servers")
      .select("id, current_active_keys")
      .eq("id", serverId)
      .single();

    if (readErr || !row) {
      throw new Error(readErr?.message || "Server not found");
    }

    const current = toNumber(row.current_active_keys, 0);
    const next = Math.max(0, current - 1);

    const { data: updatedRows, error: updateErr } = await supabase
      .from("vpn_servers")
      .update({
        current_active_keys: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", serverId)
      .eq("current_active_keys", current)
      .select("id");

    if (updateErr) {
      throw new Error(updateErr.message || "Failed to update server usage");
    }

    if (updatedRows && updatedRows.length > 0) {
      return true;
    }
  }

  throw new Error("Failed to decrement server usage due to concurrent updates");
}

export async function setServerError(serverId, message) {
  const { error } = await supabase
    .from("vpn_servers")
    .update({
      last_error: String(message || "Unknown error").slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", serverId);

  if (error) throw new Error(error.message);
}

export async function clearServerError(serverId) {
  const { error } = await supabase
    .from("vpn_servers")
    .update({
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", serverId);

  if (error) throw new Error(error.message);
}

export async function getServerInventorySummary() {
  const servers = await listServers();

  const summary = {
    total: servers.length,
    available: 0,
    provisioning: 0,
    active_configured: 0,
    active_not_ready: 0,
    full: 0,
    failed: 0,
  };

  for (const server of servers) {
    const status = String(server.status || "").toLowerCase();
    const ready = isServerReady(server);
    const capacityAvailable = hasCapacity(server);

    if (status === "provisioning") {
      summary.provisioning += 1;
      continue;
    }

    if (status === "failed") {
      summary.failed += 1;
      continue;
    }

    if (status === "active") {
      if (ready) {
        summary.active_configured += 1;
        if (capacityAvailable) summary.available += 1;
        else summary.full += 1;
      } else {
        summary.active_not_ready += 1;
      }
      continue;
    }

    if (status === "available") {
      if (ready && capacityAvailable) summary.available += 1;
      else if (ready) summary.full += 1;
      else summary.active_not_ready += 1;
    }
  }

  return summary;
}
