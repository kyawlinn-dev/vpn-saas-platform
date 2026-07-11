import { useState, useEffect, useRef } from 'react';
import { Plus, Loader2, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { Server } from '@/types/api';

// ─── Region catalogue ─────────────────────────────────────────────────────────

const DO_REGIONS: { slug: string; label: string; country: string; flag: string; area: string }[] = [
  { slug: 'sgp1', label: 'Singapore',     country: 'Singapore',      flag: '🇸🇬', area: 'Asia Pacific'  },
  { slug: 'blr1', label: 'Bangalore',     country: 'India',          flag: '🇮🇳', area: 'Asia Pacific'  },
  { slug: 'syd1', label: 'Sydney',        country: 'Australia',      flag: '🇦🇺', area: 'Asia Pacific'  },
  { slug: 'nyc1', label: 'New York 1',    country: 'United States',  flag: '🇺🇸', area: 'North America' },
  { slug: 'nyc3', label: 'New York 3',    country: 'United States',  flag: '🇺🇸', area: 'North America' },
  { slug: 'sfo3', label: 'San Francisco', country: 'United States',  flag: '🇺🇸', area: 'North America' },
  { slug: 'tor1', label: 'Toronto',       country: 'Canada',         flag: '🇨🇦', area: 'North America' },
  { slug: 'lon1', label: 'London',        country: 'United Kingdom', flag: '🇬🇧', area: 'Europe'        },
  { slug: 'fra1', label: 'Frankfurt',     country: 'Germany',        flag: '🇩🇪', area: 'Europe'        },
  { slug: 'ams3', label: 'Amsterdam',     country: 'Netherlands',    flag: '🇳🇱', area: 'Europe'        },
];

function regionMeta(slug: string) {
  return DO_REGIONS.find((r) => r.slug === slug) ?? null;
}

function regionLabel(slug: string) {
  return regionMeta(slug)?.label ?? slug;
}

function suggestName(region: string) {
  return region ? `${region}-${String(Date.now()).slice(-4)}` : '';
}

// Per-region stats derived from the live server list
function computeRegionStats(servers: Server[]) {
  const map = new Map<string, { count: number; capacity: number; used: number }>();
  for (const s of servers) {
    if (s.status === 'decommissioned') continue;
    const cur = map.get(s.region) ?? { count: 0, capacity: 0, used: 0 };
    cur.count++;
    cur.capacity += s.max_active_keys;
    cur.used += s.current_active_keys;
    map.set(s.region, cur);
  }
  return map;
}

// ─── Capacity bar ─────────────────────────────────────────────────────────────

function CapacityBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const color = pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-warning' : 'bg-primary';
  return (
    <div className="space-y-1 min-w-32">
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{current} / {max} ({max - current} free)</p>
    </div>
  );
}

// ─── Server status badge ──────────────────────────────────────────────────────

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
    return <Badge variant="default" className="opacity-60">Decommissioned</Badge>;
  }
  if (status === 'failed') {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return <StatusBadge status={status} />;
}

// ─── Provision dialog ─────────────────────────────────────────────────────────

interface ProvisionDialogProps {
  servers: Server[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

function ProvisionDialog({ servers, onClose, onSuccess }: ProvisionDialogProps) {
  const [region, setRegion] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const regionStats = computeRegionStats(servers);

  const handlePickRegion = (slug: string) => {
    setRegion(slug);
    if (!nameTouched) setName(suggestName(slug));
  };

  const handleSubmit = async () => {
    if (!region) { setError('Please select a region.'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/admin/servers/provision', {
        region: region.trim(),
        name: name.trim() || undefined,
      });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message ?? 'Provisioning failed');
    } finally {
      setLoading(false);
    }
  };

  const areas = [...new Set(DO_REGIONS.map((r) => r.area))];

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>Provision New Server</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-5">
        {error && (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Region availability grid */}
        <div className="space-y-4">
          {areas.map((area) => (
            <div key={area}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{area}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DO_REGIONS.filter((r) => r.area === area).map((r) => {
                  const stats = regionStats.get(r.slug);
                  const free = stats ? stats.capacity - stats.used : null;
                  const pct = stats && stats.capacity > 0 ? (stats.used / stats.capacity) * 100 : 0;
                  const selected = region === r.slug;
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
                      key={r.slug}
                      type="button"
                      onClick={() => handlePickRegion(r.slug)}
                      className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ${
                        selected
                          ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                          : 'border-border bg-secondary/30 hover:border-border/80 hover:bg-secondary/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-lg leading-none">{r.flag}</span>
                        <span className={`text-[10px] font-medium ${statusColor}`}>{statusText}</span>
                      </div>
                      <p className="text-[13px] font-semibold text-foreground leading-tight">{r.label}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{r.slug}</p>
                      {stats ? (
                        <div className="space-y-1">
                          <div className="h-1 w-full rounded-full bg-border overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-warning' : 'bg-success'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {stats.count} server{stats.count !== 1 ? 's' : ''} · {free} free slot{free !== 1 ? 's' : ''}
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

        {/* Server name — only shown after region is picked */}
        {region && (
          <FormField label="Server Name" hint="Auto-suggested — change if needed">
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
              placeholder={suggestName(region)}
              autoFocus
            />
          </FormField>
        )}

        <p className="text-xs text-muted-foreground">
          DigitalOcean · Size and image are read from <code className="text-foreground">DIGITALOCEAN_SIZE</code> / <code className="text-foreground">DIGITALOCEAN_IMAGE</code> env vars.
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

// ─── Decommission dialog ──────────────────────────────────────────────────────

interface DecommissionDialogProps {
  server: Server;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

function DecommissionDialog({ server, onClose, onSuccess }: DecommissionDialogProps) {
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
        {error && (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-start gap-3 rounded-md border border-warning/25 bg-warning/10 px-3 py-3">
          <AlertTriangle size={16} className="shrink-0 text-warning mt-0.5" />
          <div className="text-sm text-warning space-y-1">
            <p className="font-semibold">This cannot be undone.</p>
            <ul className="space-y-0.5 text-warning/80 list-disc list-inside">
              {activeKeys > 0 && (
                <li>Delete <strong>{activeKeys}</strong> active VPN key{activeKeys !== 1 ? 's' : ''}</li>
              )}
              {activeKeys > 0 && (
                <li>Stop all orders using those keys immediately</li>
              )}
              {hasDroplet && !force && (
                <li>Destroy the DigitalOcean droplet</li>
              )}
            </ul>
          </div>
        </div>

        <div className="rounded-md bg-secondary/40 border border-border px-3 py-2.5 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Server</span>
            <span className="font-medium">{server.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Region</span>
            <span>{regionLabel(server.region)} ({server.region})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Active keys</span>
            <span className={activeKeys > 0 ? 'text-warning font-medium' : 'text-muted-foreground'}>{activeKeys}</span>
          </div>
          {hasDroplet && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Droplet ID</span>
              <span className="font-mono text-xs">{String(server.droplet_id)}</span>
            </div>
          )}
        </div>

        {hasDroplet && (
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 rounded"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            <div>
              <p className="text-sm font-medium">Skip droplet deletion</p>
              <p className="text-xs text-muted-foreground">
                Use this if the server is already banned or unreachable — skips the DigitalOcean API call.
              </p>
            </div>
          </label>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="destructive" loading={loading} onClick={() => void handleConfirm()}>
          {activeKeys > 0 ? `Decommission & Delete ${activeKeys} Key${activeKeys !== 1 ? 's' : ''}` : 'Decommission'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Edit capacity dialog ─────────────────────────────────────────────────────

function EditCapacityDialog({ server, onClose, onSuccess }: { server: Server; onClose: () => void; onSuccess: () => Promise<void> }) {
  const [value, setValue] = useState(String(server.max_active_keys));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) { setError('Must be a positive integer'); return; }
    setSaving(true); setError('');
    try {
      await api.patch(`/admin/servers/${server.id}/capacity`, { max_active_keys: parsed });
      await onSuccess(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} size="sm">
      <DialogHeader>
        <DialogTitle>Edit Capacity — {server.name}</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-4">
        {error && <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
        <p className="text-sm text-muted-foreground">Current usage: <span className="text-foreground">{server.current_active_keys}</span> active keys</p>
        <FormField label="Max Active Keys">
          <Input type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </FormField>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={() => void handleSave()}>Save</Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface Props {
  servers: Server[];
  onSuccess: () => Promise<void>;
}

export function ServersPage({ servers, onSuccess }: Props) {
  const [showProvision, setShowProvision] = useState(false);
  const [editTarget, setEditTarget] = useState<Server | null>(null);
  const [decommissionTarget, setDecommissionTarget] = useState<Server | null>(null);

  // Auto-poll while any server is provisioning
  const isProvisioning = servers.some((s) => s.status === 'provisioning');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isProvisioning) {
      pollRef.current = setInterval(() => { void onSuccess(); }, 10_000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isProvisioning, onSuccess]);

  const active = servers.filter((s) => s.status !== 'decommissioned');
  const decommissioned = servers.filter((s) => s.status === 'decommissioned');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Servers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {active.length} server{active.length !== 1 ? 's' : ''} in rotation
            {isProvisioning && (
              <span className="ml-2 inline-flex items-center gap-1 text-info">
                <Loader2 size={11} className="animate-spin" />
                Provisioning… auto-refreshing
              </span>
            )}
          </p>
        </div>
        <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setShowProvision(true)}>
          Provision Server
        </Button>
      </div>

      {/* Active + provisioning servers */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Host IP</TableHead>
              <TableHead>Info</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No active servers — provision one above.
                </TableCell>
              </TableRow>
            ) : (
              active.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {s.is_default && <Badge variant="info">default</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-base leading-none">{regionMeta(s.region)?.flag ?? '🌐'}</span>
                      <div>
                        <div className="text-sm font-medium">{regionLabel(s.region)}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{s.region}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><ServerStatusBadge status={s.status} /></TableCell>
                  <TableCell>
                    {s.status === 'provisioning' ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <CapacityBar current={s.current_active_keys} max={s.max_active_keys} />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {s.host_ip ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-44">
                    {s.last_error ? (
                      <span
                        className={`text-xs line-clamp-2 ${s.status === 'provisioning' ? 'text-muted-foreground' : 'text-destructive'}`}
                        title={s.last_error}
                      >
                        {s.last_error}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.status !== 'provisioning' && (
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditTarget(s)}>
                          Capacity
                        </Button>
                        <Button variant="destructiveOutline" size="sm" onClick={() => setDecommissionTarget(s)}>
                          Decommission
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Decommissioned servers — collapsed section */}
      {decommissioned.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground select-none list-none py-1">
            <span className="border border-border rounded px-1.5 py-0.5 text-xs">
              {decommissioned.length} decommissioned
            </span>
            <span className="text-xs group-open:hidden">▶ Show</span>
            <span className="text-xs hidden group-open:inline">▼ Hide</span>
          </summary>
          <div className="mt-3">
            <Card className="opacity-60">
              <Table>
                <TableBody>
                  {decommissioned.map((s) => (
                    <TableRow key={s.id} className="hover:bg-transparent">
                      <TableCell className="font-medium text-muted-foreground">{s.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base leading-none">{regionMeta(s.region)?.flag ?? '🌐'}</span>
                          <div>
                            <div className="text-sm text-muted-foreground">{regionLabel(s.region)}</div>
                            <div className="font-mono text-[10px] text-muted-foreground/60">{s.region}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><ServerStatusBadge status={s.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </details>
      )}

      {/* Dialogs */}
      {showProvision && (
        <ProvisionDialog servers={servers} onClose={() => setShowProvision(false)} onSuccess={onSuccess} />
      )}
      {editTarget && (
        <EditCapacityDialog server={editTarget} onClose={() => setEditTarget(null)} onSuccess={onSuccess} />
      )}
      {decommissionTarget && (
        <DecommissionDialog
          server={decommissionTarget}
          onClose={() => setDecommissionTarget(null)}
          onSuccess={onSuccess}
        />
      )}
    </div>
  );
}
