import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), create: vi.fn(), remove: vi.fn(), guard: vi.fn(), events: [], active: false, insertError: null, activeKeys: [], protocol: 'vless' }));
vi.mock('../lib/supabase.js', () => ({ supabase: { from: mocks.from } }));
vi.mock('../utils/telegramInitData.js', () => ({ verifyTelegramInitData: () => ({ valid: true, user: { id: 123 } }) }));
vi.mock('../lib/tokenEncryption.js', () => ({ decrypt: () => 'fixture-token' }));
vi.mock('../services/infrastructure/customerMutationGuard.js', () => ({ withCustomerInfrastructureMutation: mocks.guard }));
vi.mock('../services/vpnProviderService.js', () => ({ createKey: mocks.create, deleteKey: mocks.remove, getTransferMetrics: async () => ({ 'old-user': 42 }), serviceIdsForOrder: () => [5] }));
vi.mock('../services/serverAccessContext.js', () => ({ resolveServerAccessContext: async () => ({ publicAccessEnabled: false }) }));
vi.mock('../services/miniAppServerState.js', () => ({ isCurrentMiniAppServer: () => false, getMiniAppServerAccessState: () => ({ canAccess: true }) }));
vi.mock('../services/subscriptionProvisionService.js', () => ({ getOrderQuotaSnapshot: async () => ({ remainingBytes: 1000 }), resolveRemainingKeyLimitBytes: () => 1000 }));
vi.mock('../services/appEventService.js', () => ({ trackAppEvent: () => {}, buildRequestEventContext: () => ({}) }));
vi.mock('../services/serverService.js', () => ({ incrementServerUsage: async () => {}, decrementServerUsage: async () => {}, setServerError: async () => {}, clearServerError: async () => {} }));
import router from '../routes/public/resellerMiniappRoutes.js';
const handler = router.stack.find(layer => layer.route?.path === '/:slug/servers/:serverId/link').route.stack.at(-1).handle;
const customer = { id: 'customer', status: 'active', customer_type: 'telegram', full_name: 'Fixture' };
const order = { id: 'order', order_type: 'purchase', review_status: 'confirmed', expiry_date: '2099-01-01', vpn_plans: { data_limit_gb: 1 } };
describe('Mini App linking lifecycle boundary', () => {
  beforeEach(() => {
    mocks.events.length = 0; mocks.active = false; mocks.insertError = null; mocks.activeKeys = []; mocks.protocol = 'vless';
    vi.stubEnv('SERVER_LIFECYCLE_COORDINATION_ENABLED', 'true');
    mocks.guard.mockImplementation(async (_scope, action) => {
      mocks.active = true; mocks.events.push('guard:start');
      try { return await action(); }
      catch (error) { mocks.events.push('guard:uncertain'); throw error; }
      finally { mocks.active = false; mocks.events.push('guard:end'); }
    });
    mocks.create.mockImplementation(async () => { mocks.events.push(`create:${mocks.active}`); return { outline_key_id: 'panel-user', access_url: 'https://fixture.invalid/link' }; });
    mocks.remove.mockImplementation(async () => { mocks.events.push(`cleanup:${mocks.active}`); });
    mocks.from.mockImplementation(table => {
      let inserting = false; let selected = '';
      const values = { reseller_miniapps: { id: 'app', reseller_id: 'tenant', is_enabled: true, bot_token_encrypted: 'fixture' }, telegram_links: { vpn_customers: customer }, vpn_customers: { ssconf_token: 'fixture', protocol_preference: mocks.protocol }, vpn_servers: { id: 'server', name: 'DEV', status: 'active', panel_type: 'marzneshin' }, vpn_orders: [order], vpn_keys: mocks.activeKeys };
      const result = () => inserting ? { data: mocks.insertError ? null : { id: 'key', server_id: 'server', outline_key_id: 'panel-user', access_url: 'https://fixture.invalid/link' }, error: mocks.insertError } : { data: values[table], error: null };
      const query = { then: resolve => Promise.resolve(result()).then(resolve), single: async () => { if (inserting) mocks.events.push(`insert:${mocks.active}`); return result(); }, maybeSingle: async () => table === 'vpn_keys' ? { data: selected === 'id' ? { id: 'key' } : { id: 'old-key', status: 'active' } } : result() };
      for (const method of ['select', 'eq', 'is', 'order', 'gte', 'limit', 'update']) query[method] = () => query;
      query.select = value => { selected = value; return query; };
      query.insert = () => { inserting = true; return query; };
      return query;
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
  async function invoke() {
    const req = { params: { slug: 'dev', serverId: 'server' }, body: { telegram_user_id: 123, init_data: 'synthetic' }, get: () => '' };
    const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await handler(req, res); return res;
  }
  it('holds one tenant/order/server guard through panel creation and key persistence', async () => {
    const res = await invoke();
    expect(mocks.guard).toHaveBeenCalledWith(expect.objectContaining({ resellerId: 'tenant', orderIds: ['order'], serverIds: ['server'] }), expect.any(Function));
    expect(mocks.events).toEqual(['guard:start', 'create:true', 'insert:true', 'guard:end']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it('keeps rollback inside the guard and retains uncertainty on a persistence failure', async () => {
    mocks.insertError = { message: 'fixture failure' };
    await invoke();
    expect(mocks.events).toEqual(['guard:start', 'create:true', 'insert:true', 'cleanup:true', 'guard:uncertain', 'guard:end']);
  });
  it('holds coordination through the delayed Shadowsocks cleanup after responding', async () => {
    vi.useFakeTimers();
    mocks.protocol = 'shadowsocks';
    mocks.activeKeys = [{ id: 'old-key', server_id: 'old-server', outline_key_id: 'old-user', protocol: 'shadowsocks', vpn_servers: { id: 'old-server' } }];
    const pending = invoke();
    await vi.waitFor(() => expect(mocks.events).toContain('insert:true'));
    expect(mocks.active).toBe(true);
    await vi.advanceTimersByTimeAsync(30000);
    await pending;
    expect(mocks.events).toContain('cleanup:true');
    expect(mocks.events.at(-1)).toBe('guard:end');
    expect(mocks.guard).toHaveBeenCalledWith(expect.objectContaining({ serverIds: ['server', 'old-server'] }), expect.any(Function));
  });
});
