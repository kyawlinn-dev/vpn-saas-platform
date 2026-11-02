import { api } from '@/lib/api';

export type OperationKind = 'add' | 'replace' | 'move_retire';
export interface ServerOperation {
  billing_assurance?: {scope:'instance-package';external_attachments_verified:false};
  retire_only?: boolean;
  id: string; kind: OperationKind; status: string; phase: string;
  source_server_id: string | null; destination_server_id: string | null;
  counts: { total: number; verified: number };
  price: { recurringAmount: number | null; currency: string } | null;
  created_at: string | null; updated_at: string | null; error_code: string | null;
  retirement_check?: string; retirement_cause?: string;
  ongoing_charges: { id: string | null; type: string; amount: number | null; currency: string | null }[];
  allowed_actions: ('resume' | 'cancel')[];
}
export interface ProviderOption { id: 'digitalocean' | 'vultr' | 'lightnode'; regions: { id: string; label: string; plans: { id: string; label: string }[] }[] }
export type ProviderId = ProviderOption['id'];
export type ProtocolProfile = 'dual' | 'vless_only';
export interface ProviderReadiness { id: ProviderId; ready: boolean; reason: string | null; profiles: ProtocolProfile[] }
export interface CatalogRegion { id: string; label: string; available: boolean }
// Backend operator evidence, not a provider API monetary-price assertion.
export interface OperatorVerifiedHourlyBilling {
  kind: 'operator_verified_hourly'; hourly: number; monthlyEstimate: number;
  referenceHours: number; currency: string; verifiedAt: string; source: string;
}
export interface ProviderPricingBilling {
  kind: 'provider_pricing'; source: string;
}
export type ProviderBilling = ProviderPricingBilling | OperatorVerifiedHourlyBilling;
export interface CatalogPlan {
  id: string; label: string; cpu: number | null; memory_mb: number | null; disk_gb: number | null;
  transfer: { included: number | null; unit: string | null };
  bandwidth_mbps?: number | null;
  price: { monthly: number | null; hourly: number | null; currency: string | null; billing?: ProviderBilling };
  available: boolean; compatible: boolean; reason: string | null; architecture: string | null; family: string | null;
}
interface CatalogSnapshot { provider: ProviderId; observed_at: string | null; stale: boolean }
export interface RegionCatalog extends CatalogSnapshot { regions: CatalogRegion[] }
export interface PlanCatalog extends CatalogSnapshot { region: string; plans: CatalogPlan[] }
export interface CatalogQuery { provider: ProviderId; region?: string; refresh?: boolean }
export interface OperationList { enabled: boolean; recovery_enabled?: boolean; public_access_enabled: boolean; reason: string | null; provider_readiness?: ProviderReadiness[]; options?: ProviderOption[]; operations: ServerOperation[] }
export interface QuoteChoice { kind: OperationKind; retire_only?: true; source_server_id?: string; destination_server_id?: string; provider?: string; region?: string; plan_id?: string; supported_protocols?: string[] }
export interface OperationQuote {
  retire_only?: boolean;
  id: string; kind: OperationKind; source_server_id: string | null; destination_server_id: string | null; supported_protocols: string[];
  price: { provider: string; region: string; planId: string; currency: string; recurringAmount: number | null; trafficTerms: { included: number | null; unit: string | null; bandwidth_mbps?: number | null; overageAmount: number | null; billing?: ProviderBilling } } | null;
  temporary_billing_overlap: boolean; expiresAt: string;
}
export interface CreateRequest { quote_id: string; confirm_cost: boolean; confirm_temporary_billing: boolean; confirm_delete_source: boolean }
export const serverOperationsApi = {
  list: async (signal?: AbortSignal): Promise<OperationList> => (await api.get('/admin/server-operations', { signal })).data,
  catalog: async ({ provider, region, refresh }: CatalogQuery, signal?: AbortSignal): Promise<RegionCatalog | PlanCatalog> =>
    (await api.get('/admin/server-operations/catalog', { params: { provider, ...(region ? { region } : {}), ...(refresh ? { refresh: true } : {}) }, signal })).data,
  quote: async (choice: QuoteChoice): Promise<OperationQuote> => (await api.post('/admin/server-operations/quotes', choice)).data.quote,
  create: async (request: CreateRequest, key: string): Promise<ServerOperation> => (await api.post('/admin/server-operations', request, { headers: { 'Idempotency-Key': key } })).data.operation,
  get: async (id: string, signal?: AbortSignal): Promise<ServerOperation> => (await api.get(`/admin/server-operations/${encodeURIComponent(id)}`, { signal })).data.operation,
  control: async (id: string, action: 'resume' | 'cancel'): Promise<ServerOperation> => (await api.post(`/admin/server-operations/${encodeURIComponent(id)}/${action}`, {})).data.operation,
};
