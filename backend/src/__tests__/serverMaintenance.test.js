import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase.js", () => ({ supabase: { from: vi.fn() } }));
import { annotateServerMaintenance } from "../services/serverMaintenanceService.js";

const source = { id: "source", environment: "development", access_pool_id: "pool", status: "active", is_active: true };
function database(data = [], error = null) {
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), in: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject) };
  return { from: vi.fn(() => query), query };
}
const lock = (kind = "replace", status = "queued") => ({ resource_key: "server:source",
  operation: { kind, status, payload: { source_server_id: "source", destination_server_id: "destination" } } });
afterEach(() => vi.unstubAllEnvs());

describe("customer selection maintenance", () => {
  it("does not query lifecycle tables when coordination is disabled", async () => {
    vi.stubEnv("SERVER_LIFECYCLE_COORDINATION_ENABLED", "false");
    const client = database();
    expect(await annotateServerMaintenance([source], { client })).toEqual([source]);
    expect(client.from).not.toHaveBeenCalled();
  });
  it.each(["queued", "running", "blocked", "paused", "partial"])("keeps a %s source unavailable without changing the node", async status => {
    vi.stubEnv("SERVER_LIFECYCLE_COORDINATION_ENABLED", "true");
    const client = database([lock("replace", status)]);
    const [row] = await annotateServerMaintenance([source], { client });
    expect(row).toEqual({ ...source, under_maintenance: true });
    expect(source).not.toHaveProperty("under_maintenance");
    expect(client.query.eq).toHaveBeenCalledWith("environment", "development");
    expect(client.query.eq).toHaveBeenCalledWith("access_pool_id", "pool");
    expect(client.query.in).toHaveBeenCalledWith("resource_key", ["server:source"]);
  });
  it("marks only the move/retire source, not its locked destination", async () => {
    vi.stubEnv("SERVER_LIFECYCLE_COORDINATION_ENABLED", "true");
    const client = database([lock("move_retire"), { ...lock("move_retire"), resource_key: "server:destination" }]);
    const rows = await annotateServerMaintenance([source, { ...source, id: "destination" }], { client });
    expect(rows.map(row => row.under_maintenance)).toEqual([true, false]);
  });
  it.each(["completed", "cancelled", "failed"])("ignores terminal %s operations", async status => {
    vi.stubEnv("SERVER_LIFECYCLE_COORDINATION_ENABLED", "true");
    expect((await annotateServerMaintenance([source], { client: database([lock("replace", status)]) }))[0].under_maintenance).toBe(false);
  });
  it("clears maintenance when the reconciled lock has been released", async () => {
    vi.stubEnv("SERVER_LIFECYCLE_COORDINATION_ENABLED", "true");
    expect((await annotateServerMaintenance([source], { client: database() }))[0].under_maintenance).toBe(false);
  });
  it("does not query unscoped legacy rows or mistake additions for retirement", async () => {
    vi.stubEnv("SERVER_LIFECYCLE_COORDINATION_ENABLED", "true");
    const legacy = { id: "legacy" };
    const client = database([lock("add")]);
    expect(await annotateServerMaintenance([source, legacy], { client })).toEqual([{ ...source, under_maintenance: false }, legacy]);
    expect(client.query.in).toHaveBeenCalledWith("resource_key", ["server:source"]);
  });
  it("fails closed when maintenance cannot be read", async () => {
    vi.stubEnv("SERVER_LIFECYCLE_COORDINATION_ENABLED", "true");
    await expect(annotateServerMaintenance([source], { client: database(null, { message: "unavailable" }) }))
      .rejects.toMatchObject({ code: "SERVER_MAINTENANCE_UNAVAILABLE" });
  });
});
