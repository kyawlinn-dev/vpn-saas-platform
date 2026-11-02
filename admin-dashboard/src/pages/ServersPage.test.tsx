import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ServersPage } from './ServersPage';
import { serverOperationsApi } from '@/features/serverOperations/api';
import type { Server } from '@/types/api';
vi.mock('@/features/serverOperations/api', () => ({ serverOperationsApi: { list: vi.fn(), get: vi.fn() } }));
const server = { id: 'one', name: 'Singapore', status: 'active', current_active_keys: 3, max_active_keys: 50, supported_protocols: ['vless'], is_active: true, access_pool_id: 'public-pool', environment: 'development' } as Server;
afterEach(() => { cleanup(); sessionStorage.clear(); vi.clearAllMocks(); });
describe('server lifecycle page', () => {
  it('shows maintenance without claiming the running node is disabled', async () => {
    vi.mocked(serverOperationsApi.list).mockResolvedValue({ enabled: true, reason: null, public_access_enabled: true, operations: [] });
    render(<ServersPage servers={[{ ...server, under_maintenance: true }]} onSuccess={vi.fn()} />);
    expect(await screen.findByText('Under Maintenance')).toBeTruthy();
    expect(screen.getByText('Published')).toBeTruthy();
  });
  it('shows the public ordinal and flag while keeping pool identifiers out of the fleet summary', async () => {
    vi.mocked(serverOperationsApi.list).mockResolvedValue({ enabled: true, reason: null, public_access_enabled: true, operations: [] });
    render(<ServersPage servers={[{ ...server, name: 'Frankfurt #1', region: 'fra', display_city: 'Frankfurt',
      display_country: 'Germany', flag_emoji: '🇩🇪', provider_resource_id: 'private-instance-id' }]} onSuccess={vi.fn()} />);
    expect(await screen.findByText('🇩🇪 Frankfurt #1')).toBeTruthy();
    expect(screen.getByText('Development pool')).toBeTruthy();
    expect(screen.queryByText('Pool: public-pool / development')).toBeNull();
    expect(screen.queryByText('private-instance-id')).toBeNull();
  });
  it('keeps VLESS retirement available without new-purchase readiness', async () => {
    vi.mocked(serverOperationsApi.list).mockResolvedValue({ enabled: false, recovery_enabled: true, reason: 'PROVIDERS_UNAVAILABLE', public_access_enabled: true, operations: [] });
    render(<ServersPage servers={[{ ...server, lifecycle_protected: false }]} onSuccess={vi.fn()} />);
    await screen.findByText('Infrastructure execution disabled');
    fireEvent.click(screen.getByRole('button', { name: 'Server actions' }));
    const action = screen.getByText('Retire server');
    expect(action.closest('button')?.disabled).toBe(false);
    fireEvent.click(action);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
  it('retains an explicit move-and-retire action for dual nodes', async () => {
    vi.mocked(serverOperationsApi.list).mockResolvedValue({enabled:true,public_access_enabled:true,reason:null,operations:[]});
    render(<ServersPage servers={[{...server,lifecycle_protected:false,supported_protocols:['shadowsocks','vless']}]} onSuccess={vi.fn()} />);
    await screen.findByText('Public Nodes');
    fireEvent.click(screen.getByRole('button',{name:'Server actions'}));
    expect(screen.getByText('Move and retire')).toBeTruthy();
    expect(screen.queryByText('Retire server')).toBeNull();
  });
  it('offers pending submission recovery after refresh even when providers are unavailable', async () => {
    sessionStorage.setItem('novanet:pending-server-operation', JSON.stringify({ key: 'original-key', request: { quote_id: 'quote' }, quote: { id: 'quote', kind: 'add' }, choice: { kind: 'add', provider: 'vultr' } }));
    vi.mocked(serverOperationsApi.list).mockResolvedValue({ enabled: false, reason: 'RUNTIME_UNAVAILABLE', public_access_enabled: false, operations: [], provider_readiness: [] });
    render(<ServersPage servers={[server]} onSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Recover pending submission' }));
    expect(screen.getByText('Submission awaiting confirmation')).toBeTruthy();
  });
  it('shows each provider independently and keeps Add usable for a ready vendor', async () => {
    vi.mocked(serverOperationsApi.list).mockResolvedValue({ enabled: true, reason: null, public_access_enabled: true, operations: [], provider_readiness: [
      { id: 'digitalocean', ready: true, reason: null, profiles: ['dual', 'vless_only'] },
      { id: 'vultr', ready: false, reason: 'PROVIDER_NOT_CONFIGURED', profiles: [] },
    ] });
    render(<ServersPage servers={[server]} onSuccess={vi.fn()} />);
    await screen.findByText(/Vultr.*PROVIDER_NOT_CONFIGURED/);
    expect(screen.getByText(/DigitalOcean.*Ready/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add Server' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('explains Add unavailability when every provider is unavailable', async () => {
    vi.mocked(serverOperationsApi.list).mockResolvedValue({ enabled: true, reason: null, public_access_enabled: false, operations: [], provider_readiness: [
      { id: 'digitalocean', ready: false, reason: 'PROVIDER_NOT_CONFIGURED', profiles: [] },
      { id: 'vultr', ready: false, reason: 'PROVIDER_UNAVAILABLE', profiles: [] },
    ] });
    render(<ServersPage servers={[server]} onSuccess={vi.fn()} />);
    await screen.findByText(/No provider is ready/);
    expect((screen.getByRole('button', { name: 'Add Server' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('disables infrastructure commands when runtime is absent', async () => {
    vi.mocked(serverOperationsApi.list).mockResolvedValue({ enabled: false, reason: 'NOT_CONFIGURED', public_access_enabled: false, options: [], operations: [] });
    render(<ServersPage servers={[server]} onSuccess={vi.fn()} />);
    await screen.findByText('Infrastructure execution disabled');
    expect((screen.getByRole('button', { name: 'Add Server' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows public capabilities and removes legacy tier commands under public policy', async () => {
    vi.mocked(serverOperationsApi.list).mockResolvedValue({ enabled: true, reason: null, public_access_enabled: true, options: [], operations: [] });
    render(<ServersPage servers={[server]} onSuccess={vi.fn()} />);
    await screen.findByText('Public Nodes');
    expect(screen.getByText('VLESS Only')).toBeTruthy();
    expect(screen.getByText('Published')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Server actions' }));
    expect(screen.queryByText('Mark as trial')).toBeNull();
    expect(screen.queryByText('Mark as premium')).toBeNull();
    expect(screen.getByText('Replace server')).toBeTruthy();
  });
});
