import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Copy,
  Database,
  Edit3,
  Eye,
  HardDrive,
  Loader2,
  MapPin,
  Network,
  Plus,
  Server as ServerIcon,
  Trash2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/action-menu';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Server } from '@/types/api';

const DO_REGIONS: { slug: string; label: string; country: string; code: string; area: string }[] = [
  { slug: 'sgp1', label: 'Singapore', country: 'Singapore', code: 'SG', area: 'Asia Pacific' },
  { slug: 'blr1', label: 'Bangalore', country: 'India', code: 'IN', area: 'Asia Pacific' },
  { slug: 'syd1', label: 'Sydney', country: 'Australia', code: 'AU', area: 'Asia Pacific' },
  { slug: 'nyc1', label: 'New York 1', country: 'United States', code: 'US', area: 'North America' },
  { slug: 'nyc3', label: 'New York 3', country: 'United States', code: 'US', area: 'North America' },
  { slug: 'sfo3', label: 'San Francisco', country: 'United States', code: 'US', area: 'North America' },
  { slug: 'tor1', label: 'Toronto', country: 'Canada', code: 'CA', area: 'North America' },
  { slug: 'lon1', label: 'London', country: 'United Kingdom', code: 'UK', area: 'Europe' },
  { slug: 'fra1', label: 'Frankfurt', country: 'Germany', code: 'DE', area: 'Europe' },
  { slug: 'ams3', label: 'Amsterdam', country: 'Netherlands', code: 'NL', area: 'Europe' },
];

function regionMeta(slug?: string | null) {
  return DO_REGIONS.find((region) => region.slug === slug) ?? null;
}

function regionLabel(slug?: string | null) {
  if (!slug) return 'Unknown region';
  return regionMeta(slug)?.label ?? slug;
}

function suggestName(region: string) {
  return region ? `${region}-${String(Date.now()).slice(-4)}` : '';
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function getUsagePercent(server: Server) {
  return server.max_active_keys > 0
    ? Math.min((server.current_active_keys / server.max_active_keys) * 100, 100)
    : 0;
}

function getCapacityTone(server: Server) {
  const pct = getUsagePercent(server);
  if (server.status === 'failed') return 'destructive';
  if (pct >= 90) return 'destructive';
  if (pct >= 70) return 'warning';
  return 'success';
}

function getServerTier(server: Server) {
  return server.server_tier === 'trial' ? 'trial' : 'premium';
}

function ServerTierBadge({ tier }: { tier?: string | null }) {
  const normalized = tier === 'trial' ? 'trial' : 'premium';
  return (
    <Badge variant={normalized === 'trial' ? 'warning' : 'info'}>
      {normalized === 'trial' ? 'Trial' : 'Premium'}
    </Badge>
  );
}

function copyValue(value?: string | number | null) {
  if (value === null || value === undefined || value === '') return;
  void navigator.clipboard?.writeText(String(value));
}

function computeRegionStats(servers: Server[]) {
  const map = new Map<string, { count: number; capacity: number; used: number }>();
  for (const server of servers) {
    if (server.status === 'decommissioned' || !server.region) continue;
    const current = map.get(server.region) ?? { count: 0, capacity: 0, used: 0 };
    current.count += 1;
    current.capacity += server.max_active_keys;
    current.used += server.current_active_keys;
    map.set(server.region, current);
  }
  return map;
}

function CapacityBar({ current, max, compact = false }: { current: number; max: number; compact?: boolean }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const tone = pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-warning' : 'bg-success';

  return (
    <div className={cn('space-y-1.5', compact ? 'min-w-28' : 'min-w-40')}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-foreground">{current} active</span>
        <span className="text-muted-foreground">{Math.max(max - current, 0)} free</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
      {!compact ? (
        <p className="text-xs text-muted-foreground">
          {Math.round(pct)}% used from {max} max keys
        </p>
      ) : null}
    </div>
  );
}

function ServerStatusBadge({ status }: { status: string }) {
  if (status === 'provisioning') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-info/30 bg-info/10 px-2.5 py-0.5 text-xs font-medium text-info">
        <Loader2 size={11} className="animate-spin" />
        Provisioning
      </span>
    );
  }
  if (status === 'decommissioned') {
    return <Badge variant="default" className="opacity-65">Decommissioned</Badge>;
  }
  if (status === 'failed') {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return <StatusBadge status={status} />;
}

function StatCard({
  label,
  value,
  helper,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
}) {
  const toneClass = {
    default: 'bg-secondary text-muted-foreground',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/12 text-warning',
    destructive: 'bg-destructive/12 text-destructive',
    info: 'bg-primary/12 text-primary',
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', toneClass)}>{icon}</div>
      </div>
    </Card>
  );
}

interface ProvisionDialogProps {
  servers: Server[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

function ProvisionDialog({ servers, onClose, onSuccess }: ProvisionDialogProps) {
  const [region, setRegion] = useState('');
  const [name, setName] = useState('');
  const [serverTier, setServerTier] = useState<'trial' | 'premium'>('premium');
  const [nameTouched, setNameTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const regionStats = computeRegionStats(servers);

  const handlePickRegion = (slug: string) => {
    setRegion(slug);
    if (!nameTouched) setName(suggestName(slug));
  };

  const handleSubmit = async () => {
    if (!region) {
      setError('Please select a region.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/admin/servers/provision', {
        region: region.trim(),
        name: name.trim() || undefined,
        server_tier: serverTier,
      });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message ?? 'Provisioning failed');
    } finally {
      setLoading(false);
    }
  };

  const areas = [...new Set(DO_REGIONS.map((item) => item.area))];

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>Provision New Server</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-5">
        {error ? (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Server tier</p>
            <div className="grid grid-cols-2 gap-2">
              {(['premium', 'trial'] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setServerTier(tier)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    serverTier === tier
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/25'
                      : 'border-border bg-secondary/30 hover:bg-secondary/60',
                  )}
                >
                  <p className="text-sm font-semibold text-foreground">{tier === 'trial' ? 'Trial' : 'Premium'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {tier === 'trial' ? 'Free users only' : 'Paid customers only'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {areas.map((area) => (
            <div key={area}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{area}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DO_REGIONS.filter((item) => item.area === area).map((item) => {
                  const stats = regionStats.get(item.slug);
                  const free = stats ? Math.max(stats.capacity - stats.used, 0) : null;
                  const pct = stats && stats.capacity > 0 ? (stats.used / stats.capacity) * 100 : 0;
                  const selected = region === item.slug;
                  const statusColor =
                    !stats ? 'text-muted-foreground' :
                    pct >= 90 ? 'text-destructive' :
                    pct >= 70 ? 'text-warning' : 'text-success';
                  const statusText =
                    !stats ? 'No servers' :
                    pct >= 90 ? 'Near full' :
                    pct >= 70 ? 'Getting full' : 'Available';

                  return (
                    <button
                      key={item.slug}
                      type="button"
                      onClick={() => handlePickRegion(item.slug)}
                      className={cn(
                        'flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors',
                        selected
                          ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                          : 'border-border bg-secondary/30 hover:border-border/80 hover:bg-secondary/60',
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {item.code}
                        </span>
                        <span className={cn('text-[10px] font-medium', statusColor)}>{statusText}</span>
                      </div>
                      <p className="text-[13px] font-semibold leading-tight text-foreground">{item.label}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{item.slug}</p>
                      {stats ? (
                        <div className="space-y-1">
                          <div className="h-1 w-full overflow-hidden rounded-full bg-border">
                            <div
                              className={cn('h-full rounded-full', pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-warning' : 'bg-success')}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {stats.count} server{stats.count !== 1 ? 's' : ''}, {free} free slot{free !== 1 ? 's' : ''}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">No servers yet</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {region ? (
          <FormField label="Server Name" hint="Auto-suggested; change if needed">
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameTouched(true);
              }}
              placeholder={suggestName(region)}
              autoFocus
            />
          </FormField>
        ) : null}

        <p className="text-xs text-muted-foreground">
          DigitalOcean size and image are read from <code className="text-foreground">DIGITALOCEAN_SIZE</code> and{' '}
          <code className="text-foreground">DIGITALOCEAN_IMAGE</code>.
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="primary" loading={loading} disabled={!region} onClick={() => void handleSubmit()}>
          {region ? `Provision in ${regionLabel(region)}` : 'Select a Region'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function DecommissionDialog({ server, onClose, onSuccess }: { server: Server; onClose: () => void; onSuccess: () => Promise<void> }) {
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post(`/admin/servers/${server.id}/decommission`, { force });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message ?? 'Decommission failed');
    } finally {
      setLoading(false);
    }
  };

  const hasDroplet = Boolean(server.droplet_id);
  const activeKeys = server.current_active_keys;

  return (
    <Dialog open onClose={onClose} size="sm">
      <DialogHeader>
        <DialogTitle>Decommission Server?</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-4">
        {error ? (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex items-start gap-3 rounded-md border border-warning/25 bg-warning/10 px-3 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <div className="space-y-1 text-sm text-warning">
            <p className="font-semibold">This cannot be undone.</p>
            <p className="text-warning/80">
              Active keys on this server will be deleted, active orders will be migrated when capacity exists, and the droplet will be destroyed unless skipped.
            </p>
          </div>
        </div>

        <div className="space-y-1 rounded-md border border-border bg-secondary/40 px-3 py-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Server</span>
            <span className="font-medium">{server.name}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Region</span>
            <span>{regionLabel(server.region)} ({server.region})</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Active keys</span>
            <span className={activeKeys > 0 ? 'font-medium text-warning' : 'text-muted-foreground'}>{activeKeys}</span>
          </div>
          {hasDroplet ? (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Droplet ID</span>
              <span className="font-mono text-xs">{String(server.droplet_id)}</span>
            </div>
          ) : null}
        </div>

        {hasDroplet ? (
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5 rounded"
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
            />
            <div>
              <p className="text-sm font-medium">Skip droplet deletion</p>
              <p className="text-xs text-muted-foreground">Use this if the server is already banned, unreachable, or manually removed.</p>
            </div>
          </label>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="destructive" loading={loading} onClick={() => void handleConfirm()}>
          {activeKeys > 0 ? `Decommission and Delete ${activeKeys} Key${activeKeys !== 1 ? 's' : ''}` : 'Decommission'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function EditCapacityDialog({ server, onClose, onSuccess }: { server: Server; onClose: () => void; onSuccess: () => Promise<void> }) {
  const [value, setValue] = useState(String(server.max_active_keys));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError('Must be a positive integer');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/admin/servers/${server.id}/capacity`, { max_active_keys: parsed });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} size="sm">
      <DialogHeader>
        <DialogTitle>Edit Capacity - {server.name}</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-4">
        {error ? <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
        <p className="text-sm text-muted-foreground">
          Current usage: <span className="text-foreground">{server.current_active_keys}</span> active keys
        </p>
        <FormField label="Max Active Keys">
          <Input type="number" min={1} value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
        </FormField>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={() => void handleSave()}>Save</Button>
      </DialogFooter>
    </Dialog>
  );
}

function DetailField({ label, value, copyable = false }: { label: string; value?: string | number | null; copyable?: boolean }) {
  const display = value === null || value === undefined || value === '' ? '-' : String(value);
  return (
    <div className="rounded-lg border border-border bg-secondary/25 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs text-foreground">{display}</span>
        {copyable && display !== '-' ? (
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyValue(display)}>
            <Copy size={13} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ServerDetailsDialog({ server, onClose }: { server: Server; onClose: () => void }) {
  const meta = regionMeta(server.region);
  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader>
        <div>
          <DialogTitle>{server.name}</DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {server.provider ?? 'Unknown provider'} / {regionLabel(server.region)} / {getServerTier(server)} / {server.host_ip ?? 'No IP yet'}
          </p>
        </div>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Capacity</p>
                <p className="mt-1 text-3xl font-bold text-foreground">{server.current_active_keys}</p>
                <p className="text-xs text-muted-foreground">active keys from {server.max_active_keys} max</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <ServerTierBadge tier={server.server_tier} />
                <ServerStatusBadge status={server.status} />
              </div>
            </div>
            <div className="mt-4">
              <CapacityBar current={server.current_active_keys} max={server.max_active_keys} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Placement</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Region</span>
                <span className="font-medium">{regionLabel(server.region)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Code</span>
                <span className="font-mono text-xs">{server.region ?? '-'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Area</span>
                <span>{meta?.area ?? '-'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Tier</span>
                <span className="font-medium">{getServerTier(server) === 'trial' ? 'Trial' : 'Premium'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Default</span>
                <span>{server.is_default ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        </div>

        {server.last_error ? (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle size={14} />
              Last error
            </div>
            <p className="break-words text-destructive/90">{server.last_error}</p>
          </div>
        ) : null}

        <div className="grid gap-2 md:grid-cols-2">
          <DetailField label="Host IP" value={server.host_ip} copyable />
          <DetailField label="Droplet ID" value={server.droplet_id} copyable />
          <DetailField label="Outline API URL" value={server.outline_api_url} copyable />
          <DetailField label="Outline Cert SHA256" value={server.outline_cert_sha256} copyable />
          <DetailField label="Created" value={formatDate(server.created_at)} />
          <DetailField label="Updated" value={formatDate(server.updated_at)} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </DialogFooter>
    </Dialog>
  );
}

interface Props {
  servers: Server[];
  onSuccess: () => Promise<void>;
}

export function ServersPage({ servers, onSuccess }: Props) {
  const [showProvision, setShowProvision] = useState(false);
  const [editTarget, setEditTarget] = useState<Server | null>(null);
  const [decommissionTarget, setDecommissionTarget] = useState<Server | null>(null);
  const [detailTarget, setDetailTarget] = useState<Server | null>(null);
  const [tierUpdatingId, setTierUpdatingId] = useState<string | null>(null);
  const [serverError, setServerError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isProvisioning = servers.some((server) => server.status === 'provisioning');

  useEffect(() => {
    if (isProvisioning) {
      pollRef.current = setInterval(() => {
        void onSuccess();
      }, 10_000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isProvisioning, onSuccess]);

  const activeServers = useMemo(() => servers.filter((server) => server.status !== 'decommissioned'), [servers]);
  const decommissionedServers = useMemo(() => servers.filter((server) => server.status === 'decommissioned'), [servers]);
  const failedServers = activeServers.filter((server) => server.status === 'failed' || Boolean(server.last_error));
  const trialServers = activeServers.filter((server) => getServerTier(server) === 'trial');
  const premiumServers = activeServers.filter((server) => getServerTier(server) === 'premium');
  const totalCapacity = activeServers.reduce((sum, server) => sum + server.max_active_keys, 0);
  const usedCapacity = activeServers.reduce((sum, server) => sum + server.current_active_keys, 0);
  const remainingCapacity = Math.max(totalCapacity - usedCapacity, 0);
  const defaultServer = activeServers.find((server) => server.is_default);
  const nearFullServers = activeServers.filter((server) => getUsagePercent(server) >= 70 && server.status !== 'provisioning');
  const regionCount = new Set(activeServers.map((server) => server.region).filter(Boolean)).size;

  const updateServerTier = async (server: Server, serverTier: 'trial' | 'premium') => {
    setTierUpdatingId(server.id);
    setServerError('');
    try {
      await api.patch(`/admin/servers/${server.id}/tier`, { server_tier: serverTier });
      await onSuccess();
    } catch (err: any) {
      setServerError(err?.response?.data?.error ?? err.message ?? 'Failed to update server tier');
    } finally {
      setTierUpdatingId(null);
    }
  };

  const getActions = (server: Server): ActionMenuItem[] => [
    {
      label: 'View details',
      icon: <Eye size={14} />,
      onSelect: () => setDetailTarget(server),
    },
    {
      label: 'Edit capacity',
      icon: <Edit3 size={14} />,
      disabled: server.status === 'provisioning' || server.status === 'decommissioned',
      onSelect: () => setEditTarget(server),
    },
    {
      label: 'Copy host IP',
      icon: <Copy size={14} />,
      disabled: !server.host_ip,
      onSelect: () => copyValue(server.host_ip),
    },
    {
      label: 'Mark as trial',
      icon: <ServerIcon size={14} />,
      disabled:
        getServerTier(server) === 'trial' ||
        server.status === 'decommissioned' ||
        server.current_active_keys > 0 ||
        tierUpdatingId === server.id,
      onSelect: () => void updateServerTier(server, 'trial'),
    },
    {
      label: 'Mark as premium',
      icon: <Network size={14} />,
      disabled:
        getServerTier(server) === 'premium' ||
        server.status === 'decommissioned' ||
        server.current_active_keys > 0 ||
        tierUpdatingId === server.id,
      onSelect: () => void updateServerTier(server, 'premium'),
    },
    {
      label: 'Decommission',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: server.status === 'provisioning' || server.status === 'decommissioned',
      onSelect: () => setDecommissionTarget(server),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Server Management</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Capacity, region placement, provisioning state, and Outline host health.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isProvisioning ? (
            <Badge variant="info" className="gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              Auto-refreshing
            </Badge>
          ) : null}
          <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setShowProvision(true)}>
            Provision Server
          </Button>
        </div>
      </div>

      {serverError ? (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="In Rotation"
          value={activeServers.length}
          helper={`${premiumServers.length} premium, ${trialServers.length} trial`}
          icon={<ServerIcon size={17} />}
          tone="info"
        />
        <StatCard
          label="Trial Capacity"
          value={trialServers.reduce((sum, server) => sum + server.current_active_keys, 0) + '/' + trialServers.reduce((sum, server) => sum + server.max_active_keys, 0)}
          helper={trialServers.length ? `${trialServers.length} trial server${trialServers.length !== 1 ? 's' : ''}` : 'No trial server configured'}
          icon={<Activity size={17} />}
          tone={trialServers.length ? 'success' : 'warning'}
        />
        <StatCard
          label="Capacity Used"
          value={`${usedCapacity}/${totalCapacity}`}
          helper={`${remainingCapacity} free slots`}
          icon={<Database size={17} />}
          tone={remainingCapacity <= 5 && totalCapacity > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Default Route"
          value={defaultServer ? regionLabel(defaultServer.region) : '-'}
          helper={defaultServer?.name ?? 'No default server'}
          icon={<Network size={17} />}
          tone={defaultServer ? 'success' : 'warning'}
        />
        <StatCard
          label="Needs Attention"
          value={failedServers.length + nearFullServers.length}
          helper={`${failedServers.length} error, ${nearFullServers.length} near full`}
          icon={<AlertTriangle size={17} />}
          tone={failedServers.length + nearFullServers.length > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Retired"
          value={decommissionedServers.length}
          helper={`${regionCount} active region${regionCount !== 1 ? 's' : ''}`}
          icon={<HardDrive size={17} />}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Active Fleet</h2>
            <p className="text-xs text-muted-foreground">Servers currently available or being prepared for customer keys.</p>
          </div>
          <Badge variant={failedServers.length ? 'warning' : 'success'}>
            {failedServers.length ? `${failedServers.length} warning${failedServers.length !== 1 ? 's' : ''}` : 'Healthy'}
          </Badge>
        </div>

        {activeServers.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <ServerIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">No servers in rotation</p>
            <p className="mt-1 text-xs text-muted-foreground">Provision a server when you are ready to add capacity.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activeServers.map((server) => {
              const meta = regionMeta(server.region);
              const tone = getCapacityTone(server);
              const rowWarning = server.status === 'failed' || Boolean(server.last_error) || getUsagePercent(server) >= 90;

              return (
                <div
                  key={server.id}
                  className={cn(
                    'grid gap-3 px-4 py-3 transition-colors hover:bg-secondary/30 lg:grid-cols-[1.5fr_1fr_1fr_1fr_0.7fr_auto]',
                    rowWarning && 'bg-warning/5',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{server.name}</span>
                      <ServerTierBadge tier={server.server_tier} />
                      {server.current_active_keys > 0 ? <Badge variant="outline">Tier locked</Badge> : null}
                      {server.is_default ? <Badge variant="info">Default</Badge> : null}
                      {rowWarning ? <Badge variant={server.status === 'failed' ? 'destructive' : 'warning'}>Check</Badge> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} />
                        {regionLabel(server.region)} {meta ? `(${meta.code})` : ''}
                      </span>
                      <span className="font-mono">{server.region ?? '-'}</span>
                      <span>{server.provider ?? 'provider unknown'}</span>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <ServerStatusBadge status={server.status} />
                  </div>

                  <div className="min-w-0">
                    {server.status === 'provisioning' ? (
                      <p className="text-xs text-muted-foreground">Waiting for Outline setup</p>
                    ) : (
                      <CapacityBar current={server.current_active_keys} max={server.max_active_keys} compact />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Host IP</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="truncate font-mono text-xs text-foreground">{server.host_ip ?? '-'}</span>
                      {server.host_ip ? (
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyValue(server.host_ip)}>
                          <Copy size={13} />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <Badge variant={tone === 'destructive' ? 'destructive' : tone === 'warning' ? 'warning' : 'success'}>
                      {Math.round(getUsagePercent(server))}% used
                    </Badge>
                  </div>

                  <div className="flex items-center justify-end">
                    <ActionMenu items={getActions(server)} label="Server actions" />
                  </div>

                  {server.last_error ? (
                    <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive lg:col-span-6">
                      <span className="font-semibold">Last error:</span> {server.last_error}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {decommissionedServers.length > 0 ? (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 py-1 text-sm text-muted-foreground hover:text-foreground">
            <span className="rounded border border-border px-1.5 py-0.5 text-xs">{decommissionedServers.length} decommissioned</span>
            <span className="text-xs group-open:hidden">Show history</span>
            <span className="hidden text-xs group-open:inline">Hide history</span>
          </summary>
          <Card className="mt-2 overflow-hidden opacity-75">
            <div className="divide-y divide-border">
              {decommissionedServers.map((server) => (
                <div key={server.id} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1.4fr_1fr_1fr_auto]">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-muted-foreground">{server.name}</p>
                      <ServerTierBadge tier={server.server_tier} />
                    </div>
                    <p className="font-mono text-xs text-muted-foreground/70">{server.host_ip ?? '-'}</p>
                  </div>
                  <div className="text-muted-foreground">{regionLabel(server.region)}</div>
                  <div className="text-xs text-muted-foreground">Updated {formatDate(server.updated_at)}</div>
                  <ActionMenu items={getActions(server)} label="Server history actions" />
                </div>
              ))}
            </div>
          </Card>
        </details>
      ) : null}

      {showProvision ? (
        <ProvisionDialog servers={servers} onClose={() => setShowProvision(false)} onSuccess={onSuccess} />
      ) : null}
      {editTarget ? (
        <EditCapacityDialog server={editTarget} onClose={() => setEditTarget(null)} onSuccess={onSuccess} />
      ) : null}
      {decommissionTarget ? (
        <DecommissionDialog
          server={decommissionTarget}
          onClose={() => setDecommissionTarget(null)}
          onSuccess={onSuccess}
        />
      ) : null}
      {detailTarget ? (
        <ServerDetailsDialog server={detailTarget} onClose={() => setDetailTarget(null)} />
      ) : null}
    </div>
  );
}
