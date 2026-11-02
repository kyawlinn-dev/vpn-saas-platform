import fs from "node:fs";
import { describe, expect, it } from "vitest";
const storage = fs.readFileSync(new URL("../../supabase/migrations/0041_server_operations.sql", import.meta.url), "utf8");
const guards = fs.readFileSync(new URL("../../supabase/migrations/0042_server_operation_coordination.sql", import.meta.url), "utf8");
describe("operation SQL source contracts (not execution proof)", () => {
  it("keeps the existing 0021 trigger as the sole counter owner for anchor moves", () => {
    const moves = fs.readFileSync(new URL("../../supabase/migrations/0043_server_operation_access_moves.sql", import.meta.url), "utf8");
    const harness = fs.readFileSync(new URL("./database/serverOperations.integration.mjs", import.meta.url), "utf8");
    expect(moves).not.toContain('current_active_keys=current_active_keys+1');
    expect(moves).not.toContain('current_active_keys=current_active_keys-1');
    expect(moves).not.toContain('create trigger vpn_keys_operation_anchor_counter');
    expect(moves).toContain('trg_sync_server_active_keys');
    expect(harness).toContain('0021_server_counter_trigger.sql');
  });
  it("keeps private rows backend-only and checkpoints bounded", () => {
    expect(storage).toContain("revoke all on public.server_operations");
    expect(storage).toContain("octet_length(checkpoint::text)<=65536");
    expect(storage).toContain("unique(environment,access_pool_id,idempotency_key)");
    expect(guards).toContain("revoke all on public.server_customer_mutation_guards");
  });
  it("fences leases and serializes drains with legacy RPC writes", () => {
    expect(guards).toContain("fence=fence+1");
    expect(guards).toContain("o.lease_until<=clock_timestamp()");
    expect(guards).toContain("p_fence bigint");
    for (const table of ["vpn_keys", "vpn_orders", "vpn_servers"]) expect(guards).toContain(`on public.${table} for each row`);
    expect(guards).toContain("pg_advisory_xact_lock");
    expect(guards).toContain("k.status='pending'");
  });
});
