import { describe, expect, it, vi } from "vitest";
import { createMigrationRepository } from "../services/infrastructure/migrationRepository.js";
import fs from "node:fs";
import { BUSINESS_TIME_ZONE } from "../utils/businessTime.js";

describe("fenced migration persistence", () => {
  const context = { environment: "development", databaseIdentity: "db", poolId: "pool", panelIdentity: "panel" };
  const lease = { id: "op", owner: "worker", fence: 2 };
  it("sends only an anchor patch and scoped expected state through the move RPC", async () => {
    const client = { rpc: vi.fn(async () => ({ data: true })) }, repository = createMigrationRepository({ client });
    const input = { context, lease, keyId: "key", orderId: "order", resellerId: "reseller", customerId: "customer", sourceId: "source", destinationId: "dest", expectedKey: { used_bytes: 42 }, expectedOrder: { quota_limit_bytes: 1000 }, patch: { server_id: "dest" } };
    await repository.moveKeyAnchor(input);
    expect(client.rpc).toHaveBeenCalledWith("move_server_operation_key", expect.objectContaining({ p_owner: "worker", p_fence: 2, p_reseller_id: "reseller", p_customer_id: "customer", p_expected_key: { used_bytes: 42 } }));
    expect(() => repository.moveKeyAnchor({ ...input, patch: { server_id: "dest", used_bytes: 0 } })).toThrow("INVALID_ANCHOR_PATCH");
  });
  it("keeps SQL date boundaries aligned with business time and counters in the database", () => {
    const sql = fs.readFileSync(new URL("../../supabase/migrations/0043_server_operation_access_moves.sql", import.meta.url), "utf8");
    expect(sql).toContain(`at time zone '${BUSINESS_TIME_ZONE}'`);
    expect(sql).toContain("trg_sync_server_active_keys");
    expect(sql).toContain("SERVER_COUNTER_TRIGGER_REQUIRED");
    expect(sql).toContain("p_expected_order jsonb");
    expect(sql).toContain("p_reseller_id and customer_id=p_customer_id for update");
  });
  it("recovers an empty claimed item before its first private checkpoint", async () => {
    const client = { rpc: vi.fn(async () => ({ data: {} })) };
    expect(await createMigrationRepository({ client }).readMigrationState({ context, lease, keyId: "key" })).toBeNull();
  });
});
