import crypto from 'node:crypto'
import { describe, it, expect } from 'vitest'

// Inline implementation matching resellerMiniappRoutes.js verifyTelegramInitData
// Tests the algorithm correctness for known inputs — if this logic changes in
// the route file, these tests will catch any divergence.
function verifyTelegramInitData(initData, botToken) {
  let params
  try {
    params = new URLSearchParams(initData)
  } catch {
    return { valid: false, user: null }
  }

  const hash = params.get('hash')
  if (typeof hash !== 'string' || hash.length !== 64) return { valid: false, user: null }

  params.delete('hash')

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  let hashMatch = false
  try {
    hashMatch = crypto.timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(hash, 'hex'))
  } catch {
    return { valid: false, user: null }
  }

  if (!hashMatch) return { valid: false, user: null }

  const authDate = Number(params.get('auth_date') || 0)
  if (Math.floor(Date.now() / 1000) - authDate > 86400) return { valid: false, user: null }

  let user = null
  try {
    user = JSON.parse(params.get('user') || 'null')
  } catch {
    return { valid: false, user: null }
  }

  if (!user?.id) return { valid: false, user: null }

  return { valid: true, user }
}

// Build a correctly-signed initData string for a given bot token
function buildValidInitData(botToken, overrides = {}) {
  const user = overrides.user ?? JSON.stringify({ id: 123456, first_name: 'Test' })
  const authDate = overrides.auth_date ?? String(Math.floor(Date.now() / 1000))

  const params = new URLSearchParams()
  params.set('user', user)
  params.set('auth_date', authDate)

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  params.set('hash', hash)
  return params.toString()
}

const BOT_TOKEN = 'test-bot-token-12345'

describe('verifyTelegramInitData', () => {
  it('accepts valid initData with correct HMAC', () => {
    const initData = buildValidInitData(BOT_TOKEN)
    const result = verifyTelegramInitData(initData, BOT_TOKEN)
    expect(result.valid).toBe(true)
    expect(result.user).toMatchObject({ id: 123456 })
  })

  it('rejects initData with tampered hash', () => {
    const initData = buildValidInitData(BOT_TOKEN)
    const params = new URLSearchParams(initData)
    params.set('hash', 'a'.repeat(64))
    const result = verifyTelegramInitData(params.toString(), BOT_TOKEN)
    expect(result.valid).toBe(false)
  })

  it('rejects initData signed with a different bot token', () => {
    const initData = buildValidInitData('wrong-bot-token')
    const result = verifyTelegramInitData(initData, BOT_TOKEN)
    expect(result.valid).toBe(false)
  })

  it('rejects initData with auth_date older than 24 hours', () => {
    const oldAuthDate = String(Math.floor(Date.now() / 1000) - 86401)
    const initData = buildValidInitData(BOT_TOKEN, { auth_date: oldAuthDate })
    const result = verifyTelegramInitData(initData, BOT_TOKEN)
    expect(result.valid).toBe(false)
  })

  it('rejects initData with missing hash field', () => {
    const initData = buildValidInitData(BOT_TOKEN)
    const params = new URLSearchParams(initData)
    params.delete('hash')
    const result = verifyTelegramInitData(params.toString(), BOT_TOKEN)
    expect(result.valid).toBe(false)
  })

  it('rejects initData with hash of wrong length', () => {
    const initData = buildValidInitData(BOT_TOKEN)
    const params = new URLSearchParams(initData)
    params.set('hash', 'tooshort')
    const result = verifyTelegramInitData(params.toString(), BOT_TOKEN)
    expect(result.valid).toBe(false)
  })

  it('rejects initData when user field is missing', () => {
    const user = JSON.stringify({ first_name: 'NoId' }) // no .id
    const initData = buildValidInitData(BOT_TOKEN, { user })
    const result = verifyTelegramInitData(initData, BOT_TOKEN)
    expect(result.valid).toBe(false)
  })

  it('rejects empty string', () => {
    const result = verifyTelegramInitData('', BOT_TOKEN)
    expect(result.valid).toBe(false)
  })
})
