import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockMaybeSingle = vi.fn()
const mockSingle = vi.fn()
const mockLimit = vi.fn()
const mockNeq = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: mockFrom },
}))

vi.mock('../services/tokenService.js', () => ({
  getTokenByOrderId: vi.fn(),
  ensureOrderToken: vi.fn(),
  deactivateToken: vi.fn(),
  activateToken: vi.fn(),
}))

vi.mock('../services/subscriptionProvisionService.js', () => ({
  provisionServersForToken: vi.fn(),
  deleteProvisionedKeysForOrder: vi.fn(),
  updateProvisionedKeyLimitsForOrder: vi.fn(),
  deactivateTokenAssignments: vi.fn(),
}))

vi.mock('../services/serverService.js', () => ({
  getActiveServers: vi.fn(),
  ServerAvailabilityError: class ServerAvailabilityError extends Error {},
}))

const { OrderLifecycleError, assertNoOtherActivePurchase, stopOrder } =
  await import('../services/orderLifecycleService.js')

beforeEach(() => vi.clearAllMocks())

// ─── OrderLifecycleError ──────────────────────────────────────────────────────

describe('OrderLifecycleError', () => {
  it('is an instance of Error', () => {
    const err = new OrderLifecycleError('test', 409, 'TEST_CODE')
    expect(err).toBeInstanceOf(Error)
  })

  it('carries status and code', () => {
    const err = new OrderLifecycleError('bad state', 409, 'INVALID_STATUS')
    expect(err.message).toBe('bad state')
    expect(err.status).toBe(409)
    expect(err.code).toBe('INVALID_STATUS')
  })

  it('defaults to status 400 and generic code', () => {
    const err = new OrderLifecycleError('oops')
    expect(err.status).toBe(400)
    expect(err.code).toBe('ORDER_LIFECYCLE_ERROR')
  })
})

// ─── assertNoOtherActivePurchase ──────────────────────────────────────────────

describe('assertNoOtherActivePurchase', () => {
  function chainQuery(data) {
    mockMaybeSingle.mockResolvedValue({ data, error: null })
    mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle })
    mockNeq.mockReturnValue({ limit: mockLimit })
    mockEq.mockReturnValue({ eq: mockEq, neq: mockNeq })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
  }

  it('resolves without error when no other active purchase exists', async () => {
    chainQuery(null)
    await expect(
      assertNoOtherActivePurchase({
        customerId: 'c1',
        resellerId: 'r1',
        excludeOrderId: 'o1',
      })
    ).resolves.toBeUndefined()
  })

  it('throws CUSTOMER_ALREADY_ACTIVE when another active purchase exists', async () => {
    chainQuery({ id: 'other-order' })
    await expect(
      assertNoOtherActivePurchase({
        customerId: 'c1',
        resellerId: 'r1',
        excludeOrderId: 'o1',
      })
    ).rejects.toMatchObject({
      code: 'CUSTOMER_ALREADY_ACTIVE',
      status: 409,
    })
  })
})

// ─── stopOrder ────────────────────────────────────────────────────────────────

describe('stopOrder', () => {
  function mockOrderQuery(order) {
    mockSingle.mockResolvedValue({ data: null, error: null })
    mockEq.mockReturnValue({ eq: mockEq, maybeSingle: mockMaybeSingle, select: mockSelect, single: mockSingle, update: vi.fn() })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect, update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })

    // getResellerScopedOrder uses .select().eq().eq().maybeSingle()
    mockMaybeSingle.mockResolvedValue({ data: order, error: null })
  }

  it('returns already_stopped immediately if order.status is stopped', async () => {
    mockOrderQuery({ id: 'o1', status: 'stopped', reseller_id: 'r1' })

    const { getTokenByOrderId } = await import('../services/tokenService.js')
    getTokenByOrderId.mockResolvedValue(null)

    const result = await stopOrder({ orderId: 'o1', resellerId: 'r1' })
    expect(result.already_stopped).toBe(true)
    expect(result.status).toBe('stopped')
  })
})
