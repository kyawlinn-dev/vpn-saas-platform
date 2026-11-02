import { describe, expect, it, vi } from "vitest";
import { quoteOperation, createOperationCommand, toOperationResponse } from "../services/infrastructure/operations.js";
import { createAdminServerOperationsRouter } from "../routes/admin/adminServerOperationsRouter.js";
import { infrastructureFixture } from "./fixtures/infrastructure.js";
import { createCommandRepository } from '../services/infrastructure/commandRepository.js';
import { payloadHash } from '../services/infrastructure/repository.js';

async function fixture() {
  const f = await infrastructureFixture(); const quotes = new Map();
  const sourceId = "11111111-1111-4111-8111-111111111111";
  const source = f.own("server", sourceId, { provider: "digitalocean", provider_resource_id: "vm", panel_node_id: "51", lifecycle_protected: false, supported_protocols: ["shadowsocks", "vless"], addresses: f.resource.addresses });
  const price = { provider: "digitalocean", accountId: "account", region: "sgp1", planId: "small", currency: "USD", recurringAmount: 6, trafficTerms: { included: 1000, unit: "GB", overageAmount: null, source: "catalog" }, expiresAt: new Date(Date.now() + 600000).toISOString(), hash: "provider-hash" };
  let existing = null;
  const repository = { getServer: vi.fn(async () => source), storeQuote: vi.fn(async q => { quotes.set(q.id, q); return q; }), getQuote: vi.fn(async ({ quoteId }) => quotes.get(quoteId)),
    findByIdempotencyKey: vi.fn(async () => existing),
    createQuotedOperation: vi.fn(async ({ payload, kind }) => { existing = { id: "op", kind, status: "queued", stage: "queued", payload, checkpoint: {} }; return existing; }) };
  const runtime = { context: f.context, executionReady: true, currency: "USD", repository,
    providers: { digitalocean: { quote: vi.fn(async () => price), inspect: vi.fn(async () => f.resource) } } };
  return { ...f, runtime, sourceId, price };
}
describe("admin server operation commands", () => {
  it('reviews and admits explicitly provider-billed LightNode without a monetary rate',async()=>{
    const f=await fixture();f.price.provider='lightnode';f.price.recurringAmount=null;
    f.price.trafficTerms.billing={kind:'provider_pricing',source:'https://doc.lightnode.com/Instance/Billingdescription.html',secret:'not-public'};
    f.price.trafficTerms.specs={billing_mode:'PayByBandwidth',bandwidth_mbps:2};
    f.runtime.providers.lightnode={quote:async()=>f.price};
    const q=await quoteOperation(f.runtime,{kind:'add',provider:'lightnode',region:'sgp1',plan_id:'small',supported_protocols:['vless']});
    expect(q.price.recurringAmount).toBeNull();expect(q.price.trafficTerms.billing).toEqual({kind:'provider_pricing',source:'https://doc.lightnode.com/Instance/Billingdescription.html'});
    expect(q.price.trafficTerms).toMatchObject({billing_mode:'PayByBandwidth',bandwidth_mbps:2});
    await expect(createOperationCommand(f.runtime,{quote_id:q.id,confirm_cost:true},'unpriced-lightnode')).resolves.toMatchObject({kind:'add'});
  });
  it('still rejects an unavailable monetary rate for DO even with a provider-pricing marker',async()=>{
    const f=await fixture();f.price.recurringAmount=null;f.price.trafficTerms.billing={kind:'provider_pricing',source:'https://doc.lightnode.com/Instance/Billingdescription.html'};
    await expect(quoteOperation(f.runtime,{kind:'add',provider:'digitalocean',region:'sgp1',plan_id:'small',supported_protocols:['vless']})).rejects.toMatchObject({code:'QUOTE_UNAVAILABLE'});
  });
  it('accepts LightNode quotes and exposes only explicit hourly price evidence',async()=>{
    const f=await fixture();
    f.price.provider='lightnode';f.price.region='jp-tokyo-1';f.price.planId='intel-c1m2-bgp-t1000-s50-d0';
    f.price.trafficTerms.billing={kind:'operator_verified_hourly',hourly:0.012,monthlyEstimate:7.71,referenceHours:730,currency:'USD',verifiedAt:'2026-11-01T00:00:00Z',source:'LightNode console'};
    f.price.trafficTerms.password='must-not-be-exposed';
    f.runtime.providers.lightnode={quote:async()=>f.price};
    const q=await quoteOperation(f.runtime,{kind:'add',provider:'lightnode',region:f.price.region,plan_id:f.price.planId,supported_protocols:['vless']});
    expect(q.price.trafficTerms.billing).toEqual(f.price.trafficTerms.billing);
    expect(JSON.stringify(q)).not.toContain('must-not-be-exposed');
  });
  async function retireFixture() {
    const f = await fixture();
    const source = f.records.get(`server:${f.sourceId}`);
    source.supported_protocols = ['vless']; source.current_active_keys = 2;
    const destination = f.own('server', '22222222-2222-4222-8222-222222222222', {
      supported_protocols: ['vless'], lifecycle_protected: false, status: 'active', is_active: true,
      current_active_keys: 1, max_active_keys: 100, server_health_status: { outline_api_status: 'healthy' },
    });
    f.runtime.repository.listRetirementCandidates = vi.fn(async () => [destination]);
    f.runtime.repository.getServer.mockImplementation(async ({serverId}) => serverId === f.sourceId ? source : destination);
    return {...f, source, destination, choice: {kind:'move_retire', source_server_id:f.sourceId, retire_only:true}};
  }
  it('reviews retire-only with an immutable automatic fallback, no pricing and explicit deletion consent', async () => {
    const f = await retireFixture(); f.runtime.executionReady=false; f.runtime.recoveryReady=true;
    const q = await quoteOperation(f.runtime, f.choice);
    expect(q).toMatchObject({kind:'move_retire', retire_only:true, destination_server_id:f.destination.id, price:null});
    await expect(createOperationCommand(f.runtime,{quote_id:q.id},'retire')).rejects.toMatchObject({code:'CONFIRMATION_REQUIRED'});
    const request={quote_id:q.id,confirm_delete_source:true};
    const op=await createOperationCommand(f.runtime,request,'retire');
    expect(op.retire_only).toBe(true);
    expect(f.runtime.repository.createQuotedOperation.mock.calls[0][0].payload).toMatchObject({retire_only:true,destination_server_id:f.destination.id});
    expect(await createOperationCommand(f.runtime,request,'retire')).toEqual(op);
    expect(f.runtime.providers.digitalocean.quote).not.toHaveBeenCalled();
    expect(f.runtime.repository.createQuotedOperation).toHaveBeenCalledTimes(1);
  });
  it('rejects retire-only for dual sources or a caller-supplied destination', async () => {
    const f=await retireFixture();
    await expect(quoteOperation(f.runtime,{...f.choice,destination_server_id:f.destination.id})).rejects.toMatchObject({code:'INVALID_OPERATION_INPUT'});
    f.source.supported_protocols=['shadowsocks','vless'];
    await expect(quoteOperation(f.runtime,f.choice)).rejects.toMatchObject({code:'INVALID_OPERATION_INPUT'});
    f.source.lifecycle_protected=true;
    await expect(quoteOperation(f.runtime,f.choice)).rejects.toMatchObject({code:'PROTECTED_RESOURCE'});
  });
  it('fails closed without a healthy scoped fallback with room for source anchors', async () => {
    const f=await retireFixture();
    for (const change of [{status:'draining'}, {poolId:'foreign'}, {max_active_keys:2}, {server_health_status:{outline_api_status:'error'}}]) {
      f.runtime.repository.listRetirementCandidates.mockResolvedValue([{...f.destination,...change}]);
      await expect(quoteOperation(f.runtime,f.choice)).rejects.toMatchObject({code:'RETIREMENT_FALLBACK_UNAVAILABLE'});
    }
    f.runtime.repository.listRetirementCandidates.mockResolvedValue([]);
    await expect(quoteOperation(f.runtime,f.choice)).rejects.toMatchObject({code:'RETIREMENT_FALLBACK_UNAVAILABLE'});
    expect(f.runtime.repository.storeQuote).not.toHaveBeenCalled();
  });
  it('prefers an eligible default and rechecks the chosen fallback before enqueue', async () => {
    const f=await retireFixture();
    const preferred=f.own('server','33333333-3333-4333-8333-333333333333',{...f.destination,id:'33333333-3333-4333-8333-333333333333',is_default:true});
    f.runtime.repository.listRetirementCandidates.mockResolvedValue([f.destination,preferred]);
    f.runtime.repository.getServer.mockImplementation(async ({serverId})=>serverId===f.sourceId?f.source:preferred);
    const q=await quoteOperation(f.runtime,f.choice);
    expect(q.destination_server_id).toBe(preferred.id);
    preferred.is_active=false;
    await expect(createOperationCommand(f.runtime,{quote_id:q.id,confirm_delete_source:true},'retire')).rejects.toMatchObject({code:'DESTINATION_NOT_READY'});
    expect(f.runtime.repository.createQuotedOperation).not.toHaveBeenCalled();
  });
  it('rejects stale retire-only source capabilities instead of moving SS users automatically', async () => {
    const f=await retireFixture();
    const q=await quoteOperation(f.runtime,f.choice);
    f.source.supported_protocols=['shadowsocks','vless'];
    await expect(createOperationCommand(f.runtime,{quote_id:q.id,confirm_delete_source:true},'retire')).rejects.toMatchObject({code:'INVALID_OPERATION_INPUT'});
    expect(f.runtime.repository.createQuotedOperation).not.toHaveBeenCalled();
  });
  it.each([false,'true',null])('rejects malformed retire-only flag %s',async flag=>{
    const f=await retireFixture();
    await expect(quoteOperation(f.runtime,{...f.choice,retire_only:flag})).rejects.toMatchObject({code:'INVALID_OPERATION_INPUT'});
  });
  it('reviews and enqueues a shared-destination move without provider pricing or purchase approval',async()=>{
    const f=await fixture(),id='22222222-2222-4222-8222-222222222222';
    const destination=f.own('server',id,{protected:true,method:'owner_authorized_access_adoption',manifestHash:'manifest',
      provider_resource_id:null,panel_node_id:52,addresses:['198.51.100.52'],supported_protocols:['shadowsocks','vless']});
    Object.assign(destination,{host_ip:'198.51.100.52',lifecycle_protected:true,status:'active',is_active:true,current_active_keys:1,max_active_keys:100,
      server_health_status:{outline_api_status:'healthy'},ownership_provenance:{method:'adopted',purpose:'owner_authorized_shared_node_customer_access',manifest_hash:'manifest'}});
    f.runtime.repository.getServer.mockImplementation(async({serverId})=>serverId===id?destination:f.records.get(`server:${f.sourceId}`));
    f.runtime.executionReady=false;f.runtime.recoveryReady=true;
    const review=await quoteOperation(f.runtime,{kind:'move_retire',source_server_id:f.sourceId,destination_server_id:id});
    expect(review.price).toBeNull();
    await expect(createOperationCommand(f.runtime,{quote_id:review.id,confirm_delete_source:true},'move-request')).resolves.toMatchObject({kind:'move_retire'});
    expect(f.runtime.providers.digitalocean.quote).not.toHaveBeenCalled();
    expect(destination.lifecycle_protected).toBe(true);
  });
  it('distinguishes purchase readiness from recovery without hiding history', async () => {
    const f = await fixture(); f.runtime.executionReady = false; f.runtime.recoveryReady = true;
    f.runtime.repository.listOperations = vi.fn(async () => []);
    const router = createAdminServerOperationsRouter({ resolveRuntime: async () => f.runtime });
    const layer = router.stack.find(row => row.route?.path === '/' && row.route.methods.get);
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await layer.route.stack[0].handle({ app: { locals: {} } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, recovery_enabled: true, operations: [] }));
    expect(f.runtime.repository.listOperations).toHaveBeenCalled();
  });
  it('serves catalogue before the operation-ID route and validates selectors', async () => {
    const f = await fixture();
    f.runtime.getCatalog = vi.fn(async () => ({ provider: 'vultr', regions: [], stale: false }));
    const router = createAdminServerOperationsRouter({ resolveRuntime: async () => f.runtime });
    const layer = router.stack.find(row => row.route?.path === '/catalog');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await layer.route.stack[0].handle({ query: { provider: 'vultr', refresh: 'true' } }, res);
    expect(f.runtime.getCatalog).toHaveBeenCalledWith({ provider: 'vultr', region: undefined, refresh: true });
    expect(res.json).toHaveBeenCalledWith({ provider: 'vultr', regions: [], stale: false });
    await layer.route.stack[0].handle({ query: { provider: 'vultr', region: '../bad' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(f.runtime.getCatalog).toHaveBeenCalledTimes(1);
  });
  it('rejects an unavailable provider/profile before accepting a quote',async()=>{
    const f=await fixture();
    f.runtime.assertProvisionable=vi.fn(async()=>{throw Object.assign(new Error('PROVIDER_UNAVAILABLE'),{code:'PROVIDER_UNAVAILABLE'});});
    await expect(quoteOperation(f.runtime,{kind:'add',provider:'vultr',region:'sgp',plan_id:'small',supported_protocols:['vless']})).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
    expect(f.runtime.repository.storeQuote).not.toHaveBeenCalled();
  });
  it("preserves the complete hashed provider quote in the private operation payload", async () => {
    const f = await fixture();
    Object.assign(f.price, { environment: f.context.environment, databaseIdentity: f.context.databaseIdentity, panelIdentity: f.context.panelIdentity, poolId: f.context.poolId });
    const { hash: _hash, ...body } = f.price;
    f.price.hash = payloadHash(body);
    const q = await quoteOperation(f.runtime, { kind: 'add', provider: 'digitalocean', region: 'sgp1', plan_id: 'small', supported_protocols: ['vless'] });
    await createOperationCommand(f.runtime, { quote_id: q.id, confirm_cost: true }, 'key');
    expect(f.runtime.repository.createQuotedOperation.mock.calls[0][0].payload.quote).toEqual(f.price);
    const { hash, ...persisted } = f.runtime.repository.createQuotedOperation.mock.calls[0][0].payload.quote;
    expect(payloadHash(persisted)).toBe(hash);
    expect(q.price).not.toHaveProperty('hash');
    expect(q.price).not.toHaveProperty('databaseIdentity');
  });
  it("loads related destination health when resolving a command server", async () => {
    const f = await fixture();
    const select = vi.fn(() => query);
    const query = { select, eq: () => query, maybeSingle: async () => ({ data: { id: 'destination', access_pool_id: f.context.poolId, ownership_provenance: { panel_identity: f.context.panelIdentity }, server_health_status: { outline_api_status: 'healthy' } } }) };
    const repository = createCommandRepository({ client: { from: () => query } });
    const server = await repository.getServer({ context: f.context, serverId: 'destination' });
    expect(select).toHaveBeenCalledWith('*,server_health_status(outline_api_status)');
    expect(server.server_health_status.outline_api_status).toBe('healthy');
  });
  it("stores a server-resolved quote and enqueues one operation without provisioning", async () => {
    const f = await fixture();
    const quote = await quoteOperation(f.runtime, { kind: "replace", source_server_id: f.sourceId, provider: "digitalocean", region: "sgp1", plan_id: "small", supported_protocols: ["shadowsocks", "vless"] });
    const input = { quote_id: quote.id, confirm_cost: true, confirm_temporary_billing: true, confirm_delete_source: true };
    const first = await createOperationCommand(f.runtime, input, "same-request");
    expect(first.id).toBe("op");
    f.runtime.executionReady = false; f.runtime.recoveryReady = true;
    expect(await createOperationCommand(f.runtime, input, "same-request")).toEqual(first);
    expect(f.runtime.repository.createQuotedOperation).toHaveBeenCalledTimes(1);
  });
  it.each(["confirm_cost", "confirm_temporary_billing", "confirm_delete_source"])("requires %s for replacement", async field => {
    const f = await fixture(); const q = await quoteOperation(f.runtime, { kind: "replace", source_server_id: f.sourceId, provider: "digitalocean", region: "sgp1", plan_id: "small", supported_protocols: ["shadowsocks", "vless"] });
    await expect(createOperationCommand(f.runtime, { quote_id: q.id, confirm_cost: true, confirm_temporary_billing: true, confirm_delete_source: true, [field]: false }, "key")).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
  });
  it("rejects expired quotes, changed prices, wrong currency and arbitrary SSH/provider IDs", async () => {
    const f = await fixture();
    await expect(quoteOperation(f.runtime, { kind: "add", provider_resource_id: "controller", ssh_command: "run" })).rejects.toMatchObject({ code: "INVALID_OPERATION_INPUT" });
    f.price.currency = "EUR";
    await expect(quoteOperation(f.runtime, { kind: "add", provider: "digitalocean", region: "sgp1", plan_id: "small", supported_protocols: ["vless"] })).rejects.toMatchObject({ code: "QUOTE_CURRENCY_MISMATCH" });
    f.price.currency = "USD";
    const q = await quoteOperation(f.runtime, { kind: "add", provider: "digitalocean", region: "sgp1", plan_id: "small", supported_protocols: ["vless"] });
    f.price.recurringAmount = 12;
    await expect(createOperationCommand(f.runtime, { quote_id: q.id, confirm_cost: true }, "key")).rejects.toMatchObject({ code: "QUOTE_CHANGED" });
    f.runtime.repository.getQuote.mockResolvedValue({ ...q, expiresAt: "2000-01-01" });
    await expect(createOperationCommand(f.runtime, { quote_id: q.id, confirm_cost: true }, "key")).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
  });
  it("never quotes a protected server and cannot enable missing runtime", async () => {
    const f = await fixture(); f.runtime.repository.getServer.mockResolvedValue({ lifecycle_protected: true });
    await expect(quoteOperation(f.runtime, { kind: "replace", source_server_id: f.sourceId, provider: "digitalocean", region: "sgp1", plan_id: "small", supported_protocols: ["vless"] })).rejects.toMatchObject({ code: "PROTECTED_RESOURCE" });
    await expect(quoteOperation(null, {})).rejects.toMatchObject({ code: "INFRASTRUCTURE_EXECUTION_DISABLED" });
  });
  it("allowlists response fields and does not expose raw checkpoints, keys or provider errors", () => {
    expect(toOperationResponse({checkpoint:{error_code:'RETIREMENT_BLOCKED',retirement_check:'inventory',retirement_cause:'INVENTORY_BLOCKED'}}))
      .toMatchObject({retirement_check:'inventory',retirement_cause:'INVENTORY_BLOCKED'});
    expect(JSON.stringify(toOperationResponse({checkpoint:{error_code:'RETIREMENT_BLOCKED',retirement_check:'secret-payload',retirement_cause:'secret'}}))).not.toContain('secret');
    const result = toOperationResponse({ id: "op", kind: "replace", status: "blocked", stage: "migrating", payload: { password: "secret" }, checkpoint: { privateKey: "secret", error_code: "api-token-secret", totalItems: 2 } });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result.allowed_actions).toContain("resume");
    expect(toOperationResponse({ checkpoint: { error_code: 'FIREWALL_POLICY_UNVERIFIED' } }).error_code).toBe('FIREWALL_POLICY_UNVERIFIED');
  });
  it("denies reseller/customer callers even if invoked without the outer admin mount", async () => {
    const router = createAdminServerOperationsRouter();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
    await router.stack[0].handle({ user: { id: "reseller" } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
  });
});
