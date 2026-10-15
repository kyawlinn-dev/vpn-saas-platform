import { it, expect, vi } from 'vitest';
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../lib/supabase.js', () => ({ supabase: { from, rpc } }));
import { confirmOrderPayments, summarizePayments } from '../services/paymentLedgerService.js';

it('concurrent confirmation of an unpaid dashboard purchase records one initial receipt', async () => {
  const order = { id: 'order-1', customer_id: 'customer-1', reseller_id: 'reseller-1', source: 'dashboard', order_type: 'purchase', payment_status: 'unpaid', price_mmk: 5000, commission_percent: 20 };
  const payments = [];
  let initialReads = 0;
  let releaseReads;
  const bothLoaded = new Promise(resolve => { releaseReads = resolve; });
  from.mockImplementation(table => {
    let inserted;
    const filters = {};
    const query = {
      select: () => query,
      eq: (key, value) => { filters[key] = value; return query; },
      insert: row => { inserted = row; return query; },
      order: async () => {
        const snapshot = [...payments];
        if (++initialReads <= 2) { if (initialReads === 2) releaseReads(); await bothLoaded; }
        return { data: snapshot, error: null };
      },
      maybeSingle: async () => ({ data: payments.find(row => row.reseller_id === filters.reseller_id && row.idempotency_key === filters.idempotency_key), error: null }),
      single: async () => {
        if (table === 'vpn_orders') return { data: order, error: null };
        if (inserted.idempotency_key && payments.some(row => row.reseller_id === inserted.reseller_id && row.idempotency_key === inserted.idempotency_key)) return { data: null, error: { code: '23505' } };
        const row = { ...inserted, id: 'payment-' + (payments.length + 1) };
        payments.push(row);
        return { data: row, error: null };
      },
    };
    return query;
  });
  rpc.mockImplementation(async () => {
    payments.forEach(row => { row.review_status = 'confirmed'; row.apply_status = 'applied'; });
    return { error: null };
  });
  await Promise.all([1, 2].map(() => confirmOrderPayments({ order, reviewerResellerId: order.reseller_id })));
  expect(payments).toHaveLength(1);
  expect(summarizePayments(payments)).toMatchObject({ confirmed_amount_mmk: 5000, confirmed_commission_mmk: 1000, confirmed_platform_due_mmk: 4000 });
});
