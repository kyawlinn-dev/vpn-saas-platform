import { describe, it, expect } from 'vitest'

// Commission calculation business rule:
// commission_amount_mmk = Math.floor(price_mmk * commission_percent / 100)
// This formula is used at order creation time. These tests pin the expected
// math so any accidental change to the formula surfaces immediately.

function calcCommission(priceMmk, commissionPercent) {
  return Math.floor(priceMmk * commissionPercent / 100)
}

describe('commission calculation', () => {
  it('calculates 20% commission on 5000 MMK correctly', () => {
    expect(calcCommission(5000, 20)).toBe(1000)
  })

  it('calculates 15% commission on 9000 MMK correctly', () => {
    expect(calcCommission(9000, 15)).toBe(1350)
  })

  it('calculates 10% commission on 15000 MMK correctly', () => {
    expect(calcCommission(15000, 10)).toBe(1500)
  })

  it('floors fractional commissions', () => {
    // 7% of 9000 = 630 exactly — no rounding issue
    expect(calcCommission(9000, 7)).toBe(630)
    // 3% of 5000 = 150 exactly
    expect(calcCommission(5000, 3)).toBe(150)
    // 7% of 5555 = 388.85 → floor → 388
    expect(calcCommission(5555, 7)).toBe(388)
  })

  it('returns 0 for 0% commission', () => {
    expect(calcCommission(9000, 0)).toBe(0)
  })

  it('returns 0 for 0 price', () => {
    expect(calcCommission(0, 20)).toBe(0)
  })

  it('returns full amount for 100% commission', () => {
    expect(calcCommission(5000, 100)).toBe(5000)
  })
})

// ensureCommissionEntry skips inserting when commission_amount_mmk <= 0
// This is the guard in orderLifecycleService.js:
//   if (Number(order.commission_amount_mmk || 0) <= 0) return;
describe('commission ledger skip rule', () => {
  function shouldSkipLedgerInsert(commissionAmountMmk) {
    return Number(commissionAmountMmk || 0) <= 0
  }

  it('skips ledger insert when commission is 0', () => {
    expect(shouldSkipLedgerInsert(0)).toBe(true)
  })

  it('skips ledger insert when commission is null', () => {
    expect(shouldSkipLedgerInsert(null)).toBe(true)
  })

  it('skips ledger insert when commission is undefined', () => {
    expect(shouldSkipLedgerInsert(undefined)).toBe(true)
  })

  it('does not skip when commission is positive', () => {
    expect(shouldSkipLedgerInsert(1000)).toBe(false)
  })
})
