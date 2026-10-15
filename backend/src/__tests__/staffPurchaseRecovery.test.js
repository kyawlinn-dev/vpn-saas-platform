import { it, expect, vi } from 'vitest';
const { from, prepare, ensure, setup } = vi.hoisted(() => ({ from: vi.fn(), prepare: vi.fn(), ensure: vi.fn(), setup: vi.fn() }));
vi.mock('../lib/supabase.js', () => ({ supabase: { from } }));
vi.mock('../services/dashboardPurchaseService.js', () => ({ prepareDashboardPurchase: prepare, ensureDashboardPurchaseOperation: ensure, runDashboardPurchaseSetup: setup }));
import { renewOrder, extendOrder } from '../services/orderLifecycleService.js';

it.each(['dashboard', 'admin'])('paid %s renewal and next purchase use durable receipt/setup without deleting failed sales', async source => {
  const plan = { id: 'plan', price_mmk: 5000, duration_days: 30, is_active: true, is_trial: false };
  const old = { id: 'old', customer_id: 'customer', reseller_id: 'reseller', status: 'expired', review_status: 'confirmed', plan, customer: { full_name: 'Fixture' } };
  const inserted = { ...old, id: 'new', status: 'pending', source, order_type: 'purchase', payment_status: 'paid' };
  const writes = [];
  from.mockImplementation(table => {
    let id, other = false;
    const q = { select: () => q, eq: (key, value) => { if (key === 'id') id = value; return q; },
      neq: () => { other = true; return q; }, limit: () => q,
      then: resolve => resolve({data:[],error:null}),
      insert: () => { writes.push('insert'); throw new Error('must record through atomic purchase RPC'); },
      delete: () => { writes.push('delete'); throw new Error('must preserve received money'); },
      maybeSingle: async () => ({ data: other || table === 'order_payments' ? null : table === 'resellers' ? { id: 'reseller', commission_percent: 20 } : id === 'new' ? inserted : old, error: null }) };
    return q;
  });
  prepare.mockResolvedValue({ order_id: 'new' });
  ensure.mockResolvedValue({});
  setup.mockResolvedValue({ success: true, order_id: 'new', purchase_outcome: 'setup_failed' });
  const key = '44444444-4444-4444-8444-444444444444';
  expect(await renewOrder({ orderId: 'old', reseller: { id: 'reseller' }, idempotencyKey: key, source })).toMatchObject({ order_id: 'new', purchase_outcome: 'setup_failed' });
  expect(prepare).toHaveBeenLastCalledWith(expect.objectContaining({ requestKey: key, payload: expect.objectContaining({ customer_id: 'customer', source, payment_type: 'renew', origin_order_id: 'old', payment_status: 'paid' }) }));
  old.status = 'active';
  setup.mockResolvedValue({ success: true, order_id: 'new', purchase_outcome: 'queued' });
  expect(await extendOrder({ orderId: 'old', resellerId: 'reseller', idempotencyKey: key, source })).toMatchObject({ order_id: 'new', queued: true });
  expect(writes).toEqual([]);
});
