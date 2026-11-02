import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerOperationDialog } from './ServerOperationDialog';
import { serverOperationsApi, type PlanCatalog, type ProviderReadiness, type RegionCatalog, type ServerOperation } from '@/features/serverOperations/api';
import type { Server } from '@/types/api';

vi.mock('@/features/serverOperations/api', () => ({ serverOperationsApi: { catalog: vi.fn(), quote: vi.fn(), create: vi.fn() } }));
const readiness: ProviderReadiness[] = [
  { id: 'digitalocean' as const, ready: true, reason: null, profiles: ['dual', 'vless_only'] as ('dual' | 'vless_only')[] },
  { id: 'vultr' as const, ready: true, reason: null, profiles: ['vless_only'] as ('dual' | 'vless_only')[] },
];
const metadata = { observed_at: '2026-10-27T08:00:00Z', stale: false };
const regions = [{ id: 'ams3', label: 'Amsterdam', available: true }, { id: 'fra1', label: 'Frankfurt', available: true }, { id: 'full', label: 'Full region', available: false }];
const plan = { id: 'compute', label: 'General compute', cpu: 2, memory_mb: 2048, disk_gb: 50, transfer: { included: 2, unit: 'TB' }, price: { monthly: 12, hourly: 0.018, currency: 'USD' }, available: true, compatible: true, reason: null, architecture: 'x86_64', family: 'general' };
const quote = { id: 'quote', kind: 'add' as const, source_server_id: null, destination_server_id: null, supported_protocols: ['vless'], temporary_billing_overlap: false, expiresAt: '2099-01-01', price: { provider: 'digitalocean', region: 'ams3', planId: 'compute', recurringAmount: 12, currency: 'USD', trafficTerms: { included: 2, unit: 'TB', overageAmount: null } } };
function open(providers = readiness) {
  return render(<ServerOperationDialog mode="add" servers={[]} options={[]} providerReadiness={providers} onClose={() => {}} onCreated={vi.fn()} />);
}
async function chooseRegion(value = 'ams3') {
  await screen.findByRole('option', { name: 'Amsterdam' });
  fireEvent.change(screen.getByLabelText('Region'), { target: { value } });
  await screen.findByRole('option', { name: 'General compute' });
}
async function choosePlan() {
  await chooseRegion();
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'compute' } });
}
beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(serverOperationsApi.catalog).mockImplementation(async ({ provider, region }) => region
    ? { provider, region, plans: [plan, { ...plan, id: 'arm', label: 'ARM compute', compatible: false, reason: 'UNSUPPORTED_ARCHITECTURE' }], ...metadata }
    : { provider, regions, ...metadata });
  vi.mocked(serverOperationsApi.quote).mockResolvedValue(quote);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('dynamic server catalogue', () => {
  it.each([
    { included: 1536, unit: 'GB', bandwidth_mbps: undefined },
    { included: null, unit: null, bandwidth_mbps: 100 },
  ])('accepts non-Tokyo LightNode provider pricing with traffic %j and preserves retry identity', async traffic => {
    const billing = { kind: 'provider_pricing' as const, source: 'https://doc.lightnode.com/Instance/Billingdescription.html' };
    vi.mocked(serverOperationsApi.catalog).mockImplementation(async ({ provider, region }) => region
      ? { provider, region, plans: [{ ...plan, transfer: { included: traffic.included, unit: traffic.unit }, bandwidth_mbps: traffic.bandwidth_mbps,
        price: { monthly: null, hourly: null, currency: 'USD', billing } }], ...metadata }
      : { provider, regions, ...metadata });
    vi.mocked(serverOperationsApi.quote).mockResolvedValue({ ...quote, price: { ...quote.price, provider: 'lightnode', recurringAmount: null,
      trafficTerms: { ...traffic, overageAmount: null, billing } } });
    vi.mocked(serverOperationsApi.create).mockRejectedValueOnce(new Error('timeout'));
    const onCreated = vi.fn();
    const props = { mode: 'add' as const, servers: [], providerReadiness: [
      { id: 'lightnode' as const, ready: true, reason: null, profiles: ['vless_only' as const] },
    ], onClose: () => {}, onCreated };
    const view = render(<ServerOperationDialog {...props} />);
    await choosePlan();
    expect((screen.getByRole('option', { name: 'General compute' }) as HTMLOptionElement).disabled).toBe(false);
    expect(screen.getByText('Provider pricing applies')).toBeTruthy();
    expect(screen.getByText(traffic.included == null ? 'Transfer: Unknown' : 'Transfer: 1536 GB')).toBeTruthy();
    if (traffic.bandwidth_mbps) expect(screen.getByText('Bandwidth: 100 Mbps')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Review Quote' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Review Quote' }));
    const approval = await screen.findByLabelText('Approve provider billing') as HTMLInputElement;
    expect(approval.disabled).toBe(false);
    expect(serverOperationsApi.quote).toHaveBeenCalledWith({ kind: 'add', provider: 'lightnode', region: 'ams3', plan_id: 'compute', supported_protocols: ['vless'] });
    expect(screen.getAllByText('Provider pricing applies')).toHaveLength(2);
    expect(screen.getByText(traffic.included == null ? /Traffic: Unknown/ : /Traffic: 1536 GB/)).toBeTruthy();
    if (traffic.bandwidth_mbps) expect(screen.getAllByText('Bandwidth: 100 Mbps')).toHaveLength(2);
    expect(screen.queryByText(/unlimited|free|verification required|0\.00 USD/i)).toBeNull();
    expect((screen.getByRole('button', { name: 'Add Server' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(approval);
    const submit = screen.getByRole('button', { name: 'Add Server' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await screen.findByRole('alert');
    const [body, key] = vi.mocked(serverOperationsApi.create).mock.calls[0];
    expect(body).toEqual({ quote_id: 'quote', confirm_cost: true, confirm_temporary_billing: false, confirm_delete_source: false });
    expect(key).toEqual(expect.any(String));
    view.unmount();
    const stored = JSON.parse(sessionStorage.getItem('novanet:pending-server-operation')!);
    stored.quote.expiresAt = '2000-01-01';
    sessionStorage.setItem('novanet:pending-server-operation', JSON.stringify(stored));
    const operation: ServerOperation = { id: 'operation', kind: 'add', status: 'queued', phase: 'queued', source_server_id: null,
      destination_server_id: null, counts: { total: 0, verified: 0 }, price: { recurringAmount: null, currency: 'USD' },
      created_at: null, updated_at: null, error_code: null, ongoing_charges: [], allowed_actions: [] };
    vi.mocked(serverOperationsApi.create).mockResolvedValueOnce(operation);
    render(<ServerOperationDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(operation));
    expect(serverOperationsApi.create).toHaveBeenCalledTimes(2);
    expect(vi.mocked(serverOperationsApi.create).mock.calls[1]).toEqual([body, key]);
    expect(serverOperationsApi.quote).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('novanet:pending-server-operation')).toBeNull();
  });
  it('selects LightNode in the actual dialog and reviews explicit hourly evidence',async()=>{
    const billing={kind:'operator_verified_hourly' as const,hourly:.012,monthlyEstimate:7.71,referenceHours:730,currency:'USD',verifiedAt:'2026-11-01T00:00:00Z',source:'Owner LightNode console'};
    vi.mocked(serverOperationsApi.catalog).mockImplementation(async({provider,region})=>region
      ?{provider,region,plans:[{...plan,price:{monthly:7.71,hourly:.012,currency:'USD',billing}}],...metadata}
      :{provider,regions,...metadata});
    vi.mocked(serverOperationsApi.quote).mockResolvedValue({...quote,price:{...quote.price,provider:'lightnode',recurringAmount:7.71,trafficTerms:{...quote.price.trafficTerms,billing}}});
    open([...readiness,{id:'lightnode',ready:true,reason:null,profiles:['dual','vless_only']}]);
    const option=screen.getByRole('option',{name:'LightNode'}) as HTMLOptionElement;expect(option.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Provider'),{target:{value:'lightnode'}});
    await choosePlan();
    expect(screen.getByText(/0.012 USD \/ hour/)).toBeTruthy();
    expect(screen.getByText(/7.71 USD monthly estimate/)).toBeTruthy();
    expect(screen.getByText('Console estimate; billing follows provider terms.')).toBeTruthy();
    expect(screen.queryByText('7.71 USD / month')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Review Quote'}));
    await waitFor(()=>expect(serverOperationsApi.quote).toHaveBeenCalledWith(expect.objectContaining({provider:'lightnode'})));
    await waitFor(()=>expect(screen.getAllByText(/Operator-verified price.*Owner LightNode console/).length).toBe(2));
    expect(serverOperationsApi.create).not.toHaveBeenCalled();
  });
  it('reviews a migration without loading a VPS catalogue or showing pricing controls',async()=>{
    const source={id:'source',name:'Singapore #7',environment:'development',access_pool_id:'pool',supported_protocols:['shadowsocks','vless']} as Server;
    const destination={...source,id:'destination',name:'Singapore #4',status:'active',is_active:true} as Server;
    vi.mocked(serverOperationsApi.quote).mockResolvedValue({...quote,kind:'move_retire',price:null});
    render(<ServerOperationDialog mode="move_retire" source={source} servers={[source,destination]} onClose={()=>{}} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Destination'),{target:{value:'destination'}});
    fireEvent.click(screen.getByRole('button',{name:'Review Migration'}));
    await screen.findByText('No new VPS purchase');
    expect(serverOperationsApi.catalog).not.toHaveBeenCalled();
    expect(serverOperationsApi.quote).toHaveBeenCalledWith({kind:'move_retire',source_server_id:'source',destination_server_id:'destination'});
    expect(screen.queryByText('Approve recurring cost')).toBeNull();
    expect(screen.getByText('Approve deletion of the source VPS after verification')).toBeTruthy();
  });
  it('loads regions and comparable plan details for either vendor without purchasing', async () => {
    open();
    expect((screen.getByRole('button', { name: 'Review Quote' }) as HTMLButtonElement).disabled).toBe(true);
    await choosePlan();
    expect(screen.getByText(/2 vCPU/).textContent).toContain('2048 MB RAM');
    expect(screen.getByText(/50 GB disk/)).toBeTruthy();
    expect(screen.getByText(/12.00 USD \/ month/)).toBeTruthy();
    expect(screen.getByText(/0.018 USD \/ hour/)).toBeTruthy();
    expect(screen.getByText(/2 TB/)).toBeTruthy();
    expect((screen.getByRole('option', { name: /ARM compute/ }) as HTMLOptionElement).disabled).toBe(true);
    expect((screen.getByRole('option', { name: /Full region/ }) as HTMLOptionElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'vultr' } });
    await choosePlan();
    fireEvent.click(screen.getByRole('button', { name: 'Review Quote' }));
    await waitFor(() => expect(serverOperationsApi.quote).toHaveBeenCalledWith(expect.objectContaining({ provider: 'vultr', region: 'ams3', plan_id: 'compute', supported_protocols: ['vless'] })));
    expect(serverOperationsApi.create).not.toHaveBeenCalled();
  });
  it('shows unavailable vendor reasons while leaving the healthy vendor usable', async () => {
    open([readiness[0], { ...readiness[1], ready: false, reason: 'PROVIDER_NOT_CONFIGURED', profiles: [] }]);
    expect(screen.getByText(/Vultr.*PROVIDER_NOT_CONFIGURED/)).toBeTruthy();
    expect((screen.getByRole('option', { name: 'Vultr' }) as HTMLOptionElement).disabled).toBe(true);
    await choosePlan();
    expect((screen.getByRole('button', { name: 'Review Quote' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('aborts and ignores obsolete provider responses even if the transport resolves them', async () => {
    let finish!: (value: RegionCatalog | PlanCatalog) => void;
    vi.mocked(serverOperationsApi.catalog).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }) as ReturnType<typeof serverOperationsApi.catalog>);
    open();
    const signal = vi.mocked(serverOperationsApi.catalog).mock.calls[0][1];
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'vultr' } });
    await screen.findByRole('option', { name: 'Amsterdam' });
    await act(async () => finish({ provider: 'digitalocean', regions: [{ id: 'old', label: 'Obsolete region', available: true }], ...metadata }));
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole('option', { name: 'Obsolete region' })).toBeNull();
  });
  it('ignores old region plans after a faster region change', async () => {
    let finish!: (value: RegionCatalog | PlanCatalog) => void;
    open();
    await screen.findByRole('option', { name: 'Amsterdam' });
    vi.mocked(serverOperationsApi.catalog).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }) as ReturnType<typeof serverOperationsApi.catalog>);
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'ams3' } });
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'fra1' } });
    await screen.findByRole('option', { name: 'General compute' });
    await act(async () => finish({ provider: 'digitalocean', region: 'ams3', plans: [{ ...plan, id: 'old', label: 'Obsolete plan' }], ...metadata }));
    expect(screen.queryByRole('option', { name: 'Obsolete plan' })).toBeNull();
  });
  it.each(['Provider', 'Region', 'Plan', 'Protocols'])('clears the quote and cost approval when %s changes', async field => {
    open(); await choosePlan();
    fireEvent.click(screen.getByRole('button', { name: 'Review Quote' }));
    fireEvent.click(await screen.findByLabelText('Approve recurring cost'));
    const values: Record<string, string> = { Provider: 'vultr', Region: 'fra1', Plan: '', Protocols: 'dual' };
    fireEvent.change(screen.getByLabelText(field), { target: { value: values[field] } });
    expect(screen.queryByLabelText('Approve recurring cost')).toBeNull();
    expect((screen.getByRole('button', { name: 'Add Server' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows errors and empty results, and requests an explicit catalogue refresh', async () => {
    vi.mocked(serverOperationsApi.catalog).mockRejectedValueOnce(new Error('network'));
    open();
    await screen.findByText(/Catalogue unavailable/);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh catalogue' }));
    await screen.findByRole('option', { name: 'Amsterdam' });
    expect(serverOperationsApi.catalog).toHaveBeenLastCalledWith({ provider: 'digitalocean', refresh: true }, expect.any(AbortSignal));
    vi.mocked(serverOperationsApi.catalog).mockResolvedValueOnce({ provider: 'digitalocean', region: 'ams3', plans: [], ...metadata });
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'ams3' } });
    await screen.findByText(/No plans available/);
    expect((screen.getByRole('button', { name: 'Review Quote' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('labels stale data and its observation time, but still requires a fresh quote', async () => {
    vi.mocked(serverOperationsApi.catalog).mockResolvedValueOnce({ provider: 'digitalocean', regions, ...metadata, stale: true });
    open();
    await screen.findByText(/Stale catalogue/);
    expect(screen.getByText(/Observed/).querySelector('time')?.dateTime).toBe(metadata.observed_at);
    expect(serverOperationsApi.quote).not.toHaveBeenCalled();
    expect(serverOperationsApi.create).not.toHaveBeenCalled();
  });
  it('filters plans by search without hiding the selected plan or inventing unknown prices', async () => {
    open(); await choosePlan();
    fireEvent.change(screen.getByLabelText('Search plans'), { target: { value: 'ARM' } });
    expect(screen.getByRole('option', { name: 'General compute' })).toBeTruthy();
    expect(screen.getByRole('option', { name: /ARM compute/ })).toBeTruthy();
    vi.mocked(serverOperationsApi.catalog).mockResolvedValueOnce({ provider: 'digitalocean', region: 'ams3', plans: [{ ...plan, price: { monthly: null, hourly: null, currency: null }, transfer: { included: null, unit: null } }], ...metadata });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh catalogue' }));
    await screen.findByText(/Price unavailable/);
    expect(screen.getByText(/Transfer: Unknown/)).toBeTruthy();
  });
  it('clears quote approval when refreshed capacity removes the selected plan', async () => {
    open(); await choosePlan();
    fireEvent.click(screen.getByRole('button', { name: 'Review Quote' }));
    fireEvent.click(await screen.findByLabelText('Approve recurring cost'));
    vi.mocked(serverOperationsApi.catalog).mockResolvedValueOnce({ provider: 'digitalocean', region: 'ams3', plans: [], ...metadata });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh catalogue' }));
    await screen.findByText(/No plans available/);
    expect(screen.queryByLabelText('Approve recurring cost')).toBeNull();
    expect((screen.getByLabelText('Plan') as HTMLSelectElement).value).toBe('');
  });
  it('passes decimal plan IDs unchanged and shows only safe catalogue error codes', async () => {
    vi.mocked(serverOperationsApi.catalog).mockRejectedValueOnce({ response: { data: { code: 'PROVIDER_CONFIGURATION_REQUIRED', error: 'private upstream details' } } });
    open();
    await screen.findByText(/PROVIDER_CONFIGURATION_REQUIRED/);
    expect(screen.queryByText(/private upstream details/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh catalogue' }));
    await screen.findByRole('option', { name: 'Amsterdam' });
    vi.mocked(serverOperationsApi.catalog).mockResolvedValueOnce({ provider: 'digitalocean', region: 'ams3', plans: [{ ...plan, id: 'vc2-1c-0.5gb' }], ...metadata });
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'ams3' } });
    await screen.findByRole('option', { name: 'General compute' });
    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'vc2-1c-0.5gb' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review Quote' }));
    await waitFor(() => expect(serverOperationsApi.quote).toHaveBeenCalledWith(expect.objectContaining({ plan_id: 'vc2-1c-0.5gb' })));
  });
  it('restores an uncertain purchase independently of current catalogue readiness and only retries on command', async () => {
    const request = { quote_id: 'quote', confirm_cost: true, confirm_temporary_billing: false, confirm_delete_source: false };
    sessionStorage.setItem('novanet:pending-server-operation', JSON.stringify({ key: 'original-key', request, quote: { ...quote, expiresAt: '2000-01-01' }, choice: { kind: 'add', provider: 'vultr', region: 'ams3', plan_id: 'vc2-1c-0.5gb', supported_protocols: ['vless'] } }));
    vi.mocked(serverOperationsApi.create).mockRejectedValue(new Error('timeout'));
    open(readiness.map(p => ({ ...p, ready: false, reason: 'PROVIDER_UNAVAILABLE', profiles: [] })));
    expect(screen.getByText('Submission awaiting confirmation')).toBeTruthy();
    expect((screen.getByLabelText('Provider') as HTMLSelectElement).disabled).toBe(true);
    expect(serverOperationsApi.catalog).not.toHaveBeenCalled();
    expect(serverOperationsApi.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
    await screen.findByRole('alert');
    expect(serverOperationsApi.create).toHaveBeenCalledWith(request, 'original-key');
  });
  it('stops loading when provider readiness is revoked during a catalogue request', async () => {
    vi.mocked(serverOperationsApi.catalog).mockReturnValue(new Promise(() => {}));
    const view = open();
    expect(screen.getByText('Loading regions...')).toBeTruthy();
    view.rerender(<ServerOperationDialog mode="add" servers={[]} providerReadiness={readiness.map(p => ({ ...p, ready: false, reason: 'PROVIDER_UNAVAILABLE' }))} onClose={() => {}} onCreated={vi.fn()} />);
    expect(screen.queryByText('Loading regions...')).toBeNull();
    expect((screen.getByRole('button', { name: 'Review Quote' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
