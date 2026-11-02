import { describe, expect, it, vi } from "vitest";
import { createCommandRepository } from "../services/infrastructure/commandRepository.js";
import fs from "node:fs";
const context = { environment: "development", databaseIdentity: "db", poolId: "pool", panelIdentity: "panel" };
describe("quoted operation storage boundary", () => {
  it('paginates retirement candidates with environment/pool and active filters on every page', async () => {
    const rows=Array.from({length:500},(_,i)=>({id:String(i),access_pool_id:'pool',ownership_provenance:{panel_identity:'panel'}}));
    const query={select:vi.fn(()=>query),eq:vi.fn(()=>query),order:vi.fn(()=>query),range:vi.fn()
      .mockResolvedValueOnce({data:rows}).mockResolvedValueOnce({data:[{...rows[0],id:'last'}]})};
    const result=await createCommandRepository({client:{from:()=>query}}).listRetirementCandidates({context});
    expect(result).toHaveLength(501);
    expect(result[500]).toMatchObject({id:'last',kind:'server',poolId:'pool',databaseIdentity:'db',panelIdentity:'panel'});
    expect(query.range.mock.calls).toEqual([[0,499],[500,999]]);
    expect(query.eq.mock.calls).toEqual([
      ['environment','development'],['access_pool_id','pool'],['status','active'],['is_active',true],
      ['environment','development'],['access_pool_id','pool'],['status','active'],['is_active',true],
    ]);
  });
  it('does not use a partial candidate list when a page fails', async () => {
    const query={select:()=>query,eq:()=>query,order:()=>query,range:async()=>({error:{message:'private provider error'}})};
    await expect(createCommandRepository({client:{from:()=>query}}).listRetirementCandidates({context}))
      .rejects.toMatchObject({code:'RETIREMENT_FALLBACK_UNAVAILABLE'});
  });
  it("passes worker identity so owned leases do not delay every phase until expiration", async () => {
    const client = { rpc: vi.fn(async () => ({ data: [] })) };
    await createCommandRepository({ client }).listRunnableOperations({ context, owner: "worker" });
    expect(client.rpc).toHaveBeenCalledWith("list_runnable_server_operations", expect.objectContaining({ p_owner: "worker", p_after_created_at: null, p_after_id: null }));
  });
  it("passes exact timestamp/ID keyset cursors through the authenticated scope boundary", async () => {
    const client = { rpc: vi.fn(async () => ({ data: [] })) };
    const cursor = { createdAt: '2026-10-27T01:00:00.123456+00:00', id: '00000000-0000-0000-0000-000000000042' };
    await createCommandRepository({ client }).listRunnableOperations({ context, owner: 'worker', limit: 10, cursor });
    expect(client.rpc).toHaveBeenCalledWith('list_runnable_server_operations', {
      p_environment: context.environment, p_pool_id: context.poolId, p_database_identity: context.databaseIdentity,
      p_panel_identity: context.panelIdentity, p_owner: 'worker', p_limit: 10,
      p_after_created_at: cursor.createdAt, p_after_id: cursor.id,
    });
  });
  it("keeps display listing on its existing summary RPC", async () => {
    const client = { rpc: vi.fn(async () => ({ data: [] })) };
    await createCommandRepository({ client }).listOperations({ context, limit: 25 });
    expect(client.rpc).toHaveBeenCalledWith('list_server_operations', expect.objectContaining({ p_limit: 25, p_runnable_only: false }));
  });
  it("rejects invalid scope before listing worker pages", async () => {
    const client = { rpc: vi.fn() };
    await expect(createCommandRepository({ client }).listRunnableOperations({ context: { ...context, panelIdentity: '' }, owner: 'worker' }))
      .rejects.toMatchObject({ code: 'RESOURCE_SCOPE_MISMATCH' });
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("never serializes runtime/context objects into stored quote JSON", async () => {
    const client = { rpc: vi.fn(async () => ({ data: true })) };
    await createCommandRepository({ client }).storeQuote({ context, id: "quote", expiresAt: "2099-01-01", kind: "add" });
    expect(client.rpc.mock.calls[0][1].p_body).toEqual({ id: "quote", expiresAt: "2099-01-01", kind: "add" });
  });
  it("declares single-use scoped quotes and fenced resume in unapplied SQL", () => {
    const sql = fs.readFileSync(new URL("../../supabase/migrations/0044_server_operation_commands.sql", import.meta.url), "utf8");
    expect(sql).toContain("quote_id uuid unique"); expect(sql).toContain("QUOTE_ALREADY_USED");
    expect(sql).toContain("o.lease_owner=p_owner"); expect(sql).toContain("fence=fence+1");
    expect(sql).toContain("revoke all on public.server_operation_quotes");
  });
});
