import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tests for the autoStopJob date logic and expiry detection.
// The job runs hourly and finds orders where:
//   status = 'active' AND expiry_date < today()

// today() function from autoStopJob.js
function today() {
  return new Date().toISOString().slice(0, 10)
}

// Determines if an order should be stopped
function shouldAutoStop(order) {
  return order.status === 'active' && order.expiry_date < today()
}

describe('autoStop date logic', () => {
  it('today() returns a YYYY-MM-DD formatted string', () => {
    const result = today()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('today() matches current UTC date', () => {
    const expected = new Date().toISOString().slice(0, 10)
    expect(today()).toBe(expected)
  })
})

describe('autoStop expiry detection', () => {
  it('stops an active order with expiry in the past', () => {
    const order = { status: 'active', expiry_date: '2020-01-01' }
    expect(shouldAutoStop(order)).toBe(true)
  })

  it('does not stop an active order expiring today', () => {
    const order = { status: 'active', expiry_date: today() }
    // expiry_date is NOT less than today — same day means still valid
    expect(shouldAutoStop(order)).toBe(false)
  })

  it('does not stop an active order with future expiry', () => {
    const future = new Date()
    future.setDate(future.getDate() + 10)
    const order = { status: 'active', expiry_date: future.toISOString().slice(0, 10) }
    expect(shouldAutoStop(order)).toBe(false)
  })

  it('does not stop a stopped order even with past expiry', () => {
    const order = { status: 'stopped', expiry_date: '2020-01-01' }
    expect(shouldAutoStop(order)).toBe(false)
  })

  it('does not stop a pending order with past expiry', () => {
    const order = { status: 'pending', expiry_date: '2020-01-01' }
    expect(shouldAutoStop(order)).toBe(false)
  })

  it('does not stop an expired-status order (already handled)', () => {
    const order = { status: 'expired', expiry_date: '2020-01-01' }
    expect(shouldAutoStop(order)).toBe(false)
  })
})
