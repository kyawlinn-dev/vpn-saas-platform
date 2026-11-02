import { describe, expect, it, vi } from "vitest";
import { createOperation, claimOperation, renewLease, checkpoint, claimItem, finishItem, releaseOperation, readOperation } from "../services/infrastructure/repository.js";

const context = { environment: "development", poolId: "pool", databaseIdentity: "db", panelIdentity: "panel" };
const lease = { operationId: "operation", owner: "worker", fence: 2 };
describe("server operation repository RPC boundary", () => {
  it("canonicalizes identical payloads and forwards idempotency conflicts without leaking SQL", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { id: "operation" } }) };
    const input = { context, client, idempotencyKey: "request", kind: "replace", payload: { b: 2, a: 1 } };
    await createOperation(input);
    await createOperation({ ...input, payload: { a: 1, b: 2 } });
    expect(client.rpc.mock.calls[0][1].p_payload_hash).toBe(client.rpc.mock.calls[1][1].p_payload_hash);
    client.rpc.mockResolvedValue({ error: { message: "IDEMPOTENCY_CONFLICT detail=password" } });
    await expect(createOperation(input)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", message: "IDEMPOTENCY_CONFLICT" });
  });
  it.each([
    [claimOperation, "claim_server_operation", { operationId: "operation", owner: "worker", ttlSeconds: 60 }],
    [renewLease, "renew_server_operation_lease", { lease, ttlSeconds: 60 }],
    [checkpoint, "checkpoint_server_operation", { lease, stage: "inventory", status: "running", checkpoint: { verified: true } }],
    [claimItem, "claim_server_operation_item", { lease, itemKey: "order:1", expected: { keyId: "key" } }],
    [finishItem, "finish_server_operation_item", { lease, itemKey: "order:1", status: "verified", checkpoint: { readback: true } }],
    [releaseOperation, "release_server_operation", { lease, status: "completed" }],
    [readOperation, "read_server_operation", { operationId: "operation" }],
  ])("uses scoped RPC %s -> %s", async (method, rpc, input) => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { ok: true } }) };
    await method({ context, client, ...input });
    expect(client.rpc).toHaveBeenCalledWith(rpc, expect.objectContaining({ p_environment: "development", p_pool_id: "pool" }));
    if (input.lease) expect(client.rpc.mock.calls[0][1]).toMatchObject({ p_owner: "worker", p_fence: 2, p_operation_id: "operation" });
  });
  it.each(["STALE_FENCE", "LEASE_EXPIRED", "SERVER_MIGRATION_IN_PROGRESS", "RESOURCE_SCOPE_MISMATCH"])("preserves safe coordination error %s", async code => {
    const client = { rpc: vi.fn().mockResolvedValue({ error: { message: code } }) };
    await expect(renewLease({ context, lease, client })).rejects.toMatchObject({ code });
  });
  it("rejects missing context/fences and unbounded private checkpoints before RPC", async () => {
    const client = { rpc: vi.fn() };
    await expect(renewLease({ context: { environment: "development" }, lease, client })).rejects.toMatchObject({ code: "RESOURCE_SCOPE_MISMATCH" });
    await expect(checkpoint({ context, lease: { ...lease, fence: 0 }, client, checkpoint: {} })).rejects.toMatchObject({ code: "STALE_FENCE" });
    await expect(checkpoint({ context, lease, client, checkpoint: { data: "a".repeat(70000) } })).rejects.toMatchObject({ code: "CHECKPOINT_TOO_LARGE" });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
