import { runRemoteCommand } from "./sshService.js";

const SSH_USER = process.env.SERVER_BOOTSTRAP_SSH_USER || "root";
const SSH_KEY_PATH = process.env.SERVER_BOOTSTRAP_PRIVATE_KEY_PATH;
const PROMETHEUS_LOCAL_URL = "http://localhost:9090/api/v1/query";

function requireSshKey() {
  if (!SSH_KEY_PATH) {
    throw new Error("SERVER_BOOTSTRAP_PRIVATE_KEY_PATH is not set");
  }
}

function escapeSingleQuotes(value) {
  return String(value).replace(/'/g, `'\\''`);
}

function bytesToGb(bytes) {
  const value = Number(bytes || 0);
  return value > 0 ? Number((value / (1024 ** 3)).toFixed(2)) : 0;
}

function parsePrometheusVectorResponse(raw) {
  const parsed = JSON.parse(raw || "{}");

  if (parsed?.status !== "success") {
    throw new Error(parsed?.error || "Prometheus query failed");
  }

  return Array.isArray(parsed?.data?.result) ? parsed.data.result : [];
}

async function queryPrometheusOverSsh(host, promql) {
  requireSshKey();

  const command = [
    "curl -sG",
    `'${PROMETHEUS_LOCAL_URL}'`,
    "--data-urlencode",
    `'query=${escapeSingleQuotes(promql)}'`,
  ].join(" ");

  return runRemoteCommand({
    host,
    username: SSH_USER,
    privateKeyPath: SSH_KEY_PATH,
    command,
  });
}

async function queryServerUsageBytes30d(host) {
  const promql =
    'sum(increase(shadowsocks_data_bytes{dir=~"c<p|p>t"}[30d])) by (access_key)';
  const raw = await queryPrometheusOverSsh(host, promql);
  const result = parsePrometheusVectorResponse(raw);

  const map = {};

  for (const row of result) {
    const accessKey = row?.metric?.access_key;
    const value = Number(row?.value?.[1] || 0);

    if (!accessKey) continue;
    map[String(accessKey)] = {
      used_bytes_30d: Number.isFinite(value) ? Math.max(value, 0) : 0,
    };
  }

  return map;
}

async function queryServerRecentConnections24h(host) {
  const promql =
    "sum(increase(shadowsocks_tcp_connections_closed[24h])) by (access_key)";
  const raw = await queryPrometheusOverSsh(host, promql);
  const result = parsePrometheusVectorResponse(raw);

  const map = {};

  for (const row of result) {
    const accessKey = row?.metric?.access_key;
    const value = Number(row?.value?.[1] || 0);

    if (!accessKey) continue;
    map[String(accessKey)] = {
      recent_connections_24h: Number.isFinite(value)
        ? Math.max(Math.round(value), 0)
        : 0,
    };
  }

  return map;
}

export async function getOutlineMetricsForServer(host) {
  if (!host) {
    return {};
  }

  try {
    const [usageMap, connectionsMap] = await Promise.all([
      queryServerUsageBytes30d(host),
      queryServerRecentConnections24h(host),
    ]);

    const combined = {};
    const keys = new Set([
      ...Object.keys(usageMap || {}),
      ...Object.keys(connectionsMap || {}),
    ]);

    for (const keyId of keys) {
      const usedBytes30d = Number(usageMap?.[keyId]?.used_bytes_30d || 0);
      const recentConnections24h = Number(
        connectionsMap?.[keyId]?.recent_connections_24h || 0
      );

      combined[keyId] = {
        used_bytes_30d: usedBytes30d,
        used_gb_30d: bytesToGb(usedBytes30d),
        recent_connections_24h: recentConnections24h,
      };
    }

    return combined;
  } catch (error) {
    console.error(`Metrics fetch failed for server ${host}:`, error.message);
    return {};
  }
}

export function buildKeyUsageView(key, metrics = {}) {
  const dataLimitBytes =
    typeof key?.data_limit_bytes === "number" ? key.data_limit_bytes : null;
  const usedBytes30d = Number(metrics?.used_bytes_30d || 0);

  const remainingBytes30d =
    typeof dataLimitBytes === "number"
      ? Math.max(dataLimitBytes - usedBytes30d, 0)
      : null;

  return {
    ...key,
    used_bytes_30d: usedBytes30d,
    used_gb_30d: bytesToGb(usedBytes30d),
    data_limit_gb:
      typeof dataLimitBytes === "number" ? bytesToGb(dataLimitBytes) : null,
    remaining_gb_30d:
      typeof remainingBytes30d === "number" ? bytesToGb(remainingBytes30d) : null,
    recent_connections_24h: Number(metrics?.recent_connections_24h || 0),
  };
}