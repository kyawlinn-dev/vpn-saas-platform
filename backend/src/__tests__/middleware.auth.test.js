import { vi, describe, it, expect, beforeEach } from 'vitest'

// Must be declared before importing the modules under test
const mockMaybeSingle = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: mockFrom },
}))

// Import after mock is declared so vitest hoisting works
const { requireAdmin } = await import('../middleware/requireAdmin.js')
const { requireActiveReseller } = await import('../middleware/requireActiveReseller.js')

function makeRes() {
  const res = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  return res
}

function chainedQuery(result) {
  mockMaybeSingle.mockResolvedValue(result)
  mockEq.mockReturnValue({ eq: mockEq, maybeSingle: mockMaybeSingle })
  mockSelect.mockReturnValue({ eq: mockEq })
  mockFrom.mockReturnValue({ select: mockSelect })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── requireAdmin ─────────────────────────────────────────────────────────────

describe('requireAdmin', () => {
  it('returns 401 when req.user is missing', async () => {
    const req = {}
    const res = makeRes()
    const next = vi.fn()

    await requireAdmin(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when no admin row found', async () => {
    chainedQuery({ data: null, error: null })
    const req = { user: { id: 'uuid-1' } }
    const res = makeRes()
    const next = vi.fn()

    await requireAdmin(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when admin.status is disabled', async () => {
    chainedQuery({ data: { id: 'a1', status: 'disabled' }, error: null })
    const req = { user: { id: 'uuid-1' } }
    const res = makeRes()
    const next = vi.fn()

    await requireAdmin(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next() and sets req.admin when admin is active', async () => {
    const admin = { id: 'a1', status: 'active', full_name: 'Admin' }
    chainedQuery({ data: admin, error: null })
    const req = { user: { id: 'uuid-1' } }
    const res = makeRes()
    const next = vi.fn()

    await requireAdmin(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.admin).toEqual(admin)
  })

  it('returns 500 when Supabase returns an error', async () => {
    chainedQuery({ data: null, error: { message: 'db error' } })
    const req = { user: { id: 'uuid-1' } }
    const res = makeRes()
    const next = vi.fn()

    await requireAdmin(req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(next).not.toHaveBeenCalled()
  })
})

// ─── requireActiveReseller ────────────────────────────────────────────────────

describe('requireActiveReseller', () => {
  it('returns 401 when req.user is missing', async () => {
    const req = {}
    const res = makeRes()
    const next = vi.fn()

    await requireActiveReseller(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when no reseller row found', async () => {
    chainedQuery({ data: null, error: null })
    const req = { user: { id: 'uuid-2' } }
    const res = makeRes()
    const next = vi.fn()

    await requireActiveReseller(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when reseller.status is disabled', async () => {
    chainedQuery({ data: { id: 'r1', status: 'disabled' }, error: null })
    const req = { user: { id: 'uuid-2' } }
    const res = makeRes()
    const next = vi.fn()

    await requireActiveReseller(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next() and sets req.reseller when reseller is active', async () => {
    const reseller = { id: 'r1', status: 'active', name: 'Demo' }
    chainedQuery({ data: reseller, error: null })
    const req = { user: { id: 'uuid-2' } }
    const res = makeRes()
    const next = vi.fn()

    await requireActiveReseller(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.reseller).toEqual(reseller)
  })
})
