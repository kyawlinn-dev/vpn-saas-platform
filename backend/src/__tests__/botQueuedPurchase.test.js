import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockMaybeSingle = vi.fn()
const mockSingle = vi.fn()
const mockLimit = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockFrom = vi.fn()

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: mockFrom,
    storage: { from: vi.fn() },
  },
}))

vi.mock('../services/commissionService.js', () => ({
  getPackageCommissionPercent: vi.fn().mockReturnValue(20),
}))

vi.mock('../services/paymentLedgerService.js', () => ({
  createOrderPayment: vi.fn().mockResolvedValue({ id: 'payment-1' }),
  loadOrderPayments: vi.fn().mockResolvedValue([]),
  confirmOrderPayments: vi.fn().mockResolvedValue({ order: { id: 'order-1', status: 'scheduled' } }),
  ensureCommissionEntry: vi.fn().mockResolvedValue({}),
}))

vi.mock('../services/orderLifecycleService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    activatePendingReviewPurchase: vi.fn().mockResolvedValue({
      order: { id: 'order-1', status: 'active' },
      expiry_date: '2026-10-29',
    }),
  };
})

const {
  getCustomerOrderPurchaseState,
  createBotPurchaseOrder,
  getCustomerQueuedOrder,
} = await import('../bot/botPurchaseService.js')
const { isQueuedPurchaseConflict } = await import('../services/queuedPurchasePolicy.js')

const {
  balanceText,
  balanceQueuedOnlyText,
  howToUseSS,
  howToUseVless,
  howtoQueuedNotice,
} = await import('../bot/strings.js')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getCustomerOrderPurchaseState', () => {
  it('allows purchase when customer has no active or scheduled orders', async () => {
    // 1st call for active: null
    // 2nd call for scheduled: null
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })

    mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle })
    mockEq.mockReturnValue({ eq: mockEq, limit: mockLimit })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })

    const res = await getCustomerOrderPurchaseState('cust-1', 'reseller-1')
    expect(res.canBuy).toBe(true)
    expect(res.isExtend).toBe(false)
  })

  it('allows buy (as extension) when customer has an active order but no queued order', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { id: 'active-1', status: 'active', review_status: 'confirmed' }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })

    mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle })
    mockEq.mockReturnValue({ eq: mockEq, limit: mockLimit })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })

    const res = await getCustomerOrderPurchaseState('cust-1', 'reseller-1')
    expect(res.canBuy).toBe(true)
    expect(res.isExtend).toBe(true)
    expect(res.activeOrder.id).toBe('active-1')
  })

  it('blocks buy when customer already has both active and queued orders', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { id: 'active-1', status: 'active' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'queued-1', status: 'scheduled' }, error: null })

    mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle })
    mockEq.mockReturnValue({ eq: mockEq, limit: mockLimit })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })

    const res = await getCustomerOrderPurchaseState('cust-1', 'reseller-1')
    expect(res.canBuy).toBe(false)
    expect(res.isExtend).toBe(true)
    expect(res.activeOrder).toBeTruthy()
    expect(res.queuedOrder).toBeTruthy()
  })

  it('blocks a second purchase while the active payment is under review', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { id: 'active-1', review_status: 'pending_review' }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle })
    mockEq.mockReturnValue({ eq: mockEq, limit: mockLimit })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })

    const state = await getCustomerOrderPurchaseState('cust-1', 'reseller-1')
    expect(state.canBuy).toBe(false)
    expect(state.blockReason).toBe('PURCHASE_UNDER_REVIEW')
  })

  it('blocks another purchase when a queued order exists without an active order', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'queued-1' }, error: null })
    mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle })
    mockEq.mockReturnValue({ eq: mockEq, limit: mockLimit })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })

    expect((await getCustomerOrderPurchaseState('cust-1', 'reseller-1')).canBuy).toBe(false)
  })
})

describe('queued purchase index conflict', () => {
  it('recognizes only the scheduled-purchase unique index', () => {
    expect(isQueuedPurchaseConflict({
      code: '23505',
      message: 'duplicate key value violates unique constraint "idx_vpn_orders_one_scheduled_purchase"',
    })).toBe(true)
    expect(isQueuedPurchaseConflict({ code: '23505', message: 'other_unique_index' })).toBe(false)
  })
})

describe('createBotPurchaseOrder', () => {
  it('throws CUSTOMER_ALREADY_QUEUED when customer already has active and scheduled orders', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'resellers') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'reseller-1' } }) }),
          }),
        }
      }
      if (table === 'vpn_plans') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'plan-1', price_mmk: 10000 } }) }) }) }),
          }),
        }
      }
      if (table === 'vpn_orders') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({ limit: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'active-1' } }) }) }),
                  limit: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'queued-1' } }) }),
                }),
              }),
            }),
          }),
        }
      }
      return {}
    })

    await expect(
      createBotPurchaseOrder({
        resellerId: 'reseller-1',
        customerId: 'cust-1',
        planId: 'plan-1',
        screenshotPath: 'screen.jpg',
      })
    ).rejects.toMatchObject({
      code: 'CUSTOMER_ALREADY_QUEUED',
    })
  })
})

describe('getCustomerQueuedOrder', () => {
  it('returns null when no scheduled order exists', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    mockEq.mockReturnValue({ eq: mockEq, order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })

    const res = await getCustomerQueuedOrder('cust-1', 'reseller-1')
    expect(res).toBeNull()
  })

  it('returns formatted queued plan info when a scheduled order exists', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'ord-scheduled-1',
        status: 'scheduled',
        order_type: 'purchase',
        vpn_plans: {
          id: 'plan-100',
          name: '100 GB Monthly',
          data_limit_gb: 100,
          duration_days: 30,
        },
      },
      error: null,
    })
    mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    mockEq.mockReturnValue({ eq: mockEq, order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })

    const res = await getCustomerQueuedOrder('cust-1', 'reseller-1')
    expect(res).toEqual({
      id: 'ord-scheduled-1',
      planName: '100 GB Monthly',
      dataLimitGb: 100,
      durationDays: 30,
    })
  })
})

describe('balanceText with queuedPlan', () => {
  const dummyDateFmt = (d) => d

  it('formats active plan balance without queuedPlan', () => {
    const text = balanceText({
      usedGb: 2.5,
      remainingGb: 7.5,
      isUnlimited: false,
      expiryDate: '2026-10-15',
      formatBurmeseDate: dummyDateFmt,
    })
    expect(text).toContain('အသုံးပြုထားသော ဒေတာ: <b>2.5 GB</b>')
    expect(text).toContain('ကျန်ရှိသော ဒေတာ: <b>7.5 GB</b>')
    expect(text).toContain('သက်တမ်းကုန်ဆုံးမည့်ရက်: 2026-10-15')
    expect(text).not.toContain('ကြိုတင်ဝယ်ယူထားသော နောက်ပက်ကေ့ဂျ်')
  })

  it('formats active plan balance and appends queuedPlan section when present', () => {
    const text = balanceText({
      usedGb: 5,
      remainingGb: 15,
      isUnlimited: false,
      expiryDate: '2026-10-15',
      formatBurmeseDate: dummyDateFmt,
      queuedPlan: {
        id: 'ord-q-1',
        planName: 'VIP 30 Days',
        dataLimitGb: 50,
        durationDays: 30,
      },
    })
    expect(text).toContain('အသုံးပြုထားသော ဒေတာ: <b>5 GB</b>')
    expect(text).toContain('ကျန်ရှိသော ဒေတာ: <b>15 GB</b>')
    expect(text).toContain('ကြိုတင်ဝယ်ယူထားသော နောက်ပက်ကေ့ဂျ်')
    expect(text).toContain('VIP 30 Days')
    expect(text).toContain('50 GB')
    expect(text).toContain('30 ရက်')
    expect(text).toContain('အလိုအလျောက် စတင်ပါမည်')
  })

  it('formats queuedPlan with unlimited data if dataLimitGb is null', () => {
    const text = balanceText({
      usedGb: 10,
      remainingGb: null,
      isUnlimited: true,
      expiryDate: null,
      formatBurmeseDate: dummyDateFmt,
      queuedPlan: {
        id: 'ord-q-2',
        planName: 'Unlimited Plan',
        dataLimitGb: null,
        durationDays: 30,
      },
    })
    expect(text).toContain('ကြိုတင်ဝယ်ယူထားသော နောက်ပက်ကေ့ဂျ်')
    expect(text).toContain('ဒေတာ: <b>Unlimited</b>')
  })
})

describe('balanceQueuedOnlyText', () => {
  it('formats message when customer only has a queued order waiting', () => {
    const text = balanceQueuedOnlyText({
      queuedPlan: {
        planName: 'Pro Plan',
        dataLimitGb: 20,
        durationDays: 15,
      },
    })
    expect(text).toContain('လက်ရှိ အသုံးပြုနိုင်သော ပက်ကေ့ဂျ် မရှိပါ')
    expect(text).toContain('ကြိုတင်ဝယ်ယူထားသော နောက်ပက်ကေ့ဂျ်')
    expect(text).toContain('Pro Plan')
    expect(text).toContain('20 GB')
    expect(text).toContain('15 ရက်')
  })
})

describe('howToUse with queued protocol notice', () => {
  it('formats howtoQueuedNotice for shadowsocks correctly', () => {
    const notice = howtoQueuedNotice('shadowsocks')
    expect(notice).toContain('နောက်အသုံးပြုမည့် package')
    expect(notice).toContain('Outline</b> နဲ့ သုံးပါ')
  })

  it('formats howtoQueuedNotice for vless correctly', () => {
    const notice = howtoQueuedNotice('vless')
    expect(notice).toContain('နောက်အသုံးပြုမည့် package')
    expect(notice).toContain('Hiddify / Happ / V2Box</b> နဲ့ သုံးပါ')
  })

  it('embeds queued notice inside howToUseVless when active is vless and queued is ss', () => {
    const notice = howtoQueuedNotice('shadowsocks')
    const text = howToUseVless(notice)
    expect(text).toContain('Hiddify / Happ / V2Box အသုံးပြုနည်း')
    expect(text).toContain('နောက်အသုံးပြုမည့် package')
    expect(text).toContain('Outline</b> နဲ့ သုံးပါ')
  })

  it('embeds queued notice inside howToUseSS when active is ss and queued is vless', () => {
    const notice = howtoQueuedNotice('vless')
    const text = howToUseSS(notice)
    expect(text).toContain('Outline အသုံးပြုနည်း')
    expect(text).toContain('နောက်အသုံးပြုမည့် package')
    expect(text).toContain('Hiddify / Happ / V2Box</b> နဲ့ သုံးပါ')
  })
})
