import fs from "node:fs";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/0040_public_server_access.sql", import.meta.url);
const sql = () => fs.readFileSync(migration, "utf8").toLowerCase();

describe("public server schema contract (static checks, not SQL execution)", () => {
  it("adds capabilities without adopting or relabeling existing servers", () => {
    const text = sql();
    expect(text).toContain("supported_protocols text[]");
    expect(text).toContain("lifecycle_protected boolean not null default true");
    expect(text).not.toMatch(/update\s+(?:public\.)?vpn_servers\s+set/);
    expect(text).not.toMatch(/insert\s+into\s+(?:public\.)?server_access_pools/);
    expect(text).toContain("server_capabilities_valid");
    expect(text).toContain("cardinality(protocols) = 1");
    expect(text).toContain("cardinality(protocols) = 2");
  });
  it("enforces pool scope and unique registered node binding", () => {
    const text = sql();
    expect(text).toMatch(/foreign key\s*\(access_pool_id, environment\)/);
    expect(text).toContain("references public.server_access_pools(id, environment)");
    expect(text).toContain("unique (environment, panel_identity)");
    expect(text).toContain("unique (access_pool_id, panel_node_id)");
    expect(text).toContain("validate_server_access_registration");
    expect(text).toContain("ss_service_ids");
  });
  it("keeps pool and ownership writes backend-only", () => {
    const text = sql();
    expect(text).toContain("enable row level security");
    expect(text).toContain("revoke all on public.server_access_pools from public, anon, authenticated");
    expect(text).toContain("grant all on public.server_access_pools to service_role");
    expect(text).toContain("pg_has_role(current_user, 'service_role', 'member')");
    expect(text).toContain("errcode = '42501'");
    expect(text).toContain("guard_registered_pool_identity");
  });
  it("preserves tier columns and database-owned counters", () => {
    const text = sql();
    expect(text).not.toMatch(/drop\s+column/);
    expect(text).not.toContain("current_active_keys =");
    expect(text).not.toContain("create or replace function public.reserve_pending_key");
    expect(text).toMatch(/begin;[\s\S]*notify pgrst,\s*'reload schema';[\s\S]*commit;/);
  });
});
