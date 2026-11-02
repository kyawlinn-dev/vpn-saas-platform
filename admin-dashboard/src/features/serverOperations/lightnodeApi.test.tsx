import { describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { serverOperationsApi, type OperationQuote, type ProviderPricingBilling, type PlanCatalog } from './api';
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

describe('LightNode admin DTO passthrough', () => {
  const billing: ProviderPricingBilling = { kind: 'provider_pricing', source: 'https://doc.lightnode.com/Instance/Billingdescription.html' };
  it('requests a non-Tokyo LightNode catalogue and preserves nullable provider pricing', async () => {
    const catalog: PlanCatalog = { provider: 'lightnode', region: 'ams3', observed_at: null, stale: false, plans: [{
      id: 'fixture', label: 'Fixture', cpu: 1, memory_mb: 2048, disk_gb: 50, transfer: { included: 1000, unit: 'GB' },
      price: { monthly: null, hourly: null, currency: 'USD', billing }, available: true, compatible: true,
      reason: null, architecture: 'x86_64', family: 'intel',
    }] };
    vi.mocked(api.get).mockResolvedValueOnce({ data: catalog });
    const result = await serverOperationsApi.catalog({ provider: 'lightnode', region: 'ams3' });
    expect(api.get).toHaveBeenLastCalledWith('/admin/server-operations/catalog', { params: { provider: 'lightnode', region: 'ams3' }, signal: undefined });
    expect(result).toEqual(catalog);
  });
  it('preserves quote.price.trafficTerms.billing without rewriting the quote request', async () => {
    const quote: OperationQuote = { id: 'fixture', kind: 'add', source_server_id: null, destination_server_id: null,
      supported_protocols: ['vless'], temporary_billing_overlap: false, expiresAt: '2099-01-01', price: {
        provider: 'lightnode', region: 'ams3', planId: 'fixture', recurringAmount: null, currency: 'USD',
        trafficTerms: { included: 1000, unit: 'GB', overageAmount: null, billing },
      } };
    vi.mocked(api.post).mockResolvedValueOnce({ data: { quote } });
    const choice = { kind: 'add' as const, provider: 'lightnode', region: 'ams3', plan_id: 'fixture', supported_protocols: ['vless'] };
    expect(await serverOperationsApi.quote(choice)).toEqual(quote);
    expect(api.post).toHaveBeenLastCalledWith('/admin/server-operations/quotes', choice);
  });
});
