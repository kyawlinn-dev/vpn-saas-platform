import { describe, it, expect } from 'vitest'

// Tests for the expiry date extension logic used in orderLifecycleService.extendOrder.
//
// Business rule: when extending an order, the new expiry is calculated from
// the current expiry_date IF it's in the future, otherwise from today.
// This prevents stacking renewals from the past.

function calcExtendedExpiry(currentExpiryDate, durationDays) {
  const base =
    currentExpiryDate && new Date(currentExpiryDate) > new Date()
      ? new Date(currentExpiryDate)
      : new Date()

  const d = new Date(base)
  d.setDate(d.getDate() + Number(durationDays || 30))
  return d
}

describe('order extension expiry calculation', () => {
  it('extends from current expiry when expiry is in the future', () => {
    const future = new Date()
    future.setDate(future.getDate() + 10) // expires in 10 days
    const futureStr = future.toISOString().slice(0, 10)

    const result = calcExtendedExpiry(futureStr, 30)
    const expected = new Date(future)
    expected.setDate(expected.getDate() + 30)

    expect(result.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10))
  })

  it('extends from today when order is already expired', () => {
    const past = new Date()
    past.setDate(past.getDate() - 5) // expired 5 days ago
    const pastStr = past.toISOString().slice(0, 10)

    const result = calcExtendedExpiry(pastStr, 30)
    const expected = new Date()
    expected.setDate(expected.getDate() + 30)

    expect(result.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10))
  })

  it('extends from today when expiry_date is null', () => {
    const result = calcExtendedExpiry(null, 30)
    const expected = new Date()
    expected.setDate(expected.getDate() + 30)

    expect(result.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10))
  })

  it('adds correct number of days for different plan durations', () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    const futureStr = future.toISOString().slice(0, 10)

    const result7 = calcExtendedExpiry(futureStr, 7)
    const result30 = calcExtendedExpiry(futureStr, 30)
    const result90 = calcExtendedExpiry(futureStr, 90)

    const diff = (a, b) => Math.round((a - b) / (1000 * 60 * 60 * 24))

    expect(diff(result7, new Date(futureStr))).toBe(7)
    expect(diff(result30, new Date(futureStr))).toBe(30)
    expect(diff(result90, new Date(futureStr))).toBe(90)
  })
})

// Server capacity guard: no key should be provisioned if
// current_active_keys >= max_active_keys
describe('server capacity guard', () => {
  function canProvision(server) {
    return server.current_active_keys < server.max_active_keys
  }

  it('allows provisioning when under capacity', () => {
    expect(canProvision({ current_active_keys: 49, max_active_keys: 100 })).toBe(true)
  })

  it('blocks provisioning when at capacity', () => {
    expect(canProvision({ current_active_keys: 100, max_active_keys: 100 })).toBe(false)
  })

  it('blocks provisioning when over capacity', () => {
    expect(canProvision({ current_active_keys: 101, max_active_keys: 100 })).toBe(false)
  })

  it('allows provisioning with one slot left', () => {
    expect(canProvision({ current_active_keys: 99, max_active_keys: 100 })).toBe(true)
  })
})
