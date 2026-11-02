import { describe, expect, it, vi } from "vitest";
import { verifyRetirementReady, retireSource } from "../services/infrastructure/retirement.js";
import { infrastructureFixture } from "./fixtures/infrastructure.js";

async function fixture() {
  const f = await infrastructureFixture();
  const source = f.own("server", "source", { panel_node_id: "51", provider_resource_id: "vm", addresses: f.resource.addresses, lifecycle_protected: false });
  const destination = f.own("server", "destination", { panel_node_id: "52" });
  const node = f.own("node", "51", { address: "198.51.100.10" });
  let absent = false, checkpoint = null;
  const provider = { inspect: vi.fn(async () => absent ? null : f.resource), delete: vi.fn(async () => { absent = true; }) };
  const adapters = { provider, readSource: vi.fn(async () => ({ server: source, node })),
    readDeletionAuthorization: vi.fn(async () => ({ approved: true, provider: "digitalocean", accountId: "account", resourceId: "vm", createdAt: f.resource.createdAt, addresses: f.resource.addresses, nodeId: "51" })),
    inventory: vi.fn(async () => ({ blockers: [], movable: [], activeSourceAssignments: 0, pendingSourceKeys: 0 })),
    verifyDestination: vi.fn(async () => ({ healthy: true, tunnelsVerified: true, permanentLinksVerified: true, verifiedAt: new Date().toISOString() })),
    readRetirementCheckpoint: vi.fn(async () => checkpoint),
    checkpointRetirement: vi.fn(async value => { checkpoint = value; }),
    removeOwnedPanelResources: vi.fn(async () => true),
    billingInventory: vi.fn(async () => ({ complete: true, ongoingCharges: [] })) };
  return { ...f, source, destination, lease: f.operation, adapters };
}
describe("fresh irreversible retirement gate", () => {
  it('preserves only bounded billing assurance after confirmed deletion', async () => {
    const f = await fixture();
    f.adapters.billingInventory.mockResolvedValue({ complete: true, ongoingCharges: [],
      billingAssurance: { scope: 'instance-package', externalAttachmentsVerified: false, secret: 'never-forward' }, arbitrary: 'never-forward' });
    expect(await retireSource({ ...f, proof: await verifyRetirementReady(f) })).toEqual({ resourceAbsent: true, cleanupPending: false, ongoingCharges: [],
      billingAssurance: { scope: 'instance-package', externalAttachmentsVerified: false } });
  });
  it.each([undefined, { scope: 'account-wide', externalAttachmentsVerified: false }, { scope: 'instance-package', externalAttachmentsVerified: true }])('omits unavailable or unsupported billing assurance %j', async billingAssurance => {
    const f = await fixture();
    f.adapters.billingInventory.mockResolvedValue({ complete: true, ongoingCharges: [], billingAssurance });
    expect(await retireSource({ ...f, proof: await verifyRetirementReady(f) })).not.toHaveProperty('billingAssurance');
  });
  it('preserves only a pending deletion signal while fresh detail still exists', async () => {
    const f = await fixture();
    f.adapters.provider.delete.mockRejectedValue(Object.assign(Error('private pending'), { code: 'PROVIDER_RESOURCE_PENDING' }));
    await expect(retireSource({ ...f, proof: await verifyRetirementReady(f) })).rejects.toMatchObject({ code: 'PROVIDER_RESOURCE_PENDING', message: 'PROVIDER_RESOURCE_PENDING' });
    expect(f.adapters.billingInventory).not.toHaveBeenCalled();
  });
  it('accepts fresh absence even when deletion reports pending', async () => {
    const f = await fixture(); const remove = f.adapters.provider.delete.getMockImplementation();
    f.adapters.provider.delete.mockImplementation(async input => { await remove(input); throw Object.assign(Error('pending'), { code: 'PROVIDER_RESOURCE_PENDING' }); });
    await expect(retireSource({ ...f, proof: await verifyRetirementReady(f) })).resolves.toMatchObject({ resourceAbsent: true });
  });
  it.each(['PROVIDER_REQUEST_UNCERTAIN', 'DELETE_RECONCILIATION_REQUIRED'])('keeps uncertainty guarded for %s while detail exists', async code => {
    const f = await fixture(); f.adapters.provider.delete.mockRejectedValue(Object.assign(Error('private'), { code }));
    await expect(retireSource({ ...f, proof: await verifyRetirementReady(f) })).rejects.toMatchObject({ code: 'DELETE_RECONCILIATION_REQUIRED' });
  });
  it('accepts fresh service and permanent-link evidence for move-and-retire without a tunnel probe',async()=>{
    const f=await fixture();
    f.adapters.verifyDestination.mockResolvedValue({healthy:true,servicesVerified:true,tunnelsVerified:false,permanentLinksVerified:true,verifiedAt:new Date().toISOString()});
    const proof=await verifyRetirementReady({...f,operationKind:'move_retire'});
    await expect(retireSource({...f,proof})).resolves.toMatchObject({resourceAbsent:true});
  });
  it('still requires tunnel evidence when retiring a newly provisioned replacement',async()=>{
    const f=await fixture();
    f.adapters.verifyDestination.mockResolvedValue({healthy:true,servicesVerified:true,tunnelsVerified:false,permanentLinksVerified:true,verifiedAt:new Date().toISOString()});
    await expect(verifyRetirementReady({...f,operationKind:'replace'})).rejects.toMatchObject({code:'RETIREMENT_BLOCKED'});
    expect(f.adapters.provider.delete).not.toHaveBeenCalled();
  });
  it('identifies the failing retirement check without exposing an adapter payload',async()=>{
    const f=await fixture();
    f.adapters.verifyDestination.mockRejectedValue(Object.assign(Error('secret subscription payload'),{code:'CANDIDATE_VERIFICATION_FAILED'}));
    await expect(verifyRetirementReady(f)).rejects.toMatchObject({code:'RETIREMENT_BLOCKED',retirement_check:'destination_verification',retirement_cause:'CANDIDATE_VERIFICATION_FAILED'});
    try{await verifyRetirementReady(f);}catch(error){expect(JSON.stringify(error)).not.toContain('secret');}
    expect(f.adapters.provider.delete).not.toHaveBeenCalled();
  });
  it('identifies an inventory blocker separately from a destination probe failure',async()=>{
    const f=await fixture();
    f.adapters.inventory.mockResolvedValue({blockers:[{code:'UNMANAGED_PANEL_USER'}],movable:[],activeSourceAssignments:0,pendingSourceKeys:0});
    await expect(verifyRetirementReady(f)).rejects.toMatchObject({code:'RETIREMENT_BLOCKED',retirement_check:'inventory'});
    expect(f.adapters.verifyDestination).not.toHaveBeenCalled();
  });
  it("records panel removal intent before deletion and reconciles a lost response", async () => {
    const f = await fixture(); let removed = false;
    f.adapters.removeOwnedPanelResources.mockImplementation(async () => {
      expect(f.adapters.checkpointRetirement).toHaveBeenCalledWith(expect.objectContaining({ phase: "panel_remove_issued", panelRemoved: false }));
      if (!removed) { removed = true; throw new Error("response lost"); }
      return true;
    });
    const node = f.own("node", "51", { address: "198.51.100.10" });
    f.adapters.readSource.mockImplementation(async () => ({ server: f.source, node: removed ? null : node }));
    await expect(retireSource({ ...f, proof: await verifyRetirementReady(f) })).rejects.toThrow();
    expect(f.adapters.provider.delete).not.toHaveBeenCalled();
    expect((await retireSource({ ...f, proof: await verifyRetirementReady(f) })).resourceAbsent).toBe(true);
  });
  it("requires opaque, current proof and confirms provider absence", async () => {
    const f = await fixture();
    await expect(retireSource({ ...f, proof: { verified: true } })).rejects.toMatchObject({ code: "RETIREMENT_PROOF_REQUIRED" });
    const proof = await verifyRetirementReady(f);
    expect(await retireSource({ ...f, proof })).toEqual({ resourceAbsent: true, cleanupPending: false, ongoingCharges: [] });
    expect(f.adapters.provider.delete).toHaveBeenCalledTimes(1);
  });
  it.each(["late-key", "assignment", "node-address", "resource-identity", "target-failed", "stale-probe"])("blocks deletion after %s changes", async change => {
    const f = await fixture(); const proof = await verifyRetirementReady(f);
    if (change === "late-key") f.adapters.inventory.mockResolvedValue({ blockers: [], movable: [{ keyId: "late" }], activeSourceAssignments: 0, pendingSourceKeys: 0 });
    if (change === "assignment") f.adapters.inventory.mockResolvedValue({ blockers: [], movable: [], activeSourceAssignments: 1, pendingSourceKeys: 0 });
    if (change === "node-address") f.adapters.readSource.mockResolvedValue({ server: f.source, node: { id: "51", kind: "node", address: "192.0.2.1" } });
    if (change === "resource-identity") f.adapters.provider.inspect.mockResolvedValue({ ...f.resource, createdAt: "foreign" });
    if (change === "target-failed") f.adapters.verifyDestination.mockResolvedValue({ healthy: false });
    if (change === "stale-probe") f.adapters.verifyDestination.mockResolvedValue({ healthy: true, tunnelsVerified: true, permanentLinksVerified: true, verifiedAt: "2000-01-01" });
    await expect(retireSource({ ...f, proof })).rejects.toMatchObject({ code: "RETIREMENT_BLOCKED" });
    expect(f.adapters.provider.delete).not.toHaveBeenCalled();
  });
  it("keeps billing cleanup visible and never deletes shared attachments", async () => {
    const f = await fixture();
    f.adapters.billingInventory.mockResolvedValue({ complete: true, ongoingCharges: [{ id: "shared-volume", type: "volume", shared: true }] });
    const result = await retireSource({ ...f, proof: await verifyRetirementReady(f) });
    expect(result).toMatchObject({ resourceAbsent: true, cleanupPending: true, ongoingCharges: [{ id: "shared-volume" }] });
    expect(f.adapters.provider.delete).toHaveBeenCalledTimes(1);
  });
  it("reconciles delete timeout by provider 404 without repeating deletion", async () => {
    const f = await fixture();
    const original = f.adapters.provider.delete.getMockImplementation();
    f.adapters.provider.delete.mockImplementation(async input => { await original(input); throw new Error("timeout-secret"); });
    expect((await retireSource({ ...f, proof: await verifyRetirementReady(f) })).resourceAbsent).toBe(true);
    expect((await retireSource({ ...f, proof: await verifyRetirementReady(f) })).resourceAbsent).toBe(true);
    expect(f.adapters.provider.delete).toHaveBeenCalledTimes(1);
  });
});
