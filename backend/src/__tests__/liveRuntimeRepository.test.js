import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createLiveRuntimeRepository } from '../services/infrastructure/liveRuntimeRepository.js';
const context = { environment: 'development', poolId: 'pool', databaseIdentity: 'db', panelIdentity: 'panel' };
const lease = { id: 'operation', operationId: 'operation', owner: 'worker', fence: 2 };
describe('runtime persistence composition', () => {
  it('persists full migration inputs privately before claiming the resumable item', async () => {
    const client = {rpc:vi.fn(async()=>({data:{}}))};
    const store = {readState:vi.fn(async()=>({value:null,version:null})),saveState:vi.fn(async()=>{})};
    const repository = createLiveRuntimeRepository({client,store});
    const item = {kind:'access',keyId:'key',orderId:'order',userId:'user'};
    await repository.stageMigrationItems({context,lease,source:{id:'a'},destination:{id:'b'},inventory:{movable:[item]}});
    expect(store.saveState).toHaveBeenCalledWith('migration-item:key:key',item,null);
  });
  it('publishes only through a scoped fenced RPC with fresh verification time', async () => {
    const client = { rpc: vi.fn(async () => ({ data: { id: 'server' } })) };
    const repository = createLiveRuntimeRepository({ client });
    await repository.publishCandidate({ context, lease, candidate: { serverId: 'server', node: { id: '51' }, resource: { id: 'vm' } }, proof: { verifiedAt: '2026-10-23T00:00:00Z' } });
    expect(client.rpc).toHaveBeenCalledWith('publish_server_operation_candidate', expect.objectContaining({ p_environment: 'development', p_pool_id: 'pool', p_operation_id: 'operation', p_owner: 'worker', p_fence: 2, p_server_id: 'server', p_provider_resource_id: 'vm' }));
  });
  it('stages items using the same binding hash that migration retries claim', async () => {
    const client = { rpc: vi.fn(async () => ({ data: {} })) };
    const repository = createLiveRuntimeRepository({ client });
    const item = { kind: 'access', keyId: 'key', orderId: 'order', resellerId: 'tenant', customerId: 'customer', userId: 'user', protocol: 'vless' };
    await repository.stageMigrationItems({ context, lease, source: { id: 'source' }, destination: { id: 'destination' }, inventory: { movable: [item] } });
    const stageHash = client.rpc.mock.calls[0][1].p_expected.bindingHash;
    await repository.saveMigrationState({ context, lease, keyId: 'key', checkpoint: { bindingHash: stageHash, phase: 'prepared' } });
    expect(client.rpc.mock.calls[1][1].p_expected).toEqual({ bindingHash: stageHash });
  });
  it('requires candidate and retirement SQL to retain original rows/counter ownership', () => {
    const sql = fs.readFileSync(new URL('../../supabase/migrations/0046_server_candidate_publication.sql', import.meta.url), 'utf8');
    expect(sql).toContain('require_server_operation_lease');
    expect(sql).toContain('begin_server_operation_write');
    expect(sql).toContain('p_verified_at');
    expect(sql).toContain("status='decommissioned'");
    expect(sql).not.toMatch(/current_active_keys\s*=/);
    expect(sql).not.toMatch(/delete from (?:public\.)?vpn_servers/i);
  });
});
