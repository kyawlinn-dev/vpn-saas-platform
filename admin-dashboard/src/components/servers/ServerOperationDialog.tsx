import { useEffect, useRef, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Check, RefreshCw, X } from 'lucide-react';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { serverOperationsApi, type CatalogPlan, type CatalogRegion, type CreateRequest, type OperationKind, type OperationQuote, type ProtocolProfile, type ProviderId, type ProviderOption, type ProviderReadiness, type QuoteChoice, type ServerOperation } from '@/features/serverOperations/api';
import type { Server } from '@/types/api';
import { providers, providerName, providerReason, CatalogPrice, QuotePrice } from '@/features/serverOperations/presentation';

const pendingKey = 'novanet:pending-server-operation';
interface Pending { key: string; request: CreateRequest; quote: OperationQuote; choice: QuoteChoice }
export function readPendingServerOperation(): Pending | null {
  try { const value = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); return value?.key && value?.quote?.id && value?.request?.quote_id ? value : null; } catch { return null; }
}
const titles = { add: 'Add Server', replace: 'Replace Server', move_retire: 'Move and Retire' };
const safeCatalogCodes = new Set(['PROVIDER_UNAVAILABLE', 'PROVIDER_CATALOG_STALE', 'PROVIDER_PLAN_UNAVAILABLE', 'PROVIDER_PLAN_INCOMPATIBLE', 'INVALID_PROVIDER_REGION', 'INVALID_PROVIDER_PLAN', 'PROVIDER_REGION_DISALLOWED', 'PROVIDER_PLAN_DISALLOWED', 'PROVIDER_BUDGET_EXCEEDED', 'PROVIDER_CONFIGURATION_REQUIRED', 'PROVIDER_SSH_KEY_UNAVAILABLE', 'FIREWALL_POLICY_UNVERIFIED', 'PROVIDER_IMAGE_UNAVAILABLE', 'PROVIDER_ACCOUNT_NOT_REGISTERED', 'PROVIDER_ACCOUNT_UNVERIFIED', 'PROVIDER_ACCOUNT_MISMATCH']);
interface Props { mode: OperationKind; source?: Server; servers: Server[]; options?: ProviderOption[]; providerReadiness?: ProviderReadiness[]; onClose: () => void; onCreated: (operation: ServerOperation) => void }
export function ServerOperationDialog({ mode: initialMode, source: suppliedSource, servers, options = [], providerReadiness, onClose, onCreated }: Props) {
  const legacy = typeof serverOperationsApi.catalog !== 'function' && providerReadiness === undefined;
  const readiness = providers.map(id => providerReadiness?.find(p => p.id === id) || {
    id, ready: providerReadiness === undefined && options.some(p => p.id === id), reason: 'PROVIDER_CONFIGURATION_REQUIRED', profiles: ['dual', 'vless_only'] as ProtocolProfile[],
  });
  const firstProvider = readiness.find(p => p.ready)?.id || 'digitalocean';
  const [pending, setPending] = useState(readPendingServerOperation);
  const [recoveryChoice] = useState(pending?.choice);
  const source = suppliedSource || servers.find(server => server.id === recoveryChoice?.source_server_id);
  const mode = pending?.quote.kind || recoveryChoice?.kind || initialMode;
  const retireOnly = mode === 'move_retire' && (pending ? pending.choice.retire_only === true :
    recoveryChoice?.retire_only === true || source?.supported_protocols?.length === 1 && source.supported_protocols[0] === 'vless');
  const title = retireOnly ? 'Retire Server' : titles[mode];
  const [provider, setProvider] = useState<ProviderId>((pending?.choice.provider as ProviderId) || firstProvider);
  const [region, setRegion] = useState(pending?.choice.region || (legacy ? options[0]?.regions[0]?.id : '') || '');
  const [plan, setPlan] = useState(pending?.choice.plan_id || (legacy ? options[0]?.regions[0]?.plans[0]?.id : '') || '');
  const [profile, setProfile] = useState<ProtocolProfile>((pending?.choice.supported_protocols || source?.supported_protocols)?.includes('shadowsocks') ? 'dual' : 'vless_only');
  const [destination, setDestination] = useState(pending?.choice.destination_server_id || '');
  const [quote, setQuote] = useState<OperationQuote | null>(pending?.quote || null);
  const [cost, setCost] = useState(pending?.request.confirm_cost || false);
  const [overlap, setOverlap] = useState(pending?.request.confirm_temporary_billing || false);
  const [deletion, setDeletion] = useState(pending?.request.confirm_delete_source || false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const busyRef = useRef(false); const key = useRef(pending?.key || crypto.randomUUID());
  const [catalogRegions, setCatalogRegions] = useState<CatalogRegion[]>([]);
  const [catalogPlans, setCatalogPlans] = useState<CatalogPlan[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [snapshot, setSnapshot] = useState<{ observed_at: string | null; stale: boolean } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const currentProvider = readiness.find(p => p.id === provider)!;
  const legacyRegions = options.find(p => p.id === provider)?.regions || [];
  const regions = legacy ? legacyRegions.map(r => ({ ...r, available: true })) : catalogRegions;
  const plans = legacy ? (legacyRegions.find(r => r.id === region)?.plans || []).map(p => ({ ...p, available: true, compatible: true, reason: null })) : catalogPlans;
  const selectedPlan = catalogPlans.find(p => p.id === plan);
  const eligible = currentProvider.ready && currentProvider.profiles.includes(profile) &&
    (legacy ? Boolean(plan && region) : regions.some(r => r.id === region && r.available) && Boolean(selectedPlan?.available && selectedPlan.compatible) && !catalogLoading && !catalogError);
  const locked = busy || Boolean(pending);
  const quoteVersion = useRef(0);
  useEffect(() => () => { quoteVersion.current++; }, []);
  const sourceId = pending?.choice.source_server_id || source?.id || recoveryChoice?.source_server_id;
  const targets = servers.filter(s => source && s.id !== source.id && s.status === 'active' && s.is_active && s.access_pool_id === source.access_pool_id && s.environment === source.environment &&
    source.supported_protocols?.every(protocol => s.supported_protocols?.includes(protocol)));
  const resetQuote = () => { quoteVersion.current++; setQuote(null); setCost(false); setOverlap(false); setDeletion(false); setError(''); };
  useEffect(() => {
    if (legacy || pending || mode === 'move_retire' || !currentProvider.ready) { setCatalogLoading(false); return; }
    const controller = new AbortController();
    setCatalogLoading(true); setCatalogError(''); setSnapshot(null);
    async function load() {
      try {
        if (region && !catalogRegions.length) {
          const result = await serverOperationsApi.catalog({ provider, ...(refresh ? { refresh: true } : {}) }, controller.signal);
          if (controller.signal.aborted || result.provider !== provider) return;
          if (!('regions' in result)) throw new Error('Invalid catalogue');
          setCatalogRegions(result.regions);
        }
        const result = await serverOperationsApi.catalog({ provider, ...(region ? { region } : {}), ...(refresh ? { refresh: true } : {}) }, controller.signal);
        if (controller.signal.aborted || result.provider !== provider) return;
        if (region) {
          if (!('plans' in result) || result.region !== region) throw new Error('Invalid catalogue');
          setCatalogPlans(result.plans);
          setPlan(previous => result.plans.some(p => p.id === previous && p.available && p.compatible) ? previous : '');
        } else {
          if (!('regions' in result)) throw new Error('Invalid catalogue');
          setCatalogRegions(result.regions);
        }
        setSnapshot({ observed_at: result.observed_at, stale: result.stale });
      } catch (failure) {
        if (controller.signal.aborted) return;
        const code = (failure as { response?: { data?: { code?: string } } }).response?.data?.code;
        setCatalogError(provider==='lightnode'?`Catalogue unavailable: ${providerReason(code)} Refresh to retry.`:
          `Catalogue unavailable${code && safeCatalogCodes.has(code) ? `: ${code}` : ''}. Refresh to retry.`);
      } finally { if (!controller.signal.aborted) setCatalogLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [provider, region, refresh, legacy, pending, mode, currentProvider.ready]);
  const choice: QuoteChoice = mode === 'move_retire' ? { kind: mode, source_server_id: sourceId,
    ...(retireOnly ? { retire_only: true as const } : { destination_server_id: destination }) } : {
    kind: mode, ...(mode === 'replace' ? { source_server_id: sourceId } : {}), provider, region, plan_id: plan, supported_protocols: profile === 'dual' ? ['shadowsocks', 'vless'] : ['vless'],
  };
  async function review() {
    if (busyRef.current || pending || (mode !== 'move_retire' && !eligible)) return;
    resetQuote();
    const version = quoteVersion.current;
    busyRef.current = true; setBusy(true); setError('');
    try { const result = await serverOperationsApi.quote(choice); if (version === quoteVersion.current) { setQuote(result); key.current = crypto.randomUUID(); } }
    catch (failure) {
      if (version === quoteVersion.current) {
        const code=(failure as {response?: {data?: {code?: string}}}).response?.data?.code;
        const safe=new Set(['RETIREMENT_FALLBACK_UNAVAILABLE','DESTINATION_NOT_READY','DESTINATION_CAPACITY_INSUFFICIENT','DESTINATION_PROTOCOL_MISMATCH','DESTINATION_SCOPE_MISMATCH','PROTECTED_RESOURCE','RESOURCE_SCOPE_MISMATCH','PROVIDER_UNAVAILABLE','INFRASTRUCTURE_EXECUTION_DISABLED']);
        setError(mode==='move_retire' ? `${retireOnly ? 'Retirement' : 'Migration'} review unavailable${code && safe.has(code)?`: ${code}`:''}. Check ${retireOnly ? 'remaining server' : 'source and destination'} readiness.` : 'Quote unavailable. Check server readiness and try again.');
      }
    }
    finally { busyRef.current = false; setBusy(false); }
  }
  // An uncertain request must reconcile with its original key even after quote expiry.
  const approved = Boolean(pending) || (quote && (mode === 'move_retire' || eligible) && Date.parse(quote.expiresAt) > Date.now() && (!quote.price || cost) && (mode !== 'replace' || overlap) && (mode === 'add' || deletion));
  async function submit() {
    if (!quote || !approved || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    const attempt: Pending = pending || { key: key.current, request: { quote_id: quote.id, confirm_cost: cost, confirm_temporary_billing: overlap, confirm_delete_source: deletion }, quote, choice };
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(attempt)); setPending(attempt);
      const operation = await serverOperationsApi.create(attempt.request, attempt.key);
      sessionStorage.removeItem(pendingKey); onCreated(operation);
    } catch (error: unknown) {
      const response = (error as { response?: { status?: number; data?: { code?: string } } }).response;
      const rejectedReview = response?.status === 409 && ['QUOTE_EXPIRED', 'QUOTE_CHANGED', 'DESTINATION_NOT_READY',
        'DESTINATION_CAPACITY_INSUFFICIENT', 'DESTINATION_SCOPE_MISMATCH', 'RETIREMENT_FALLBACK_UNAVAILABLE'].includes(response.data?.code || '');
      if (rejectedReview) { sessionStorage.removeItem(pendingKey); setPending(null); setQuote(null); setError('Request rejected. Review again before submitting.'); }
      else setError('Submission not confirmed. Retry the same request or check operation status.');
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <Dialog open onClose={onClose} size="md">
    <DialogHeader><RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
      <button type="button" aria-label="Close" title="Close" onClick={onClose}><X size={18} /></button></DialogHeader>
    <RadixDialog.Description className="sr-only">Server selection, provider billing and deletion approval</RadixDialog.Description>
    <DialogBody className="max-h-[65dvh] space-y-4 overflow-y-auto">
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      {pending && <p role="status" className="text-sm text-warning">Submission awaiting confirmation</p>}
      {sourceId && <p className="break-words text-sm">Source: {servers.find(s => s.id === sourceId)?.name || sourceId}</p>}
      {mode === 'move_retire' ? retireOnly ? null : <label className="block space-y-1 text-sm">Destination
        <Select aria-label="Destination" value={destination} disabled={locked} onChange={e => { setDestination(e.target.value); resetQuote(); }}>
          <option value="">Select server</option>{targets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select></label> : <>
        <div className="space-y-1 text-xs" aria-label="Provider readiness">{readiness.map(p => <p key={p.id} className="break-words">{providerName(p.id)}: {p.ready ? 'Ready' : p.id==='lightnode'?providerReason(p.reason):p.reason || 'Unavailable'}</p>)}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="min-w-0 space-y-1 text-sm">Provider<Select className="rounded-md" aria-label="Provider" value={provider} disabled={locked} onChange={e => {
            const next = e.target.value as ProviderId;
            const legacyProvider = options.find(p => p.id === next);
            const profiles = readiness.find(p => p.id === next)?.profiles || [];
            setProvider(next); setRegion(legacy ? legacyProvider?.regions[0]?.id || '' : ''); setPlan(legacy ? legacyProvider?.regions[0]?.plans[0]?.id || '' : '');
            if (!profiles.includes(profile)) setProfile(source?.supported_protocols?.includes('shadowsocks') ? 'dual' : profiles[0] || 'vless_only');
            setCatalogRegions([]); setCatalogPlans([]); setSnapshot(null); setSearch(''); setRefresh(0); resetQuote();
          }}>{readiness.map(p => <option key={p.id} value={p.id} disabled={!p.ready}>{providerName(p.id)}</option>)}</Select></label>
          <label className="min-w-0 space-y-1 text-sm">Region<Select className="rounded-md" aria-label="Region" value={region} disabled={locked || !currentProvider.ready || !regions.length} onChange={e => {
            setRegion(e.target.value); setPlan(legacy ? legacyRegions.find(r => r.id === e.target.value)?.plans[0]?.id || '' : ''); setCatalogPlans([]); setSearch(''); setRefresh(0); resetQuote();
          }}><option value="">Select region</option>{pending && !regions.some(r => r.id === region) && <option value={region}>{region}</option>}{regions.map(r => <option key={r.id} value={r.id} disabled={!r.available}>{r.label || r.id}{!r.available ? ' - Unavailable' : ''}</option>)}</Select></label>
          <label className="min-w-0 space-y-1 text-sm">Plan<Select className="rounded-md" aria-label="Plan" value={plan} disabled={locked || !region || catalogLoading || !plans.length} onChange={e => { setPlan(e.target.value); resetQuote(); }}>
            <option value="">Select plan</option>{pending && !plans.some(p => p.id === plan) && <option value={plan}>{plan}</option>}{plans.filter(p => p.id === plan || `${p.label} ${p.id}`.toLowerCase().includes(search.toLowerCase())).map(p => <option key={p.id} value={p.id} disabled={'compatible' in p && (!p.compatible || !p.available)}>{p.label || p.id}{'compatible' in p && (!p.compatible || !p.available) ? ` - ${provider==='lightnode'?providerReason(p.reason):p.reason || 'Unavailable'}` : ''}</option>)}
          </Select></label>
          <label className="min-w-0 space-y-1 text-sm">Protocols<Select className="rounded-md" aria-label="Protocols" value={profile} disabled={locked} onChange={e => { setProfile(e.target.value as ProtocolProfile); resetQuote(); }}><option value="dual" disabled={!currentProvider.profiles.includes('dual')}>Dual Protocol</option><option value="vless_only" disabled={source?.supported_protocols?.includes('shadowsocks') || !currentProvider.profiles.includes('vless_only')}>VLESS Only</option></Select></label>
        </div>
        {!legacy && !pending && <>
          <div className="flex min-w-0 items-end gap-2"><label className="min-w-0 flex-1 space-y-1 text-sm">Search plans<Input className="rounded-md" type="search" aria-label="Search plans" value={search} disabled={!region || locked} onChange={e => setSearch(e.target.value)} /></label>
            <Button className="h-9 w-9 shrink-0 rounded-md p-0" aria-label="Refresh catalogue" title="Refresh catalogue" disabled={locked || catalogLoading || !currentProvider.ready} onClick={() => { resetQuote(); setRefresh(value => value + 1); }}><RefreshCw size={16} /></Button></div>
          <div className="min-h-10 space-y-1 text-xs text-muted-foreground" aria-live="polite">
            {catalogLoading && <p role="status">Loading {region ? 'plans' : 'regions'}...</p>}
            {catalogError && <p role="alert" className="break-words text-destructive">{catalogError}</p>}
            {!catalogLoading && !catalogError && currentProvider.ready && (region ? !catalogPlans.length : !regions.length) && <p>{region ? 'No plans available in this region.' : 'No regions available for this provider.'}</p>}
            {!currentProvider.profiles.includes(profile) && <p>Selected protocol profile is unavailable for this provider.</p>}
            {snapshot?.stale && <p className="text-warning">{provider === 'lightnode' ? 'Stale catalogue. Server specifications and availability require a fresh review.' : 'Stale catalogue. Availability and price require a fresh quote.'}</p>}
            {snapshot?.observed_at && <p>Observed <time dateTime={snapshot.observed_at}>{new Date(snapshot.observed_at).toLocaleString()}</time></p>}
          </div>
        </>}
        {selectedPlan && <section className="space-y-1 border-y border-border py-3 text-sm" aria-label="Plan specifications">
          <p className="break-words">{selectedPlan.cpu ?? 'Unknown'} vCPU / {selectedPlan.memory_mb ?? 'Unknown'} MB RAM / {selectedPlan.disk_gb ?? 'Unknown'} GB disk</p>
          <p className="break-words text-xs text-muted-foreground">{selectedPlan.architecture || 'Unknown architecture'} / {selectedPlan.family || 'Unknown family'}</p>
          <CatalogPrice provider={provider} price={selectedPlan.price} />
          <p>Transfer: {selectedPlan.transfer.included == null ? 'Unknown' : `${selectedPlan.transfer.included} ${selectedPlan.transfer.unit || 'Unknown unit'}`}</p>
          {selectedPlan.bandwidth_mbps != null && <p>Bandwidth: {selectedPlan.bandwidth_mbps} Mbps</p>}
        </section>}
      </>}
      <Button onClick={() => void review()} loading={busy && !pending} disabled={locked || (mode === 'move_retire' ? !retireOnly && !destination : !eligible)}>{mode==='move_retire' ? retireOnly ? 'Review Retirement' : 'Review Migration' : 'Review Quote'}</Button>
      {quote && <section className="space-y-3 border-t border-border pt-4">
        {retireOnly && <p className="break-words text-sm">Remaining access: {servers.find(s => s.id === quote.destination_server_id)?.name || 'Verified remaining node'}</p>}
        {quote.price ? <><QuotePrice price={quote.price} />
          <p className="text-xs text-muted-foreground">Traffic: {quote.price.trafficTerms.included ?? 'Unknown'} {quote.price.trafficTerms.unit ?? ''}. Overage: {quote.price.trafficTerms.overageAmount == null ? 'Not quoted' : `${quote.price.trafficTerms.overageAmount} ${quote.price.currency}`}.</p>
          {quote.price.trafficTerms.bandwidth_mbps != null && <p>Bandwidth: {quote.price.trafficTerms.bandwidth_mbps} Mbps</p>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={cost} disabled={locked} onChange={e => setCost(e.target.checked)} />{quote.price.provider === 'lightnode' ? 'Approve provider billing' : 'Approve recurring cost'}</label></> : <p className="text-sm">No new VPS purchase</p>}
        {mode === 'replace' && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={overlap} disabled={locked} onChange={e => setOverlap(e.target.checked)} />Approve temporary two-VPS billing</label>}
        {mode !== 'add' && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={deletion} disabled={locked} onChange={e => setDeletion(e.target.checked)} />Approve deletion of the source VPS after verification</label>}
      </section>}
    </DialogBody>
    <DialogFooter><Button onClick={onClose}>Close</Button><Button variant="primary" leftIcon={<Check size={15} />} loading={busy && Boolean(pending)} disabled={!approved || busy} onClick={() => void submit()}>{title}</Button></DialogFooter>
  </Dialog>;
}
