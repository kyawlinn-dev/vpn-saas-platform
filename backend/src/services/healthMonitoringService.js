import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { supabase } from "../lib/supabase.js";
import { listOutlineKeys, testOutlineServer } from "./outlineService.js";
import { alertJobFailure, alertServerDown } from "./alertService.js";

const execFileAsync = promisify(execFile);

const DEFAULT_USAGE_SYNC_STALE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_HEALTH_CHECK_STALE_MS = 15 * 60 * 1000;
const MAX_ERROR_LENGTH = 1000;

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envMs(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeErrorMessage(error) {
  return String(error?.message || error || "Unknown error").slice(0, MAX_ERROR_LENGTH);
}

function isMissingHealthTable(error) {
  return (
    error?.code === "42P01" ||
    /system_job_runs|server_health_status/i.test(error?.message || "")
  );
}

async function readJobRun(jobName) {
  const { data, error } = await supabase
    .from("system_job_runs")
    .select("*")
    .eq("job_name", jobName)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function markJobStarted(jobName) {
  try {
    const existing = await readJobRun(jobName);
    const { error } = await supabase.from("system_job_runs").upsert(
      {
        job_name: jobName,
        status: "running",
        last_started_at: nowIso(),
        last_error: null,
        run_count: toNumber(existing?.run_count, 0) + 1,
        updated_at: nowIso(),
      },
      { onConflict: "job_name" }
    );

    if (error) throw error;
  } catch (error) {
    if (!isMissingHealthTable(error)) {
      console.warn(`[health] Failed to mark ${jobName} started:`, error.message);
    }
  }
}

export async function markJobSuccess(jobName) {
  try {
    const { error } = await supabase.from("system_job_runs").upsert(
      {
        job_name: jobName,
        status: "success",
        last_finished_at: nowIso(),
        last_success_at: nowIso(),
        last_error: null,
        consecutive_failures: 0,
        updated_at: nowIso(),
      },
      { onConflict: "job_name" }
    );

    if (error) throw error;
  } catch (error) {
    if (!isMissingHealthTable(error)) {
      console.warn(`[health] Failed to mark ${jobName} success:`, error.message);
    }
  }
}

export async function markJobFailure(jobName, error) {
  try {
    const existing = await readJobRun(jobName);
    const nextFailures = toNumber(existing?.consecutive_failures, 0) + 1;
    const { error: upsertError } = await supabase.from("system_job_runs").upsert(
      {
        job_name: jobName,
        status: "failed",
        last_finished_at: nowIso(),
        last_error: safeErrorMessage(error),
        consecutive_failures: nextFailures,
        updated_at: nowIso(),
      },
      { onConflict: "job_name" }
    );

    if (upsertError) throw upsertError;

    // Alert on 3rd+ consecutive failure (throttled inside alertService).
    if (nextFailures >= 3) {
      // fire-and-forget; alert failures already log inside the service
      void alertJobFailure({
        jobName,
        consecutiveFailures: nextFailures,
        lastError: safeErrorMessage(error),
      });
    }
  } catch (upsertError) {
    if (!isMissingHealthTable(upsertError)) {
      console.warn(`[health] Failed to mark ${jobName} failure:`, upsertError.message);
    }
  }
}

async function readServerHealth(serverId) {
  const { data, error } = await supabase
    .from("server_health_status")
    .select("*")
    .eq("server_id", serverId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function recordServerUsageSyncSuccess(serverId, { activeKeysSeen = null } = {}) {
  try {
    const existing = await readServerHealth(serverId);
    const { error } = await supabase.from("server_health_status").upsert(
      {
        server_id: serverId,
        outline_api_status:
          existing?.outline_api_status && existing.outline_api_status !== "unknown"
            ? existing.outline_api_status
            : "healthy",
        last_usage_sync_at: nowIso(),
        last_error: null,
        active_key_count_seen:
          activeKeysSeen == null ? existing?.active_key_count_seen ?? null : activeKeysSeen,
        consecutive_failures: 0,
        updated_at: nowIso(),
      },
      { onConflict: "server_id" }
    );

    if (error) throw error;
  } catch (error) {
    if (!isMissingHealthTable(error)) {
      console.warn(`[health] Failed to record usage sync for server ${serverId}:`, error.message);
    }
  }
}

export async function recordServerHealthFailure(serverId, error) {
  try {
    const existing = await readServerHealth(serverId);
    const nextFailures = toNumber(existing?.consecutive_failures, 0) + 1;
    const wasHealthy = existing?.outline_api_status !== "failed";
    const { error: upsertError } = await supabase.from("server_health_status").upsert(
      {
        server_id: serverId,
        outline_api_status: "failed",
        last_checked_at: nowIso(),
        last_error: safeErrorMessage(error),
        consecutive_failures: nextFailures,
        updated_at: nowIso(),
      },
      { onConflict: "server_id" }
    );

    if (upsertError) throw upsertError;

    // Alert on state transition into failed, or every 3rd repeat while failed.
    if (wasHealthy || nextFailures % 3 === 0) {
      // Best-effort friendly name lookup — falls back to UUID on error.
      let serverName = serverId;
      try {
        const { data: srv } = await supabase
          .from("vpn_servers")
          .select("name, region")
          .eq("id", serverId)
          .maybeSingle();
        if (srv?.name) {
          serverName = srv.region ? `${srv.name} (${srv.region})` : srv.name;
        }
      } catch {}

      void alertServerDown({
        serverId,
        serverName,
        lastError: safeErrorMessage(error),
      });
    }
  } catch (upsertError) {
    if (!isMissingHealthTable(upsertError)) {
      console.warn(`[health] Failed to record server ${serverId} failure:`, upsertError.message);
    }
  }
}

export async function checkOutlineServerHealth(server) {
  const startedAt = Date.now();

  try {
    if (!server?.outline_api_url || !server?.outline_cert_sha256) {
      throw new Error("Outline API config is missing");
    }

    await testOutlineServer({
      apiUrl: server.outline_api_url,
      certSha256: server.outline_cert_sha256,
    });

    const keys = await listOutlineKeys({
      apiUrl: server.outline_api_url,
      certSha256: server.outline_cert_sha256,
    });

    const responseMs = Date.now() - startedAt;
    const activeKeyCountSeen = Array.isArray(keys) ? keys.length : null;

    const { error } = await supabase.from("server_health_status").upsert(
      {
        server_id: server.id,
        outline_api_status: "healthy",
        last_checked_at: nowIso(),
        last_success_at: nowIso(),
        last_error: null,
        response_ms: responseMs,
        active_key_count_seen: activeKeyCountSeen,
        consecutive_failures: 0,
        updated_at: nowIso(),
      },
      { onConflict: "server_id" }
    );

    if (error) throw error;

    return {
      server_id: server.id,
      status: "healthy",
      response_ms: responseMs,
      active_key_count_seen: activeKeyCountSeen,
    };
  } catch (error) {
    await recordServerHealthFailure(server.id, error);
    return {
      server_id: server.id,
      status: "failed",
      error: safeErrorMessage(error),
      response_ms: Date.now() - startedAt,
    };
  }
}

export async function checkAllOutlineServerHealth() {
  await markJobStarted("outline_health_check");

  try {
    const { data: servers, error } = await supabase
      .from("vpn_servers")
      .select("id, name, status, outline_api_url, outline_cert_sha256")
      .eq("status", "active")
      .not("outline_api_url", "is", null);

    if (error) throw error;

    const results = [];
    for (const server of servers || []) {
      results.push(await checkOutlineServerHealth(server));
    }

    const failed = results.filter((result) => result.status === "failed");
    if (failed.length) {
      throw new Error(`${failed.length} Outline server health check(s) failed`);
    }

    await markJobSuccess("outline_health_check");
    return results;
  } catch (error) {
    await markJobFailure("outline_health_check", error);
    throw error;
  }
}

async function getPm2Snapshot() {
  if (!process.env.pm_id && !process.env.PM2_HOME) {
    return { available: false, reason: "not_running_under_pm2" };
  }

  try {
    const { stdout } = await execFileAsync("pm2", ["jlist"], {
      timeout: 1500,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const rows = JSON.parse(stdout || "[]");
    const currentName = process.env.name || process.env.pm_exec_path || null;
    const currentPmId = process.env.pm_id;
    const current =
      rows.find((row) => String(row.pm_id) === String(currentPmId)) ||
      rows.find((row) => row.name === currentName) ||
      null;

    return {
      available: true,
      current: current
        ? {
            name: current.name,
            pm_id: current.pm_id,
            status: current.pm2_env?.status || "unknown",
            restart_time: current.pm2_env?.restart_time ?? null,
            unstable_restarts: current.pm2_env?.unstable_restarts ?? null,
            uptime: current.pm2_env?.pm_uptime ?? null,
            memory_bytes: current.monit?.memory ?? null,
            cpu_percent: current.monit?.cpu ?? null,
          }
        : null,
      processes: rows.map((row) => ({
        name: row.name,
        pm_id: row.pm_id,
        status: row.pm2_env?.status || "unknown",
        restart_time: row.pm2_env?.restart_time ?? null,
        memory_bytes: row.monit?.memory ?? null,
        cpu_percent: row.monit?.cpu ?? null,
      })),
    };
  } catch (error) {
    return {
      available: false,
      reason: safeErrorMessage(error),
    };
  }
}

function summarizeRuntime() {
  const memory = process.memoryUsage();

  return {
    status: "online",
    pid: process.pid,
    node_env: process.env.NODE_ENV || null,
    app_env: process.env.APP_ENV || null,
    node_version: process.version,
    uptime_seconds: Math.round(process.uptime()),
    started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    memory: {
      rss_bytes: memory.rss,
      heap_used_bytes: memory.heapUsed,
      heap_total_bytes: memory.heapTotal,
      external_bytes: memory.external,
    },
  };
}

function ageMs(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Date.now() - time;
}

function normalizeHealthRow(row, thresholds) {
  const health = Array.isArray(row.server_health_status)
    ? row.server_health_status[0] || null
    : row.server_health_status || null;
  const usageAge = ageMs(health?.last_usage_sync_at);
  const checkAge = ageMs(health?.last_checked_at);
  const staleUsage = usageAge > thresholds.usageSyncStaleMs;
  const staleHealth = checkAge > thresholds.healthCheckStaleMs;
  let computedStatus = health?.outline_api_status || "unknown";

  if (row.status === "active" && computedStatus === "healthy" && staleHealth) {
    computedStatus = "stale";
  }

  if (row.status === "active" && computedStatus === "unknown" && staleHealth) {
    computedStatus = "stale";
  }

  return {
    id: row.id,
    name: row.name,
    region: row.region,
    server_tier: row.server_tier,
    status: row.status,
    current_active_keys: toNumber(row.current_active_keys, 0),
    max_active_keys: toNumber(row.max_active_keys, 0),
    last_error: row.last_error || null,
    health: {
      outline_api_status: computedStatus,
      last_checked_at: health?.last_checked_at || null,
      last_success_at: health?.last_success_at || null,
      last_usage_sync_at: health?.last_usage_sync_at || null,
      last_error: health?.last_error || null,
      response_ms: health?.response_ms ?? null,
      active_key_count_seen: health?.active_key_count_seen ?? null,
      consecutive_failures: toNumber(health?.consecutive_failures, 0),
      usage_sync_stale: row.status === "active" && staleUsage,
      health_check_stale: row.status === "active" && staleHealth,
    },
  };
}

function normalizeJob(row, thresholds) {
  const lastSuccessAge = ageMs(row.last_success_at);
  const stale =
    row.job_name === "usage_sync" && lastSuccessAge > thresholds.usageSyncStaleMs;

  return {
    job_name: row.job_name,
    status: stale && row.status === "success" ? "stale" : row.status,
    last_started_at: row.last_started_at,
    last_finished_at: row.last_finished_at,
    last_success_at: row.last_success_at,
    last_error: row.last_error,
    consecutive_failures: toNumber(row.consecutive_failures, 0),
    run_count: toNumber(row.run_count, 0),
    updated_at: row.updated_at,
    stale,
  };
}

function buildAlerts({ jobs, servers, pm2 }) {
  const alerts = [];
  const usageJob = jobs.find((job) => job.job_name === "usage_sync");

  if (!usageJob) {
    alerts.push({
      severity: "warning",
      code: "USAGE_SYNC_NOT_SEEN",
      title: "Usage sync has not reported yet",
      detail: "No usage_sync job state exists. Run the backend after migration 0009.",
    });
  } else if (usageJob.status === "failed") {
    alerts.push({
      severity: "destructive",
      code: "USAGE_SYNC_FAILED",
      title: "Usage sync failed",
      detail: usageJob.last_error || "The latest usage sync run failed.",
    });
  } else if (usageJob.stale) {
    alerts.push({
      severity: "warning",
      code: "USAGE_SYNC_STALE",
      title: "Usage sync is stale",
      detail: "No successful usage sync has been recorded within the expected window.",
    });
  }

  for (const server of servers) {
    if (server.health.outline_api_status === "failed") {
      alerts.push({
        severity: "destructive",
        code: "OUTLINE_API_FAILED",
        title: `${server.name} Outline API failed`,
        detail: server.health.last_error || "Outline API did not respond successfully.",
        server_id: server.id,
      });
    } else if (server.health.health_check_stale) {
      alerts.push({
        severity: "warning",
        code: "OUTLINE_API_STALE",
        title: `${server.name} health check is stale`,
        detail: "No recent Outline API health check has completed.",
        server_id: server.id,
      });
    }

    if (server.health.usage_sync_stale) {
      alerts.push({
        severity: "warning",
        code: "SERVER_USAGE_SYNC_STALE",
        title: `${server.name} usage sync is stale`,
        detail: "This server has no recent successful usage sync timestamp.",
        server_id: server.id,
      });
    }
  }

  if (pm2.available && pm2.current?.status && pm2.current.status !== "online") {
    alerts.push({
      severity: "destructive",
      code: "PM2_PROCESS_NOT_ONLINE",
      title: "Backend PM2 process is not online",
      detail: `PM2 reports ${pm2.current.status}.`,
    });
  }

  return alerts;
}

export async function getBackendHealthSnapshot() {
  const thresholds = {
    usageSyncStaleMs: envMs("USAGE_SYNC_STALE_MS", DEFAULT_USAGE_SYNC_STALE_MS),
    healthCheckStaleMs: envMs("SERVER_HEALTH_STALE_MS", DEFAULT_HEALTH_CHECK_STALE_MS),
  };

  const [jobsResult, serversResult, pm2] = await Promise.all([
    supabase.from("system_job_runs").select("*").order("job_name", { ascending: true }),
    supabase
      .from("vpn_servers")
      .select(
        `
        id,
        name,
        region,
        server_tier,
        status,
        current_active_keys,
        max_active_keys,
        last_error,
        server_health_status (
          outline_api_status,
          last_checked_at,
          last_success_at,
          last_usage_sync_at,
          last_error,
          response_ms,
          active_key_count_seen,
          consecutive_failures,
          updated_at
        )
      `
      )
      .order("server_tier", { ascending: true })
      .order("region", { ascending: true }),
    getPm2Snapshot(),
  ]);

  if (isMissingHealthTable(jobsResult.error) || isMissingHealthTable(serversResult.error)) {
    return {
      missing_table: true,
      runtime: summarizeRuntime(),
      pm2,
      jobs: [],
      servers: [],
      alerts: [
        {
          severity: "warning",
          code: "HEALTH_MIGRATION_MISSING",
          title: "Backend health migration missing",
          detail: "Run migration 0009_backend_health_monitoring.sql.",
        },
      ],
      thresholds_ms: thresholds,
    };
  }

  if (jobsResult.error) throw jobsResult.error;
  if (serversResult.error) throw serversResult.error;

  const jobs = (jobsResult.data || []).map((row) => normalizeJob(row, thresholds));
  const servers = (serversResult.data || []).map((row) => normalizeHealthRow(row, thresholds));
  const alerts = buildAlerts({ jobs, servers, pm2 });

  return {
    missing_table: false,
    runtime: summarizeRuntime(),
    pm2,
    jobs,
    servers,
    alerts,
    thresholds_ms: thresholds,
  };
}
