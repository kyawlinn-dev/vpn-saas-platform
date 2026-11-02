import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({from: vi.fn(), rpc: vi.fn(), stop: vi.fn(), events: []}));
vi.mock('../lib/supabase.js', () => ({supabase: {from: mocks.from, rpc: mocks.rpc}}));
vi.mock('../services/orderLifecycleService.js', () => ({stopOrderAccess: mocks.stop}));
import router from '../routes/admin/adminDataRouter.js';

const handler = router.stack.find(layer => layer.route?.path === '/customers/cleanup-delete').route.stack[0].handle;
const customer = '11111111-1111-4111-8111-111111111111';
const reseller = '22222222-2222-4222-8222-222222222222';
const order = '33333333-3333-4333-8333-333333333333';
const response = () => ({statusCode: 200, status(value) {this.statusCode = value; return this;}, json: vi.fn(function(value) {this.body = value; return this;})});
const request = (overrides = {}) => ({body: {reseller_id: reseller, customer_ids: [customer], confirmation: 'DELETE TEST CUSTOMERS', ...overrides}});

beforeEach(() => {
  vi.clearAllMocks(); mocks.events.length = 0;
  mocks.from.mockImplementation(table => {
    const data = table === 'vpn_customers' ? [{id: customer, reseller_id: reseller, full_name: 'Test', reseller: {name: 'DEV'}}]
      : table === 'vpn_orders' ? [{id: order, customer_id: customer, reseller_id: reseller, status: 'stopped', order_type: 'trial'}] : [];
    const query = {then(resolve) {return Promise.resolve({data, error: null}).then(resolve);}};
    for (const method of ['select','eq','in','order','range']) query[method] = () => query;
    query.delete = vi.fn(() => {throw new Error('Sequential cleanup must not run');});
    return query;
  });
  mocks.rpc.mockImplementation(async (_name, args) => {
    mocks.events.push(args.p_dry_run ? 'preflight' : 'commit');
    return {data: {vpn_customers: 1, customer_trial_claims: 1}, error: null};
  });
  mocks.stop.mockImplementation(async () => {mocks.events.push('stop');});
});

describe('admin selected test-customer cleanup', () => {
  it('uses one atomic cleanup RPC after access revocation, including trial history', async () => {
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(200);
    expect(mocks.events).toEqual(['preflight','stop','commit']);
    expect(mocks.rpc).toHaveBeenLastCalledWith('cleanup_test_customers', {
      p_reseller_id: reseller, p_customer_ids: [customer], p_expected_order_ids: [order],
      p_confirmation: 'DELETE TEST CUSTOMERS', p_allow_paid_customers: false, p_dry_run: false,
    });
    expect(res.body.deleted).toMatchObject({vpn_customers: 1, customer_trial_claims: 1});
  });
  it('does not revoke access when the required migration is missing', async () => {
    mocks.rpc.mockResolvedValue({data: null, error: {code: 'PGRST202', message: 'Function not found'}});
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(503);
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(res.body.error).toContain('0050');
  });
  it('preserves explicit confirmation before destructive work', async () => {
    const res = response(); await handler(request({confirmation: ''}), res);
    expect(res.statusCode).toBe(400);
    expect(mocks.stop).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('returns a conflict if provisioning is still running', async () => {
    mocks.rpc.mockResolvedValue({data: null, error: {message: 'CUSTOMER_CLEANUP_BUSY'}});
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(409); expect(mocks.stop).not.toHaveBeenCalled();
  });
  it('does not delete database rows if access revocation throws', async () => {
    mocks.stop.mockRejectedValueOnce(new Error('Panel unavailable'));
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(500);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][1].p_dry_run).toBe(true);
  });
});
