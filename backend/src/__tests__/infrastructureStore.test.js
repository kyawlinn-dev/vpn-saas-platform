import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInfrastructureStore } from '../services/infrastructure/liveStore.js';
const context = { environment: 'development', poolId: 'pool', databaseIdentity: 'db', panelIdentity: 'panel' };
const lease = { id: 'operation', owner: 'worker', fence: 2 };
describe('durable infrastructure state', () => {
  it('archives an exact panel receipt under the current scope and fence', async () => {
    const client = {rpc: vi.fn(async () => ({data: true}))};
    const store = createInfrastructureStore({context, client, getLease: () => lease});
    const expectedBody = {id: '8', kind: 'node', operationId: 'old-operation'};
    await store.archivePanelResource({kind: 'node', id: '8', expectedBody});
    expect(client.rpc).toHaveBeenCalledWith('archive_server_panel_resource', expect.objectContaining({p_environment: 'development', p_pool_id: 'pool', p_operation_id: 'operation', p_owner: 'worker', p_fence: 2, p_kind: 'node', p_resource_id: '8', p_expected_body: expectedBody}));
    const denied = createInfrastructureStore({context, client, getLease: () => null});
    expect(() => denied.archivePanelResource({kind: 'node', id: '8', expectedBody})).toThrow('STALE_FENCE');
  });
  beforeEach(() => vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY', '12'.repeat(32)));
  afterEach(() => vi.unstubAllEnvs());
  it('persists encrypted private state with compare-and-set version and current fence', async () => {
    let stored;
    const client = { rpc: vi.fn(async (name, params) => {
      if (name === 'write_server_infrastructure_state') { stored = { ciphertext: params.p_ciphertext, version: 1 }; return { data: stored }; }
      return { data: stored || null };
    }) };
    const store = createInfrastructureStore({ context, client, getLease: () => lease });
    expect(await store.readState('bootstrap')).toEqual({ value: null, version: null });
    await store.saveState('bootstrap', { privateKey: 'fixture-private', password: 'fixture-password' }, null);
    const params = client.rpc.mock.calls[1][1];
    expect(JSON.stringify(params)).not.toContain('fixture-private');
    expect(params).toMatchObject({ p_environment: 'development', p_pool_id: 'pool', p_operation_id: 'operation', p_owner: 'worker', p_fence: 2, p_expected_version: null });
    expect((await store.readState('bootstrap')).value.privateKey).toBe('fixture-private');
  });
  it('binds encrypted state to operation and state key rather than accepting ciphertext swaps', async () => {
    let saved;
    const client = { rpc: vi.fn(async (name, p) => {
      if (name === 'write_server_infrastructure_state') { saved = { ciphertext: p.p_ciphertext, version: 1 }; return { data: saved }; }
      return { data: saved };
    }) };
    const store = createInfrastructureStore({ context, client, getLease: () => lease });
    await store.saveState('bootstrap', { privateKey: 'fixture-private' }, null);
    await expect(store.readState('another-key')).rejects.toMatchObject({ code: 'PRIVATE_STATE_SCOPE_MISMATCH' });
  });
  it('does not write without a current lease and rejects conflicting creation identity', async () => {
    const client = { rpc: vi.fn() };
    const store = createInfrastructureStore({ context, client, getLease: () => null });
    await expect(store.claimCreateAttempt({ operationId: 'operation' })).rejects.toMatchObject({ code: 'STALE_FENCE' });
    expect(client.rpc).not.toHaveBeenCalled();
    const current = createInfrastructureStore({ context, client, getLease: () => lease });
    await expect(current.claimCreateAttempt({ operationId: 'another-operation' })).rejects.toMatchObject({ code: 'RESOURCE_SCOPE_MISMATCH' });
  });
  it('uses scoped resource reads and never turns labels into ownership registrations', async () => {
    const client = { rpc: vi.fn(async () => ({ data: null })) };
    const store = createInfrastructureStore({ context, client, getLease: () => lease });
    expect(await store.getResource({ kind: 'node', id: '51' })).toBeNull();
    expect(client.rpc).toHaveBeenCalledWith('read_server_infrastructure_resource', expect.objectContaining({ p_environment: 'development', p_pool_id: 'pool', p_kind: 'node', p_resource_id: '51', p_provider: '' }));
  });
  it('requires the storage migration to deny frontend writes and fence all mutable records', () => {
    const sql = fs.readFileSync(new URL('../../supabase/migrations/0045_server_infrastructure_runtime.sql', import.meta.url), 'utf8');
    for (const table of ['server_infrastructure_resources', 'server_provider_create_intents', 'server_infrastructure_state', 'server_service_operation_locks']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain('require_server_operation_lease');
    expect(sql).toContain('p_expected_version');
    expect(sql).toContain('PRIVATE_STATE_CONFLICT');
    expect(sql).toContain('OWNERSHIP_REGISTRATION_CONFLICT');
    expect(sql).toContain('revoke all');
    expect(sql).not.toContain('grant insert on');
  });
});
