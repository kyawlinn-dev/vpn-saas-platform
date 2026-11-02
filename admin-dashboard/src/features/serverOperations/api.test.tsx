import { describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { serverOperationsApi } from './api';
vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));
describe('server catalogue request', () => {
  it('passes optional region, explicit refresh and abort signal as query configuration', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { provider: 'vultr', regions: [], observed_at: null, stale: false } });
    const signal = new AbortController().signal;
    await serverOperationsApi.catalog({ provider: 'vultr', region: 'nrt', refresh: true }, signal);
    expect(api.get).toHaveBeenLastCalledWith('/admin/server-operations/catalog', { params: { provider: 'vultr', region: 'nrt', refresh: true }, signal });
    await serverOperationsApi.catalog({ provider: 'digitalocean' });
    expect(api.get).toHaveBeenLastCalledWith('/admin/server-operations/catalog', { params: { provider: 'digitalocean' }, signal: undefined });
  });
});
