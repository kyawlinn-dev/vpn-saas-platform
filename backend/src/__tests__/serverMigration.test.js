import { describe, expect, it, vi } from "vitest";
import { migrateAccessItem, replaceManagedEndpoints } from "../services/infrastructure/migration.js";
import { infrastructureFixture } from "./fixtures/infrastructure.js";

async function fixture() {
  const f = await infrastructureFixture();
  const source = f.own("server", "source", { marzneshin_service_ids: [501], supported_protocols: ["shadowsocks", "vless"] });
  const destination = f.own("server", "destination", { marzneshin_service_ids: [503], supported_protocols: ["shadowsocks", "vless"] });
  f.own("user", "user");
  f.own("service", "501"); f.own("service", "503"); f.own("service", "502");
  let checkpoint = null;
  const key = { id: "key", order_id: "order", customer_id: "customer", reseller_id: "reseller", server_id: "source", protocol: "shadowsocks", status: "active", outline_key_id: "user", access_url: "unchanged-link", used_bytes: 42, data_limit_bytes: 1000 };
  const order = { id: "order", customer_id: "customer", reseller_id: "reseller", status: "active", expiry_date: "2099-01-01", quota_limit_bytes: 1000, usage_baseline_bytes: 0 };
  const user = { id: "user", key: "subscription-key", service_ids: [501], used_traffic: 42, data_limit: 1000, expire_date: "2099-01-01", expire_strategy: "fixed_date", data_limit_reset_strategy: "no_reset", enabled: true, version: 1 };
  const item = { kind: "access", keyId: key.id, orderId: order.id, customerId: key.customer_id, resellerId: key.reseller_id, protocol: "shadowsocks", userId: "user", sourceServiceIds: [501], expectedKey: structuredClone(key), expectedOrder: structuredClone(order) };
  const repository = { readMigrationState: vi.fn(async () => checkpoint),
    saveMigrationState: vi.fn(async input => { checkpoint = structuredClone(input.checkpoint); }),
    readScopedAccess: vi.fn(async () => ({ key: structuredClone(key), order: structuredClone(order) })),
    moveKeyAnchor: vi.fn(async ({ patch }) => { Object.assign(key, patch); }),
    repairAssignments: vi.fn(), verifyAssignments: vi.fn(async () => true) };
  const panel = { readUser: vi.fn(async () => structuredClone(user)),
    updateUserServices: vi.fn(async ({ serviceIds }) => { user.service_ids = serviceIds; user.used_traffic++; user.version++; }) };
  return { ...f, lease: f.operation, source, destination, item, key, order, user, repository, panel };
}
describe("checkpointed in-place server migration", () => {
  function sharedDestination(f){
    Object.assign(f.destination,{lifecycle_protected:true,provider_resource_id:null,panel_node_id:52,host_ip:'198.51.100.52',
      ownership_provenance:{method:'adopted',purpose:'owner_authorized_shared_node_customer_access',manifest_hash:'manifest'}});
    f.records.set('server:destination',{...f.destination,protected:true,method:'owner_authorized_access_adoption',manifestHash:'manifest',addresses:[f.destination.host_ip]});
  }
  it('moves only the customer into an access-authorized shared destination service without claiming the service',async()=>{
    const f=await fixture();sharedDestination(f);f.records.delete('service:503');
    f.panel.verifyDestinationService=vi.fn(async()=>true);
    await expect(migrateAccessItem(f)).resolves.toMatchObject({status:'verified'});
    expect(f.user.service_ids).toEqual([503]);
    expect(f.panel.updateUserServices).toHaveBeenCalledWith(expect.objectContaining({destination:f.destination}));
    expect(f.records.has('service:503')).toBe(false);
  });
  it('does not bypass service verification for an unverified shared destination',async()=>{
    const f=await fixture();sharedDestination(f);f.records.delete('service:503');
    f.panel.verifyDestinationService=vi.fn(async()=>false);
    await expect(migrateAccessItem(f)).rejects.toThrow();
    expect(f.panel.updateUserServices).not.toHaveBeenCalled();
  });
  it('detaches only the owned source endpoint when the shared destination is already published',async()=>{
    const f=await fixture();sharedDestination(f);f.source.panel_node_id=51;f.own('host','old');
    const old={id:'old',nodeId:51},next={id:'shared-host',nodeId:52};
    const panel={withServiceLock:async(_,fn)=>fn(),readDestinationEndpoint:async()=>next,
      readService:vi.fn().mockResolvedValueOnce({version:1,endpoints:[old,next]}).mockResolvedValueOnce({version:2,endpoints:[next]}),replaceEndpoints:vi.fn()};
    await expect(replaceManagedEndpoints({...f,panel,inventory:{blockers:[]}})).resolves.toMatchObject({updated:true});
    expect(panel.replaceEndpoints).toHaveBeenCalledWith(expect.objectContaining({removeEndpointIds:['old'],addEndpoints:[]}));
  });
  it('never publishes a missing shared destination host as part of retirement',async()=>{
    const f=await fixture();sharedDestination(f);f.source.panel_node_id=51;f.own('host','old');
    const panel={withServiceLock:async(_,fn)=>fn(),readDestinationEndpoint:async()=>({id:'shared-host',nodeId:52}),
      readService:async()=>({version:1,endpoints:[{id:'old',nodeId:51}]}),replaceEndpoints:vi.fn()};
    await expect(replaceManagedEndpoints({...f,panel,inventory:{blockers:[]}})).rejects.toMatchObject({code:'SERVICE_MEMBERSHIP_CHANGED'});
    expect(panel.replaceEndpoints).not.toHaveBeenCalled();
  });
  it("preserves key/link/quota/expiry and never resets traffic", async () => {
    const f = await fixture(); const before = structuredClone(f.key);
    expect((await migrateAccessItem(f)).status).toBe("verified");
    expect(f.key).toEqual({ ...before, server_id: "destination" });
    expect(f.user).toMatchObject({ key: "subscription-key", used_traffic: 43, data_limit: 1000, expire_date: "2099-01-01", enabled: true, service_ids: [503] });
    expect(f.repository.moveKeyAnchor).toHaveBeenCalledWith(expect.objectContaining({ resellerId: "reseller", patch: { server_id: "destination" } }));
  });
  it.each(['shadowsocks','vless'])('relocates expired %s access without renewing or enabling it', async protocol => {
    const f=await fixture();
    f.key.protocol=f.item.protocol=f.item.expectedKey.protocol=protocol;
    if(protocol==='vless')f.item.sourceServiceIds=f.user.service_ids=[502];
    f.order.expiry_date=f.item.expectedOrder.expiry_date='2020-01-01';
    Object.assign(f.user,{expire_date:'2020-01-01T00:00:00Z',enabled:false});
    const before=structuredClone({key:f.key,order:f.order,user:f.user});
    await expect(migrateAccessItem(f)).resolves.toMatchObject({status:'verified'});
    expect(f.order).toEqual(before.order);
    expect({...f.key,server_id:before.key.server_id}).toEqual(before.key);
    expect(f.user).toMatchObject({expire_date:before.user.expire_date,enabled:false,data_limit:before.user.data_limit,key:before.user.key});
    expect(f.user.service_ids).toEqual(protocol==='vless'?[502]:[503]);
  });
  it('continues an unchanged VLESS move across Bangkok midnight', async () => {
    const f=await fixture();
    f.key.protocol=f.item.protocol=f.item.expectedKey.protocol='vless';
    f.item.sourceServiceIds=f.user.service_ids=[502];
    f.order.expiry_date=f.item.expectedOrder.expiry_date='2026-10-27';
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-27T16:59:59Z'));
    const read=f.repository.readScopedAccess.getMockImplementation();let reads=0;
    f.repository.readScopedAccess.mockImplementation(async input=>{
      if(++reads===2)vi.setSystemTime(new Date('2026-10-27T17:00:01Z'));
      return read(input);
    });
    try { await expect(migrateAccessItem(f)).resolves.toMatchObject({status:'verified'}); }
    finally {vi.useRealTimers();}
    expect(f.order.expiry_date).toBe('2026-10-27');
  });
  it("recovers a crash after panel update without creating another user or repeating PUT", async () => {
    const f = await fixture(); f.repository.moveKeyAnchor.mockRejectedValueOnce(new Error("database timeout"));
    await expect(migrateAccessItem(f)).rejects.toThrow("database timeout");
    expect((await migrateAccessItem(f)).status).toBe("verified");
    expect(f.panel.updateUserServices).toHaveBeenCalledTimes(1);
  });
  it("repairs assignments after DB success and makes completed replay idempotent", async () => {
    const f = await fixture(); f.repository.repairAssignments.mockRejectedValueOnce(new Error("assignment timeout"));
    await expect(migrateAccessItem(f)).rejects.toThrow("assignment timeout");
    expect((await migrateAccessItem(f)).status).toBe("verified");
    expect((await migrateAccessItem(f)).status).toBe("verified");
    expect(f.panel.updateUserServices).toHaveBeenCalledTimes(1);
    expect(f.repository.moveKeyAnchor).toHaveBeenCalledTimes(1);
  });
  it.each(["expiry", "protocol", "payment"])("stops when concurrent %s changes the expected access snapshot", async change => {
    const f = await fixture();
    if (change === "expiry") f.order.status = "expired";
    if (change === "protocol") f.key.protocol = "vless";
    if (change === "payment") f.order.quota_limit_bytes = 2000;
    await expect(migrateAccessItem(f)).rejects.toMatchObject({ code: "ACCESS_STATE_CHANGED" });
    expect(f.panel.updateUserServices).not.toHaveBeenCalled();
  });
  it("requires fresh fencing before any external side effect", async () => {
    const f = await fixture(); f.adapters.assertOperationLease.mockResolvedValue(false);
    await expect(migrateAccessItem(f)).rejects.toMatchObject({ code: "STALE_FENCE" });
    expect(f.panel.updateUserServices).not.toHaveBeenCalled();
  });
  it("keeps VLESS public services unchanged while moving its source anchor", async () => {
    const f = await fixture(); f.key.protocol = f.item.protocol = f.item.expectedKey.protocol = "vless";
    f.item.sourceServiceIds = f.user.service_ids = [502];
    expect((await migrateAccessItem(f)).status).toBe("verified");
    expect(f.panel.updateUserServices).not.toHaveBeenCalled();
  });
  it("refuses a foreign destination service before changing a user", async () => {
    const f = await fixture(); f.records.delete("service:503");
    await expect(migrateAccessItem(f)).rejects.toMatchObject({ code: "RESOURCE_SCOPE_MISMATCH" });
    expect(f.panel.updateUserServices).not.toHaveBeenCalled();
  });
  it("replaces only the owned source endpoint and preserves unrelated pool members", async () => {
    const f = await fixture(); f.source.panel_node_id = 51; f.destination.panel_node_id = 52;
    f.own("host", "old-host"); f.own("host", "new-host");
    const old = { id: "old-host", nodeId: 51 }, next = { id: "new-host", nodeId: 52 }, unrelated = { id: "other-host", nodeId: 53 };
    const panel = { withServiceLock: async (_scope, fn) => fn(), readDestinationEndpoint: vi.fn(async () => next),
      readService: vi.fn().mockResolvedValueOnce({ version: 1, endpoints: [old, unrelated] }).mockResolvedValueOnce({ version: 2, endpoints: [next, unrelated] }), replaceEndpoints: vi.fn() };
    expect(await replaceManagedEndpoints({ ...f, inventory: { blockers: [] }, panel })).toMatchObject({ updated: true });
    expect(panel.replaceEndpoints).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 1, removeEndpointIds: ["old-host"], addEndpoints: [next] }));
  });
});
