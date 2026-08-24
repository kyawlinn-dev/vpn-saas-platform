import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock3,
  Cpu,
  Eye,
  MousePointer2,
  PackageCheck,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type {
  BackendHealthSnapshot,
  MonitoringEvent,
  MonitoringEventsResponse,
  MonitoringJourneyResponse,
  MonitoringSnapshot,
  ScreenshotBacklogResponse,
} from '@/types/api';

const EVENT_LABELS: Record<string, string> = {
  miniapp_config_loaded: 'Config Loaded',
  miniapp_authenticated: 'Authenticated',
  packages_viewed: 'Packages Viewed',
  order_submitted: 'Order Submitted',
  payment_screenshot_uploaded: 'Screenshot Uploaded',
  server_page_viewed: 'Servers Viewed',
  server_selected: 'Server Selected',
  server_select_blocked: 'Server Blocked',
  trial_created: 'Trial Created',
  key_provisioned: 'Key Provisioned',
};

function eventLabel(name: string) {
  return EVENT_LABELS[name] || name.replace(/_/g, ' ');
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function eventPerson(event: MonitoringEvent) {
  if (event.customer?.full_name) return event.customer.full_name;
  if (event.reseller?.name) return event.reseller.name;
  if (event.telegram_user_id) return `Telegram ${event.telegram_user_id}`;
  return event.actor_type || 'system';
}

function statusVariant(status: string): 'success' | 'warning' | 'destructive' | 'info' | 'default' {
  if (status === 'success') return 'success';
  if (status === 'blocked') return 'warning';
  if (status === 'failed') return 'destructive';
  if (status === 'info') return 'info';
  return 'default';
}

function eventDetail(event: MonitoringEvent) {
  return event.server?.name || event.plan?.name || event.page || event.route || '-';
}

function shortSession(sessionId?: string | null) {
  if (!sessionId) return 'No session';
  return sessionId.length > 12 ? `...${sessionId.slice(-8)}` : sessionId;
}

function formatDuration(seconds?: number | null) {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return '-';
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

function formatBytes(bytes?: number | null) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '-';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

function healthVariant(status?: string | null): 'success' | 'warning' | 'destructive' | 'info' | 'default' {
  if (status === 'healthy' || status === 'success' || status === 'online') return 'success';
  if (status === 'stale' || status === 'degraded' || status === 'running') return 'warning';
  if (status === 'failed' || status === 'error' || status === 'offline') return 'destructive';
  if (status === 'unknown') return 'info';
  return 'default';
}

function journeyKey(event: MonitoringEvent) {
  if (event.session_id) return `session:${event.session_id}`;
  if (event.customer_id) return `customer:${event.customer_id}`;
  if (event.telegram_user_id) return `telegram:${event.telegram_user_id}`;
  return `event:${event.id}`;
}

function journeyScopeLabel(event?: MonitoringEvent) {
  if (!event) return 'Select an event';
  if (event.session_id) return `Session ${shortSession(event.session_id)}`;
  if (event.customer?.full_name) return event.customer.full_name;
  if (event.telegram_user_id) return `Telegram ${event.telegram_user_id}`;
  return event.actor_type || 'Unknown actor';
}

function journeyParams(event: MonitoringEvent) {
  if (event.session_id) return { session_id: event.session_id };
  if (event.customer_id) return { customer_id: event.customer_id };
  if (event.telegram_user_id) return { telegram_user_id: event.telegram_user_id };
  return null;
}

export function MonitoringPage() {
  const [days, setDays] = useState(7);
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [eventPage, setEventPage] = useState(1);
  const [events, setEvents] = useState<MonitoringEvent[]>([]);
  const [eventTotal, setEventTotal] = useState(0);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<MonitoringEvent | null>(null);
  const [journeyEvents, setJourneyEvents] = useState<MonitoringEvent[]>([]);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [health, setHealth] = useState<BackendHealthSnapshot | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');
  const [backlog, setBacklog] = useState<ScreenshotBacklogResponse | null>(null);
  const [showDecommissioned, setShowDecommissioned] = useState(false);
  const eventLimit = 25;

  useEffect(() => {
    setLoading(true);
    setError('');
    setHealthLoading(true);
    setHealthError('');

    Promise.all([
      api.get<MonitoringSnapshot>('/admin/monitoring/summary', { params: { days } }),
      api.get<BackendHealthSnapshot>('/admin/monitoring/health'),
      api.get<ScreenshotBacklogResponse>('/admin/monitoring/screenshot-backlog').catch(() => ({ data: { data: [], total: 0 } })),
    ])
      .then(([snapshotRes, healthRes, backlogRes]) => {
        setSnapshot(snapshotRes.data);
        setHealth(healthRes.data);
        setBacklog(backlogRes.data);
      })
      .catch((err: any) => {
        const message = err?.response?.data?.error || err.message || 'Failed to load monitoring';
        setError(message);
        setHealthError(message);
      })
      .finally(() => {
        setLoading(false);
        setHealthLoading(false);
      });
  }, [days]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setEventPage(1);
  }, [days, debouncedSearch, eventFilter, statusFilter]);

  useEffect(() => {
    setEventsLoading(true);
    setEventsError('');
    api
      .get<MonitoringEventsResponse>('/admin/monitoring/events', {
        params: {
          days,
          page: eventPage,
          limit: eventLimit,
          event_name: eventFilter === 'all' ? undefined : eventFilter,
          status: statusFilter === 'all' ? undefined : statusFilter,
          search: debouncedSearch || undefined,
        },
      })
      .then((res) => {
        setEvents(res.data.data);
        setEventTotal(res.data.total);
      })
      .catch((err: any) => setEventsError(err?.response?.data?.error || err.message || 'Failed to load monitoring events'))
      .finally(() => setEventsLoading(false));
  }, [days, debouncedSearch, eventFilter, eventPage, statusFilter]);

  const dailyRows = useMemo(
    () => (snapshot?.daily || []).map((row) => ({ ...row, label: shortDate(row.date) })),
    [snapshot?.daily],
  );

  const eventOptions = useMemo(() => Object.keys(EVENT_LABELS).sort((a, b) => eventLabel(a).localeCompare(eventLabel(b))), []);
  const statusOptions = ['info', 'success', 'blocked', 'failed'];

  useEffect(() => {
    if (!events.length) {
      setSelectedEvent(null);
      return;
    }

    if (selectedEvent && events.some((event) => event.id === selectedEvent.id)) return;
    setSelectedEvent(events[0]);
  }, [events, selectedEvent]);

  useEffect(() => {
    const params = selectedEvent ? journeyParams(selectedEvent) : null;
    if (!params) {
      setJourneyEvents([]);
      return;
    }

    setJourneyLoading(true);
    api
      .get<MonitoringJourneyResponse>('/admin/monitoring/journey', { params: { days, ...params } })
      .then((res) => setJourneyEvents(res.data.data))
      .catch(() => setJourneyEvents([]))
      .finally(() => setJourneyLoading(false));
  }, [days, selectedEvent]);

  const activeJourneyKey = selectedEvent ? journeyKey(selectedEvent) : '';
  const journeyLead = journeyEvents[journeyEvents.length - 1] || selectedEvent || events[0];
  const eventTotalPages = Math.max(1, Math.ceil(eventTotal / eventLimit));

  const summary = snapshot?.summary;
  const kpis = snapshot?.kpis;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Monitoring</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Mini App traffic, checkout flow, server selection, and provisioning health.
          </p>
        </div>
        <div className="w-full md:w-36">
          <Input
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(event) => setDays(Number(event.target.value || 7))}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {snapshot?.missing_table && (
        <div className="rounded-md border border-warning/25 bg-warning/10 px-4 py-2 text-sm text-warning">
          Run migrations 0007 and 0008 locally to enable event storage and monitoring summaries.
        </div>
      )}

      {health?.missing_table && (
        <div className="rounded-md border border-warning/25 bg-warning/10 px-4 py-2 text-sm text-warning">
          Run migration 0009 locally to enable backend health monitoring.
        </div>
      )}

      {loading && !snapshot ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : (
        <>
          {/* 6 focused KPI tiles — "is money flowing? is anything broken?" */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <StatCard
              label="New Customers Today"
              value={kpis?.new_customers_today ?? 0}
              accent="info"
              icon={<Users size={16} />}
            />
            <StatCard
              label="Orders Today"
              value={kpis?.orders_submitted_today ?? 0}
              accent="success"
              icon={<ShieldCheck size={16} />}
            />
            <StatCard
              label="Keys Provisioned Today"
              value={kpis?.keys_provisioned_today ?? 0}
              accent="success"
              icon={<Server size={16} />}
            />
            <StatCard
              label="Failure Rate (24h)"
              value={kpis ? `${kpis.failure_rate_24h_pct}%` : '-'}
              accent={
                !kpis || kpis.provisioning_sample_size_24h === 0
                  ? 'default'
                  : kpis.failure_rate_24h_pct > 10
                    ? 'destructive'
                    : kpis.failure_rate_24h_pct > 0
                      ? 'warning'
                      : 'success'
              }
              icon={<AlertTriangle size={16} />}
            />
            <StatCard
              label="Median Provision Time"
              value={
                kpis?.median_provision_ms_24h == null
                  ? '-'
                  : kpis.median_provision_ms_24h < 60_000
                    ? `${Math.round(kpis.median_provision_ms_24h / 1000)}s`
                    : `${Math.round(kpis.median_provision_ms_24h / 60_000)}m`
              }
              icon={<Clock3 size={16} />}
            />
            <StatCard
              label="Unhealthy Servers"
              value={kpis?.unhealthy_server_count ?? 0}
              accent={kpis?.unhealthy_server_count ? 'destructive' : 'success'}
              icon={<Server size={16} />}
            />
          </div>

          {/* Screenshot backlog — customers waiting past N minutes for their key */}
          {backlog && backlog.total > 0 && (
            <Card>
              <div className="border-b border-border px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-foreground">Screenshot Backlog</h2>
                    <p className="text-xs text-muted-foreground">
                      Customers whose payment screenshot uploaded &gt;15m ago has no matching key provisioned.
                    </p>
                  </div>
                  <Badge variant={backlog.total > 5 ? 'destructive' : 'warning'}>
                    {backlog.total} waiting
                  </Badge>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Customer</TableHead>
                    <TableHead>Reseller</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Waiting</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backlog.data.map((row) => (
                    <TableRow key={row.screenshot_event_id}>
                      <TableCell>
                        <p className="font-medium text-foreground">{row.customer_name || '—'}</p>
                        {row.customer_telegram && (
                          <p className="text-xs text-muted-foreground">@{row.customer_telegram}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.reseller_name || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.order_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.minutes_waiting > 60 ? 'destructive' : 'warning'}>
                          {row.minutes_waiting < 60
                            ? `${row.minutes_waiting}m`
                            : `${Math.floor(row.minutes_waiting / 60)}h ${row.minutes_waiting % 60}m`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          <Card>
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="font-semibold text-foreground">Backend Health</h2>
                  <p className="text-xs text-muted-foreground">
                    PM2/runtime, usage-sync freshness, and Outline API health per server.
                  </p>
                </div>
                {healthLoading ? <Badge variant="outline">loading</Badge> : <Badge variant={health?.alerts.length ? 'warning' : 'success'}>{health?.alerts.length || 0} alerts</Badge>}
              </div>
            </div>

            {healthError && (
              <div className="border-b border-border px-5 py-3 text-sm text-destructive">
                {healthError}
              </div>
            )}

            {health?.alerts?.length ? (
              <div className="space-y-2 border-b border-border px-5 py-4">
                {health.alerts.map((alert) => (
                  <div
                    key={`${alert.code}-${alert.server_id || 'system'}`}
                    className={cn(
                      'rounded-xl border px-3 py-2',
                      alert.severity === 'destructive'
                        ? 'border-destructive/25 bg-destructive/10 text-destructive'
                        : 'border-warning/25 bg-warning/10 text-warning',
                    )}
                  >
                    <p className="font-medium">{alert.title}</p>
                    <p className="text-xs opacity-80">{alert.detail}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 p-5 lg:grid-cols-4">
              <StatCard
                label="Backend"
                value={health?.runtime.status || '-'}
                accent={health?.runtime.status === 'online' ? 'success' : 'warning'}
                icon={<Cpu size={16} />}
              />
              <StatCard
                label="Uptime"
                value={formatDuration(health?.runtime.uptime_seconds)}
                icon={<Clock3 size={16} />}
              />
              <StatCard
                label="Memory"
                value={formatBytes(health?.runtime.memory.rss_bytes)}
                icon={<Activity size={16} />}
              />
              <StatCard
                label="PM2"
                value={health?.pm2.available ? health.pm2.current?.status || 'available' : 'local'}
                accent={health?.pm2.current?.status === 'online' ? 'success' : health?.pm2.available ? 'warning' : 'info'}
                icon={<RefreshCw size={16} />}
              />
            </div>

            <div className="px-5 pb-5">
              <div className="rounded-xl border border-border">
                <div className="border-b border-border px-4 py-3">
                  <h3 className="font-medium text-foreground">Jobs</h3>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Job</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last success</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(health?.jobs || []).map((job) => (
                      <TableRow key={job.job_name}>
                        <TableCell>
                          <p className="font-medium text-foreground">{job.job_name.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-muted-foreground">{job.run_count} runs, {job.consecutive_failures} failures</p>
                        </TableCell>
                        <TableCell><Badge variant={healthVariant(job.status)}>{job.status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {job.last_success_at ? formatDateTime(job.last_success_at) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!health?.jobs?.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                          No job runs recorded yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-foreground">Daily Activity</h2>
                  <p className="text-xs text-muted-foreground">Last {snapshot?.period.days ?? days} days</p>
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyRows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Bar dataKey="unique_miniapp_opens" name="Unique Opens" stackId="a" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="order_submitted" name="Orders" stackId="a" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="failures" name="Failures" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="font-semibold text-foreground">Checkout Funnel</h2>
              <p className="mb-4 text-xs text-muted-foreground">Backend-observed customer flow</p>
              <div className="space-y-2">
                {(snapshot?.funnel || []).map((item) => (
                  <div key={item.event_name} className="flex items-center justify-between rounded-lg border border-border bg-secondary/25 px-3 py-2">
                    <span className="text-sm text-foreground">{eventLabel(item.event_name)}</span>
                    <Badge variant="outline">{item.count}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="font-semibold text-foreground">Servers</h2>
                  <p className="text-xs text-muted-foreground">
                    Backend status, Outline API health, usage-sync freshness, and capacity in one place.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={showDecommissioned}
                    onChange={(e) => setShowDecommissioned(e.target.checked)}
                  />
                  Show decommissioned
                </label>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Server</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Backend</TableHead>
                  <TableHead>Outline API</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead>Keys</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(snapshot?.server_health || [])
                  .filter((server) => showDecommissioned || server.status !== 'decommissioned')
                  .map((server) => (
                    <TableRow key={server.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">{server.name}</p>
                        <p className="text-xs text-muted-foreground">{server.region}</p>
                      </TableCell>
                      <TableCell><Badge variant="outline">{server.server_tier}</Badge></TableCell>
                      <TableCell>
                        <StatusBadge status={server.last_error ? 'failed' : server.status} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={healthVariant(server.health?.outline_api_status || 'unknown')}>
                          {server.health?.outline_api_status || 'unknown'}
                        </Badge>
                        {server.health?.response_ms != null && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{server.health.response_ms}ms</p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {server.health?.last_usage_sync_at
                          ? formatDateTime(server.health.last_usage_sync_at)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {server.current_active_keys}/{server.max_active_keys}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-4">
              <Card>
                <div className="border-b border-border px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="font-semibold text-foreground">Recent Events</h2>
                      <p className="text-xs text-muted-foreground">Paginated backend event log with session-aware journey drill-down.</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSearch('');
                        setEventFilter('all');
                        setStatusFilter('all');
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_180px_150px]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search event, page, route, session..."
                        className="pl-9"
                      />
                    </div>
                    <Select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}>
                      <option value="all">All events</option>
                      {eventOptions.map((eventName) => (
                        <option key={eventName} value={eventName}>{eventLabel(eventName)}</option>
                      ))}
                    </Select>
                    <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                      <option value="all">All status</option>
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </Select>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Event</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Session</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => {
                      const selected = journeyKey(event) === activeJourneyKey;
                      return (
                        <TableRow
                          key={event.id}
                          className={cn('cursor-pointer', selected && 'bg-primary/10 hover:bg-primary/15')}
                          onClick={() => setSelectedEvent(event)}
                        >
                          <TableCell>
                            <p className="font-medium text-foreground">{eventLabel(event.event_name)}</p>
                            <p className="text-xs text-muted-foreground">{eventDetail(event)}</p>
                          </TableCell>
                          <TableCell>{eventPerson(event)}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{shortSession(event.session_id)}</TableCell>
                          <TableCell><Badge variant={statusVariant(event.status)}>{event.status}</Badge></TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{formatDateTime(event.created_at)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {!eventsLoading && events.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          No events match the current filters.
                        </TableCell>
                      </TableRow>
                    )}
                    {eventsLoading && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          Loading events...
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {eventsError && (
                  <div className="border-t border-border px-5 py-3 text-sm text-destructive">
                    {eventsError}
                  </div>
                )}
                <Pagination
                  page={eventPage}
                  totalPages={eventTotalPages}
                  total={eventTotal}
                  label="events"
                  onPageChange={setEventPage}
                  loading={eventsLoading}
                />
              </Card>

              <Card className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-foreground">Customer Journey</h2>
                    <p className="text-xs text-muted-foreground">{journeyScopeLabel(journeyLead)}</p>
                  </div>
                  <Badge variant="outline">{journeyEvents.length} events</Badge>
                </div>
                {journeyLoading ? (
                  <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Loading journey...
                  </div>
                ) : journeyEvents.length > 0 ? (
                  <div className="space-y-3">
                    {journeyEvents.map((event) => (
                      <div key={event.id} className="grid gap-3 rounded-xl border border-border bg-secondary/20 p-3 md:grid-cols-[170px_1fr_auto]">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock3 className="h-4 w-4" />
                          {formatDateTime(event.created_at)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{eventLabel(event.event_name)}</p>
                          <p className="text-xs text-muted-foreground">
                            {eventPerson(event)} - {eventDetail(event)}
                          </p>
                        </div>
                        <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Select a recent event to inspect its timeline.
                  </div>
                )}
              </Card>
          </div>
        </>
      )}
    </div>
  );
}
