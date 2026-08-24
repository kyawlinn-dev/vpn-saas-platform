import { supabase } from "../lib/supabase.js";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_JOURNEY_EVENTS = 200;

const FUNNEL_EVENTS = [
  "miniapp_authenticated",
  "packages_viewed",
  "order_submitted",
  "payment_screenshot_uploaded",
  "server_page_viewed",
  "server_selected",
  "server_select_blocked",
  "trial_created",
  "key_provisioned",
];

const EVENT_SELECT = `
  id,
  event_name,
  actor_type,
  reseller_id,
  customer_id,
  admin_id,
  telegram_user_id,
  order_id,
  payment_id,
  session_id,
  server_id,
  plan_id,
  page,
  route,
  status,
  metadata,
  created_at,
  reseller:resellers(id, name),
  customer:vpn_customers(id, full_name, telegram_username, customer_type),
  server:vpn_servers(id, name, region, server_tier),
  plan:vpn_plans(id, name)
`;

function clampDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAYS;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_DAYS);
}

function clampPage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_LIMIT);
}

function periodFromDays(rawDays) {
  const days = clampDays(rawDays);
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const end = new Date();
  return { days, start, end };
}

function emptySummary() {
  return {
    raw_events: 0,
    total_events: 0,
    unique_customers: 0,
    unique_telegram_users: 0,
    unique_miniapp_opens: 0,
    miniapp_opens: 0,
    miniapp_config_loads: 0,
    packages_viewed: 0,
    server_page_views: 0,
    server_selected: 0,
    server_blocked: 0,
    order_submitted: 0,
    screenshots_uploaded: 0,
    trials_created: 0,
    keys_provisioned: 0,
    failures: 0,
  };
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSummary(row) {
  const summary = emptySummary();
  if (!row) return summary;

  for (const key of Object.keys(summary)) {
    summary[key] = toNumber(row[key]);
  }
  return summary;
}

function normalizeFunnel(rows) {
  const counts = new Map((rows || []).map((row) => [row.event_name, toNumber(row.count)]));
  return FUNNEL_EVENTS.map((eventName) => ({
    event_name: eventName,
    count: counts.get(eventName) || 0,
  }));
}

function normalizeDaily(rows) {
  return (rows || []).map((row) => ({
    date: row.date,
    total: toNumber(row.total),
    raw_events: toNumber(row.raw_events),
    miniapp_config_loads: toNumber(row.miniapp_config_loads),
    unique_miniapp_opens: toNumber(row.unique_miniapp_opens),
    packages_viewed: toNumber(row.packages_viewed),
    order_submitted: toNumber(row.order_submitted),
    server_selected: toNumber(row.server_selected),
    failures: toNumber(row.failures),
  }));
}

function normalizeServerEvents(rows) {
  return (rows || []).map((row) => ({
    server_id: row.server_id,
    server_name: row.server_name,
    region: row.region,
    server_tier: row.server_tier,
    selected: toNumber(row.selected),
    key_provisioned: toNumber(row.key_provisioned),
    blocked: toNumber(row.blocked),
    failed: toNumber(row.failed),
  }));
}

function publicEvent(event) {
  return {
    id: event.id,
    event_name: event.event_name,
    actor_type: event.actor_type,
    reseller_id: event.reseller_id,
    customer_id: event.customer_id,
    telegram_user_id: event.telegram_user_id,
    order_id: event.order_id,
    payment_id: event.payment_id,
    session_id: event.session_id,
    server_id: event.server_id,
    plan_id: event.plan_id,
    page: event.page,
    route: event.route,
    status: event.status,
    metadata: event.metadata || {},
    created_at: event.created_at,
    reseller: event.reseller || null,
    customer: event.customer || null,
    server: event.server || null,
    plan: event.plan || null,
  };
}

function isMissingMonitoringObject(error) {
  return error?.code === "42P01" || error?.code === "42883" || /app_events|admin_monitoring_/i.test(error?.message || "");
}

async function rpcRows(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (isMissingMonitoringObject(error)) return { rows: [], missingTable: true };
    throw error;
  }
  return { rows: data || [], missingTable: false };
}

async function fetchMonitoringAggregates({ start, end, resellerId }) {
  const args = {
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_reseller_id: resellerId,
  };

  const [summary, funnel, daily, serverEvents] = await Promise.all([
    rpcRows("admin_monitoring_summary", args),
    rpcRows("admin_monitoring_funnel", args),
    rpcRows("admin_monitoring_daily", args),
    rpcRows("admin_monitoring_server_events", args),
  ]);

  const missingTable = summary.missingTable || funnel.missingTable || daily.missingTable || serverEvents.missingTable;

  return {
    missingTable,
    summary: normalizeSummary(summary.rows[0]),
    funnel: normalizeFunnel(funnel.rows),
    daily: normalizeDaily(daily.rows),
    serverEvents: normalizeServerEvents(serverEvents.rows),
  };
}

async function fetchServerHealth() {
  const { data, error } = await supabase
    .from("vpn_servers")
    .select(
      "id, name, region, status, server_tier, current_active_keys, max_active_keys, last_error, server_health_status(outline_api_status, last_checked_at, last_success_at, last_usage_sync_at, response_ms, consecutive_failures, last_error)"
    )
    .order("server_tier", { ascending: true })
    .order("region", { ascending: true });

  if (error) throw error;

  return (data || []).map((server) => {
    const health = Array.isArray(server.server_health_status)
      ? server.server_health_status[0] || null
      : server.server_health_status || null;
    return {
      ...server,
      server_health_status: undefined, // pull it out to a flat field for the UI
      health,
      remaining_capacity:
        Number(server.max_active_keys || 0) - Number(server.current_active_keys || 0),
    };
  });
}

// KPI queries for the redesigned monitoring page top tiles.
// All time-scoped queries use the last 24h window ending "now".
async function fetchTodayKpis({ resellerId }) {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartIso = dayStart.toISOString();
  const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  function scoped(query, iso) {
    let q = query.gte("created_at", iso);
    if (resellerId) q = q.eq("reseller_id", resellerId);
    return q;
  }

  // 1) new customers today (distinct customer_id on authenticated events)
  const newCustomersQuery = scoped(
    supabase
      .from("app_events")
      .select("customer_id", { count: "exact", head: false })
      .eq("event_name", "miniapp_authenticated")
      .eq("status", "success")
      .not("customer_id", "is", null),
    dayStartIso
  );

  // 2) orders submitted today
  const ordersTodayQuery = scoped(
    supabase
      .from("app_events")
      .select("id", { count: "exact", head: true })
      .eq("event_name", "order_submitted"),
    dayStartIso
  );

  // 3) keys provisioned today (success only)
  const keysTodayQuery = scoped(
    supabase
      .from("app_events")
      .select("id", { count: "exact", head: true })
      .eq("event_name", "key_provisioned")
      .eq("status", "success"),
    dayStartIso
  );

  // 4/5) provisioning outcomes in last 24h (for failure rate + median time)
  const provisionEventsQuery = scoped(
    supabase
      .from("app_events")
      .select("status, created_at, order_id")
      .eq("event_name", "key_provisioned"),
    dayAgoIso
  );

  // Fetch matching order_submitted rows separately so we can compute time-to-provision.
  const orderSubmittedRecentQuery = scoped(
    supabase
      .from("app_events")
      .select("order_id, created_at")
      .eq("event_name", "order_submitted")
      .not("order_id", "is", null),
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  );

  const [newCust, ordersToday, keysToday, provisionEvents, orderSubmittedRecent] = await Promise.all([
    newCustomersQuery,
    ordersTodayQuery,
    keysTodayQuery,
    provisionEventsQuery,
    orderSubmittedRecentQuery,
  ]);

  // dedupe new customer ids
  const uniqueCustomerIds = new Set(
    (newCust.data || [])
      .map((row) => row.customer_id)
      .filter(Boolean)
  );

  const provisionRows = provisionEvents.data || [];
  const successCount = provisionRows.filter((r) => r.status === "success").length;
  const failedCount = provisionRows.filter((r) => r.status === "failed").length;
  const totalProvisionAttempts = successCount + failedCount;
  const failureRate24h = totalProvisionAttempts === 0
    ? 0
    : Math.round((failedCount / totalProvisionAttempts) * 1000) / 10; // 1 decimal %

  // median time from order_submitted -> successful key_provisioned (24h window on provision)
  const orderSubmittedByOrderId = new Map();
  for (const row of orderSubmittedRecent.data || []) {
    if (row.order_id && !orderSubmittedByOrderId.has(row.order_id)) {
      orderSubmittedByOrderId.set(row.order_id, new Date(row.created_at).getTime());
    }
  }

  const durations = [];
  for (const row of provisionRows) {
    if (row.status !== "success" || !row.order_id) continue;
    const submittedAt = orderSubmittedByOrderId.get(row.order_id);
    if (!submittedAt) continue; // trial flows or older orders won't match
    const provisionedAt = new Date(row.created_at).getTime();
    const durationMs = provisionedAt - submittedAt;
    if (Number.isFinite(durationMs) && durationMs > 0) durations.push(durationMs);
  }

  durations.sort((a, b) => a - b);
  const medianProvisionMs = durations.length === 0
    ? null
    : durations.length % 2 === 1
      ? durations[(durations.length - 1) / 2]
      : Math.round((durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2);

  return {
    new_customers_today: uniqueCustomerIds.size,
    orders_submitted_today: ordersToday.count || 0,
    keys_provisioned_today: keysToday.count || 0,
    failure_rate_24h_pct: failureRate24h,
    median_provision_ms_24h: medianProvisionMs,
    provisioning_sample_size_24h: totalProvisionAttempts,
  };
}

// Screenshot backlog: payment_screenshot_uploaded > N minutes ago without a
// matching key_provisioned event on the same order_id. Surfaces customers
// waiting on manual review.
async function fetchScreenshotBacklog({ resellerId, minStaleMinutes = 15 }) {
  const staleBefore = new Date(Date.now() - minStaleMinutes * 60 * 1000).toISOString();
  const lookback = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let screenshotQuery = supabase
    .from("app_events")
    .select("id, order_id, reseller_id, customer_id, created_at, metadata, reseller:resellers(id, name), customer:vpn_customers(id, full_name, telegram_username)")
    .eq("event_name", "payment_screenshot_uploaded")
    .eq("status", "success")
    .lte("created_at", staleBefore)
    .gte("created_at", lookback)
    .not("order_id", "is", null)
    .order("created_at", { ascending: true });

  if (resellerId) screenshotQuery = screenshotQuery.eq("reseller_id", resellerId);

  const { data: screenshots, error: screenshotError } = await screenshotQuery;
  if (screenshotError) throw screenshotError;

  const screenshotRows = screenshots || [];
  if (screenshotRows.length === 0) return { data: [], total: 0 };

  const orderIds = [...new Set(screenshotRows.map((r) => r.order_id).filter(Boolean))];
  const { data: provisions, error: provisionError } = await supabase
    .from("app_events")
    .select("order_id, status, created_at")
    .in("order_id", orderIds)
    .eq("event_name", "key_provisioned")
    .eq("status", "success");
  if (provisionError) throw provisionError;

  const provisionedOrderIds = new Set((provisions || []).map((r) => r.order_id));
  const backlog = screenshotRows
    .filter((row) => !provisionedOrderIds.has(row.order_id))
    .map((row) => ({
      screenshot_event_id: row.id,
      order_id: row.order_id,
      reseller_id: row.reseller_id,
      reseller_name: row.reseller?.name || null,
      customer_id: row.customer_id,
      customer_name: row.customer?.full_name || null,
      customer_telegram: row.customer?.telegram_username || null,
      uploaded_at: row.created_at,
      minutes_waiting: Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000),
    }));

  return { data: backlog, total: backlog.length };
}

export async function getScreenshotBacklog(options) {
  try {
    return await fetchScreenshotBacklog(options || {});
  } catch (error) {
    if (isMissingMonitoringObject(error)) return { data: [], total: 0, missing_table: true };
    throw error;
  }
}

function applyEventFilters(query, { start, end, resellerId, eventName, status, search }) {
  let next = query.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());

  if (resellerId) next = next.eq("reseller_id", resellerId);
  if (eventName && eventName !== "all") next = next.eq("event_name", eventName);
  if (status && status !== "all") next = next.eq("status", status);

  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch) {
    const escaped = trimmedSearch
      .replace(/[^a-zA-Z0-9_:@.\-\s]/g, " ")
      .trim()
      .replace(/\s+/g, "%");
    if (escaped) {
      next = next.or(
        `event_name.ilike.%${escaped}%,page.ilike.%${escaped}%,route.ilike.%${escaped}%,session_id.ilike.%${escaped}%`
      );
    }
  }

  return next;
}

export async function getMonitoringSnapshot({ days: rawDays, resellerId = null }) {
  const { days, start, end } = periodFromDays(rawDays);
  const aggregates = await fetchMonitoringAggregates({ start, end, resellerId });
  const serverHealth = resellerId ? [] : await fetchServerHealth();

  // KPI tiles are always scoped to today / last 24h regardless of the `days`
  // window used by the funnel and event lists.
  let todayKpis = null;
  try {
    todayKpis = await fetchTodayKpis({ resellerId });
  } catch (err) {
    if (!isMissingMonitoringObject(err)) throw err;
  }

  // Count servers whose Outline API is currently failed. Only meaningful when
  // no reseller filter is active — server health is org-wide.
  const unhealthyServerCount = resellerId
    ? null
    : serverHealth.filter((s) => s.health?.outline_api_status === "failed").length;

  return {
    period: {
      days,
      start_iso: start.toISOString(),
      end_iso: end.toISOString(),
    },
    missing_table: aggregates.missingTable,
    summary: aggregates.summary,
    kpis: todayKpis ? { ...todayKpis, unhealthy_server_count: unhealthyServerCount } : null,
    funnel: aggregates.funnel,
    daily: aggregates.daily,
    server_events: aggregates.serverEvents,
    server_health: serverHealth,
    recent_events: [],
  };
}

export async function getMonitoringEvents({
  days: rawDays,
  resellerId = null,
  eventName = null,
  status = null,
  search = "",
  page: rawPage,
  limit: rawLimit,
}) {
  const { days, start, end } = periodFromDays(rawDays);
  const page = clampPage(rawPage);
  const limit = clampLimit(rawLimit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("app_events")
    .select(EVENT_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  query = applyEventFilters(query, { start, end, resellerId, eventName, status, search });

  const { data, error, count } = await query;
  if (error) {
    if (isMissingMonitoringObject(error)) {
      return {
        data: [],
        total: 0,
        page,
        limit,
        period: { days, start_iso: start.toISOString(), end_iso: end.toISOString() },
        missing_table: true,
      };
    }
    throw error;
  }

  return {
    data: (data || []).map(publicEvent),
    total: count || 0,
    page,
    limit,
    period: { days, start_iso: start.toISOString(), end_iso: end.toISOString() },
    missing_table: false,
  };
}

export async function getMonitoringJourney({
  days: rawDays,
  resellerId = null,
  sessionId = null,
  customerId = null,
  telegramUserId = null,
}) {
  const { days, start, end } = periodFromDays(rawDays);

  if (!sessionId && !customerId && !telegramUserId) {
    const error = new Error("session_id, customer_id, or telegram_user_id is required");
    error.status = 400;
    throw error;
  }

  let query = supabase
    .from("app_events")
    .select(EVENT_SELECT)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_JOURNEY_EVENTS);

  if (resellerId) query = query.eq("reseller_id", resellerId);
  if (sessionId) query = query.eq("session_id", sessionId);
  else if (customerId) query = query.eq("customer_id", customerId);
  else query = query.eq("telegram_user_id", telegramUserId);

  const { data, error } = await query;
  if (error) {
    if (isMissingMonitoringObject(error)) {
      return {
        data: [],
        total: 0,
        period: { days, start_iso: start.toISOString(), end_iso: end.toISOString() },
        missing_table: true,
      };
    }
    throw error;
  }

  return {
    data: (data || []).map(publicEvent),
    total: (data || []).length,
    period: { days, start_iso: start.toISOString(), end_iso: end.toISOString() },
    missing_table: false,
  };
}
