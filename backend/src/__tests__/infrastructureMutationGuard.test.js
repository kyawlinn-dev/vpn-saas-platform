import { afterEach, describe, expect, it, vi } from "vitest";
import { withCustomerInfrastructureMutation } from "../services/infrastructure/customerMutationGuard.js";
const context = { environment: "development", databaseIdentity: "db", panelIdentity: "panel", poolId: "pool" };
describe("customer infrastructure coordination", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("has no storage or environment requirement while disabled", async () => {
    vi.stubEnv("SERVER_LIFECYCLE_COORDINATION_ENABLED", "false");
    const client = { rpc: vi.fn() };
    expect(await withCustomerInfrastructureMutation({ client, orderIds: ["order"] }, async () => "legacy")).toBe("legacy");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("rejects an active drain before executing any customer mutation", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ error: { message: "SERVER_MIGRATION_IN_PROGRESS" } }) };
    const action = vi.fn();
    await expect(withCustomerInfrastructureMutation({ context, client, serverIds: ["node"] }, action)).rejects.toMatchObject({ code: "SERVER_MIGRATION_IN_PROGRESS" });
    expect(action).not.toHaveBeenCalled();
  });
  it("extends one reentrant guard and releases only after the complete workflow", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: true }) };
    await withCustomerInfrastructureMutation({ context, client, orderIds: ["order"] }, () =>
      withCustomerInfrastructureMutation({ serverIds: ["node"] }, async () => "ok"));
    expect(client.rpc.mock.calls.map(c => c[0])).toEqual(["acquire_server_customer_mutation", "acquire_server_customer_mutation", "finish_server_customer_mutation"]);
    expect(client.rpc.mock.calls[1][1].p_resource_keys).toEqual(["order:order", "server:node"]);
    expect(client.rpc.mock.calls[0][1].p_guard_id).toBe(client.rpc.mock.calls[1][1].p_guard_id);
  });
  it("retains an uncertain external mutation rather than freeing retirement locks", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: true }) };
    await expect(withCustomerInfrastructureMutation({ context, client, orderIds: ["order"] }, async () => { throw new Error("timeout"); })).rejects.toThrow("timeout");
    expect(client.rpc.mock.calls.at(-1)[1].p_uncertain).toBe(true);
  });
});
