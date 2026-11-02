import { afterEach, describe, expect, it, vi } from "vitest";
import { runOperationStep } from "../services/infrastructure/worker.js";
import { runServerOperationsOnce, startServerOperationsJob } from "../jobs/serverOperationsJob.js";
import { infrastructureFixture } from "./fixtures/infrastructure.js";
import { callInfrastructureRpc } from '../services/infrastructure/repository.js';
import { toOperationResponse } from '../services/infrastructure/operations.js';

async function fixture(kind = "add") {
  const f = await infrastructureFixture();
  const operation = { id: "op", kind, stage: "queued", status: "running", payload: {}, checkpoint: {}, control_requested: null };
  const repository = { readOperation: vi.fn(async () => structuredClone(operation)), renewLease: vi.fn(async () => true),
    checkpoint: vi.fn(async ({ stage, status, checkpoint }) => Object.assign(operation, { stage, status, checkpoint })),
    releaseOperation: vi.fn(async ({ status }) => { operation.status = status; }) };
  const candidate = { id: "candidate", resourceId: "vm" };
  const adapters = Object.fromEntries(["provision", "configure", "register", "loadExistingCandidate", "resolveCandidate", "publish", "drain", "stageMigrationItems", "migrate", "replaceEndpoints", "verifyPermanentLinks"].map(name => [name, vi.fn(async () => candidate)]));
  adapters.verify = vi.fn(async () => ({ verified: true }));
  adapters.verifyPermanentLinks = vi.fn(async () => ({ verified: true }));
  adapters.inventory = vi.fn(async () => ({ blockers: [], movable: [], fingerprint: "inventory" }));
  adapters.nextMigrationItem = vi.fn(async () => null);
  adapters.verifyRetirementReady = vi.fn(async () => ({ verified: true }));
  adapters.retire = vi.fn(async () => ({ resourceAbsent: true, cleanupPending: false, ongoingCharges: [] }));
  adapters.cleanup = vi.fn(async () => ({ resourceAbsent: true, cleanupPending: false, ongoingCharges: [] }));
  adapters.cancelUnpublished = vi.fn(async () => ({ published: false, resourcesAbsent: true, billingClear: true }));
  const lease = { ...f.operation, operationId: "op" };
  return { ...f, operation, repository, adapters, lease };
}
describe("resumable server operation worker", () => {
  it.each(['retirement','cancellation'])('retains package-only billing assurance through %s completion',async mode=>{
    const f=await fixture(),billingAssurance={scope:'instance-package',externalAttachmentsVerified:false};
    if(mode==='retirement'){
      f.operation.stage='retiring';f.adapters.retire.mockResolvedValue({resourceAbsent:true,cleanupPending:false,ongoingCharges:[],billingAssurance:{...billingAssurance,password:'never-public'}});
    }else{
      f.operation.stage='provisioning';f.operation.control_requested='cancel';f.adapters.cancelUnpublished.mockResolvedValue({published:false,resourcesAbsent:true,billingClear:true,billingAssurance:{...billingAssurance,password:'never-public'}});
    }
    await runOperationStep(f);
    expect(toOperationResponse(f.operation).billing_assurance).toEqual({scope:'instance-package',external_attachments_verified:false});
    expect(JSON.stringify(f.operation.checkpoint)).not.toContain('never-public');
  });
  it.each(['PROVIDER_CREATE_FAILED','PROVIDER_DELETE_FAILED','PROVIDER_CHECKPOINT_UNAVAILABLE','NODE_SSH_HARDENING_UNVERIFIED','ATTACHMENT_INVENTORY_UNAVAILABLE'])('preserves safe LightNode failure %s without transport diagnostics',async code=>{
    const f=await fixture();f.operation.stage='provisioning';
    f.adapters.provision.mockRejectedValue(Object.assign(Error('private token password'),{code}));
    for(let n=0;n<3;n++)await runOperationStep(f);
    expect(f.operation.status).toBe('blocked');expect(toOperationResponse(f.operation).error_code).toBe(code);
    expect(JSON.stringify(f.operation.checkpoint)).not.toContain('private token');
  });
  it('does not claim or execute local work in remote mode even when the old enabled flag remains true', async () => {
    vi.stubEnv('SERVER_OPERATIONS_WORKER_ENABLED','true');
    vi.stubEnv('SERVER_OPERATIONS_EXECUTION_MODE','remote');
    const runtime={repository:{listRunnableOperations:vi.fn()}};
    expect(await runServerOperationsOnce({runtime,workerId:'local'})).toEqual({disabled:true});
    expect(runtime.repository.listRunnableOperations).not.toHaveBeenCalled();
    expect(() => startServerOperationsJob({runtime})).not.toThrow();
  });
  it('preserves a safe ownership collision code from SQL to the operation response', async () => {
    const f = await fixture(); f.operation.stage = 'registering';
    const client = {rpc: async () => ({error: {message: 'OWNERSHIP_REGISTRATION_CONFLICT private SQL details'}})};
    f.adapters.register.mockImplementation(() => callInfrastructureRpc({context: f.context, client}, 'register_server_infrastructure_resource', {}));
    for (let n = 0; n < 3; n++) await runOperationStep(f);
    expect(f.operation.status).toBe('blocked');
    expect(toOperationResponse(f.operation).error_code).toBe('OWNERSHIP_REGISTRATION_CONFLICT');
    expect(JSON.stringify(f.operation.checkpoint)).not.toContain('private SQL details');
  });
  it('persists only sanitized retirement diagnostics and clears them on a successful phase change',async()=>{
    const f=await fixture('move_retire');f.operation.stage='retiring';
    f.adapters.verifyRetirementReady.mockRejectedValueOnce(Object.assign(Error('secret'),{code:'RETIREMENT_BLOCKED',retirement_check:'inventory',retirement_cause:'INVENTORY_BLOCKED'}));
    await runOperationStep(f);
    expect(f.operation.checkpoint).toMatchObject({retirement_check:'inventory',retirement_cause:'INVENTORY_BLOCKED'});
    expect(JSON.stringify(f.operation.checkpoint)).not.toContain('secret');
    await runOperationStep(f);
    expect(f.operation.stage).toBe('finalizing');
    expect(f.operation.checkpoint.retirement_check).toBeUndefined();
  });
  it('reports a safe assignment conflict without exposing raw database errors or retiring the source',async()=>{
    const f=await fixture('move_retire');f.operation.stage='migrating';
    f.adapters.nextMigrationItem.mockResolvedValue({kind:'access'});
    const client={rpc:async()=>({error:{message:'ASSIGNMENT_STATE_CHANGED secret database detail'}})};
    f.adapters.migrate.mockImplementation(()=>callInfrastructureRpc({context:f.context,client},'repair_server_operation_assignments',{}));
    for(let n=0;n<3;n++)await runOperationStep(f);
    expect(f.operation.status).toBe('blocked');
    expect(f.operation.checkpoint.error_code).toBe('ASSIGNMENT_STATE_CHANGED');
    expect(JSON.stringify(f.operation.checkpoint)).not.toContain('secret');
    expect(f.adapters.retire).not.toHaveBeenCalled();
  });
  it('waits for fresh-server bootstrap without spending mutation retries or touching the source', async () => {
    const f = await fixture('replace'); f.operation.stage = 'configuring';
    f.adapters.configure.mockRejectedValue(Object.assign(Error('pending'), { code: 'NODE_BOOTSTRAP_PENDING' }));
    for (let n = 0; n < 5; n++) await runOperationStep(f);
    expect(f.operation.status).toBe('running');
    expect(f.operation.checkpoint.attempts).toBe(0);
    expect(f.adapters.drain).not.toHaveBeenCalled(); expect(f.adapters.retire).not.toHaveBeenCalled();
    f.operation.checkpoint.waitingSince = new Date(Date.now() - 21 * 60000).toISOString();
    await runOperationStep(f);
    expect(f.operation.status).toBe('blocked');
    expect(f.operation.checkpoint.error_code).toBe('NODE_BOOTSTRAP_TIMEOUT');
  });
  it("waits up to 20 minutes for an allocated provider or panel node without exhausting error retries", async () => {
    const f = await fixture(); f.operation.stage = "provisioning";
    f.adapters.provision.mockRejectedValue(Object.assign(new Error("pending"), { code: "PROVIDER_RESOURCE_PENDING" }));
    for (let n = 0; n < 4; n++) await runOperationStep(f);
    expect(f.operation.status).toBe("running");
    expect(f.operation.checkpoint.attempts).toBe(0);
    f.operation.checkpoint.waitingSince = new Date(Date.now() - 21 * 60000).toISOString();
    await runOperationStep(f);
    expect(f.operation.status).toBe("blocked");
    expect(toOperationResponse(f.operation).error_code).toBe('PROVIDER_RESOURCE_TIMEOUT');
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each(["add", "replace", "move_retire"])("completes %s only through its verified phases", async kind => {
    const f = await fixture(kind);
    for (let n = 0; n < 24 && f.operation.status !== "completed"; n++) await runOperationStep(f);
    expect(f.operation.status).toBe("completed");
    expect(f.adapters.verify).toHaveBeenCalled();
    if (kind === "add") expect(f.adapters.retire).not.toHaveBeenCalled();
    else { expect(f.adapters.verifyPermanentLinks).toHaveBeenCalled(); expect(f.adapters.verifyRetirementReady).toHaveBeenCalled(); expect(f.adapters.retire).toHaveBeenCalled(); }
    if (kind === "move_retire") expect(f.adapters.provision).not.toHaveBeenCalled();
  });
  it("checkpoints intent before external work and retries an ambiguous step without advancing", async () => {
    const f = await fixture(); f.adapters.provision.mockRejectedValueOnce(new Error("secret-provider-token"));
    await runOperationStep(f);
    await runOperationStep(f);
    expect(f.operation.stage).toBe("provisioning");
    expect(f.operation.checkpoint.error_code).toBe("OPERATION_STEP_UNCERTAIN");
    expect(JSON.stringify(f.operation.checkpoint)).not.toContain("secret-provider-token");
    await runOperationStep(f);
    expect(f.operation.stage).toBe("configuring");
  });
  it('preserves an allowlisted firewall diagnostic in the worker checkpoint', async () => {
    const f = await fixture(); f.operation.stage = 'provisioning';
    f.adapters.provision.mockRejectedValue(Object.assign(new Error('private-provider-secret'), { code: 'FIREWALL_POLICY_UNVERIFIED' }));
    await runOperationStep(f);
    expect(f.operation.checkpoint.error_code).toBe('FIREWALL_POLICY_UNVERIFIED');
    expect(JSON.stringify(f.operation.checkpoint)).not.toContain('private-provider-secret');
  });
  it("blocks after bounded retries and never publishes failed candidate probes", async () => {
    const f = await fixture(); f.operation.stage = "verifying";
    f.adapters.verify.mockResolvedValue({ verified: false });
    for (let n = 0; n < 3; n++) await runOperationStep(f);
    expect(f.operation.status).toBe("blocked");
    expect(f.adapters.publish).not.toHaveBeenCalled();
    expect(f.adapters.retire).not.toHaveBeenCalled();
  });
  it("pauses a mid-migration cancellation without rollback or destruction", async () => {
    const f = await fixture("replace"); f.operation.stage = "migrating"; f.operation.checkpoint = { published: true }; f.operation.control_requested = "cancel";
    await runOperationStep(f);
    expect(f.operation.status).toBe("paused");
    expect(f.adapters.retire).not.toHaveBeenCalled(); expect(f.adapters.cancelUnpublished).not.toHaveBeenCalled();
  });
  it("cancels unpublished work only after reconciled absence and billing proof", async () => {
    const f = await fixture(); f.operation.stage = "configuring"; f.operation.control_requested = "cancel";
    await runOperationStep(f);
    expect(f.operation.status).toBe("cancelled"); expect(f.adapters.cancelUnpublished).toHaveBeenCalled();
  });
  it("leaves cleanup pending without replaying migration", async () => {
    const f = await fixture("replace"); f.operation.stage = "retiring";
    f.adapters.retire.mockResolvedValue({ resourceAbsent: true, cleanupPending: true, ongoingCharges: ["snapshot"] });
    await runOperationStep(f);
    expect(f.operation.stage).toBe("cleanup_pending");
    await runOperationStep(f); await runOperationStep(f); expect(f.operation.status).toBe("completed");
    expect(f.adapters.migrate).not.toHaveBeenCalled();
  });
  it("does not execute disabled jobs or schedule anything on import", async () => {
    vi.stubEnv("SERVER_OPERATIONS_WORKER_ENABLED", "false");
    const runtime = { repository: { listRunnableOperations: vi.fn() } };
    expect(await runServerOperationsOnce({ runtime, workerId: "worker" })).toEqual({ disabled: true });
    const stop = startServerOperationsJob({ runtime }); stop();
    expect(runtime.repository.listRunnableOperations).not.toHaveBeenCalled();
  });
  it("cannot enable an unvalidated runtime with an environment flag alone", async () => {
    vi.stubEnv("SERVER_OPERATIONS_WORKER_ENABLED", "true");
    await expect(runServerOperationsOnce({ runtime: {}, workerId: "worker" })).rejects.toMatchObject({ code: "INFRASTRUCTURE_EXECUTION_DISABLED" });
  });
  it('does not claim or consume retries for an unavailable provider', async () => {
    vi.stubEnv('SERVER_OPERATIONS_WORKER_ENABLED', 'true');
    const f = await fixture();
    f.repository.listRunnableOperations = async () => [{ id: 'op' }];
    f.repository.claimOperation = vi.fn();
    const result = await runServerOperationsOnce({ runtime: { ...f, executionReady: true, canRunOperation: async () => false }, workerId: 'worker' });
    expect(result.results).toEqual([{ operationId: 'op', error_code: 'PROVIDER_UNAVAILABLE' }]);
    expect(f.repository.claimOperation).not.toHaveBeenCalled();
  });
  it("runs each claimed step inside its operation-specific asynchronous lease scope", async () => {
    vi.stubEnv('SERVER_OPERATIONS_WORKER_ENABLED','true');
    const f=await fixture();
    f.repository.listRunnableOperations=async()=>[{id:'op'}];
    f.repository.claimOperation=async()=>({id:'op',lease_owner:'worker',fence:1});
    const withLease=vi.fn(async(_lease,action)=>action());
    await runServerOperationsOnce({runtime:{...f,executionReady:true,withLease},workerId:'worker'});
    expect(withLease).toHaveBeenCalledWith(expect.objectContaining({id:'op',owner:'worker',fence:1}),expect.any(Function));
  });
  it('lets a recovery-only runtime claim and execute cleanup', async () => {
    vi.stubEnv('SERVER_OPERATIONS_WORKER_ENABLED', 'true');
    const f = await fixture(); f.operation.stage = 'cleanup_pending';
    f.repository.listRunnableOperations = vi.fn(async () => [{ id: 'op', created_at: '2026-10-27T00:00:00Z' }]);
    f.repository.claimOperation = vi.fn(async () => ({ id: 'op', lease_owner: 'worker', fence: 1 }));
    await runServerOperationsOnce({ runtime: { ...f, executionReady: false, recoveryReady: true }, workerId: 'worker' });
    expect(f.repository.claimOperation).toHaveBeenCalledTimes(1);
    expect(f.adapters.cleanup).toHaveBeenCalledTimes(1);
    expect(f.adapters.provision).not.toHaveBeenCalled();
  });
  it('reaches healthy work beyond 100 unavailable rows across bounded ticks and wraps fairly', async () => {
    vi.stubEnv('SERVER_OPERATIONS_WORKER_ENABLED', 'true');
    const f = await fixture();
    const createdAt = '2026-10-27T00:00:00.123456+00:00';
    const rows = Array.from({ length: 137 }, (_, n) => ({ id: String(137 - n).padStart(5, '0'), created_at: createdAt }));
    const healthy = rows.at(-1).id, first = rows[0].id;
    let providerRecovered = false;
    const inspected = [];
    f.repository.listRunnableOperations = vi.fn(async ({ cursor, limit }) =>
      rows.filter(row => !cursor || row.id < cursor.id).slice(0, limit));
    f.repository.claimOperation = vi.fn(async ({ operationId }) => ({ id: operationId, lease_owner: 'worker', fence: 1 }));
    const runtime = { ...f, executionReady: true, canRunOperation: async operation => {
      inspected.push(operation.id); return operation.id === healthy || (providerRecovered && operation.id === first);
    } };
    let ticks = 0;
    while (!f.repository.claimOperation.mock.calls.some(([input]) => input.operationId === healthy) && ticks++ < 20) {
      if (ticks > 1) rows.unshift({ id: String(200 + ticks).padStart(5, '0'), created_at: createdAt });
      const beforeReads = f.repository.listRunnableOperations.mock.calls.length;
      const beforeInspected = inspected.length;
      await runServerOperationsOnce({ runtime, workerId: 'worker' });
      expect(f.repository.listRunnableOperations.mock.calls.length - beforeReads).toBeLessThanOrEqual(5);
      expect(inspected.length - beforeInspected).toBeLessThanOrEqual(50);
    }
    expect(f.repository.claimOperation.mock.calls.map(([input]) => input.operationId)).toContain(healthy);
    expect(ticks).toBeGreaterThan(1);
    expect(f.repository.listRunnableOperations.mock.calls.some(([input]) => input.cursor?.createdAt === createdAt)).toBe(true);
    providerRecovered = true;
    await runServerOperationsOnce({ runtime, workerId: 'worker' });
    expect(f.repository.claimOperation.mock.calls.map(([input]) => input.operationId)).toContain(first);
    expect(f.repository.claimOperation.mock.calls.every(([input]) => [healthy, first].includes(input.operationId))).toBe(true);
  });
  it('caps claim attempts per tick and resumes after the last examined row', async () => {
    vi.stubEnv('SERVER_OPERATIONS_WORKER_ENABLED', 'true');
    const f = await fixture();
    const rows = Array.from({ length: 25 }, (_, n) => ({ id: String(25 - n).padStart(3, '0'), created_at: '2026-10-27T00:00:00Z' }));
    f.repository.listRunnableOperations = vi.fn(async ({ cursor, limit }) => rows.filter(row => !cursor || row.id < cursor.id).slice(0, limit));
    f.repository.claimOperation = vi.fn(async () => { throw Object.assign(new Error('busy'), { code: 'LEASE_BUSY' }); });
    const runtime = { ...f, executionReady: true };
    for (let tick = 0; tick < 3; tick++) {
      const before = f.repository.claimOperation.mock.calls.length;
      await runServerOperationsOnce({ runtime, workerId: 'worker' });
      expect(f.repository.claimOperation.mock.calls.length - before).toBeLessThanOrEqual(10);
    }
    expect(f.repository.claimOperation.mock.calls.map(([input]) => input.operationId)).toEqual(rows.map(row => row.id));
  });
  it("does not checkpoint or mutate after losing its fence", async () => {
    const f = await fixture(); f.context.adapters.assertOperationLease.mockResolvedValue(false);
    await expect(runOperationStep(f)).rejects.toMatchObject({ code: "STALE_FENCE" });
    expect(f.repository.checkpoint).not.toHaveBeenCalled();
    expect(f.adapters.provision).not.toHaveBeenCalled();
  });
});
