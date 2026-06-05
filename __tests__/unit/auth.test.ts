/**
 * __tests__/unit/auth.test.ts
 *
 * Tests for lib/auth.ts — TASK-013 from TASK_BREAKDOWN.md
 *
 * Per TEST_PLAN.md:
 *   AUTH-001 test cases cover password hashing, token creation,
 *   token verification, expiry, and tamper detection.
 *
 * These are PURE UNIT TESTS — no DB, no network, no Next.js.
 * Run: npm test
 */

// Set AUTH_SECRET before importing auth (it reads env at module load)
process.env.AUTH_SECRET = 'test-suite-auth-secret-32-chars-min!!'
process.env.NODE_ENV = 'test'

import { describe, test, expect } from 'vitest'
import { hashPassword, verifyPassword, createToken, verifyToken } from '@/lib/auth'

// ── Password hashing ─────────────────────────────────────────────────────────

describe('hashPassword', () => {
  test('returns a hash and a salt', () => {
    const result = hashPassword('mySecurePassword123!')
    expect(result).toHaveProperty('hash')
    expect(result).toHaveProperty('salt')
    expect(typeof result.hash).toBe('string')
    expect(typeof result.salt).toBe('string')
    expect(result.hash.length).toBeGreaterThan(32)
    expect(result.salt.length).toBeGreaterThan(32)
  })

  test('produces different hash and salt on each call (no determinism)', () => {
    const r1 = hashPassword('samePassword')
    const r2 = hashPassword('samePassword')
    expect(r1.salt).not.toBe(r2.salt)
    expect(r1.hash).not.toBe(r2.hash)
  })

  test('hash is never the plaintext password', () => {
    const password = 'plainTextPassword'
    const { hash } = hashPassword(password)
    expect(hash).not.toContain(password)
  })
})

// ── Password verification ─────────────────────────────────────────────────────

describe('verifyPassword', () => {
  test('returns true for correct password', () => {
    const password = 'correctPassword123!'
    const { hash, salt } = hashPassword(password)
    expect(verifyPassword(password, hash, salt)).toBe(true)
  })

  test('returns false for wrong password', () => {
    const { hash, salt } = hashPassword('realPassword')
    expect(verifyPassword('wrongPassword', hash, salt)).toBe(false)
  })

  test('returns false for empty password', () => {
    const { hash, salt } = hashPassword('realPassword')
    expect(verifyPassword('', hash, salt)).toBe(false)
  })

  test('returns false when hash is tampered', () => {
    const password = 'testPassword'
    const { hash, salt } = hashPassword(password)
    const tamperedHash = hash.slice(0, -4) + 'aaaa' // mutate last 4 chars
    expect(verifyPassword(password, tamperedHash, salt)).toBe(false)
  })

  test('returns false when salt is wrong', () => {
    const password = 'testPassword'
    const { hash } = hashPassword(password)
    const wrongSalt = 'completely-wrong-salt-value-here'
    expect(verifyPassword(password, hash, wrongSalt)).toBe(false)
  })

  test('uses timing-safe comparison (no short-circuit)', () => {
    // We can't directly test timing-safe but we can verify it handles
    // different-length inputs without throwing
    const { hash, salt } = hashPassword('test')
    expect(() => verifyPassword('x', hash, salt)).not.toThrow()
    expect(() => verifyPassword('x'.repeat(1000), hash, salt)).not.toThrow()
  })
})

// ── Token creation ────────────────────────────────────────────────────────────

describe('createToken', () => {
  test('returns a string with a dot separator', () => {
    const token = createToken('user-123', 'ws-abc')
    expect(typeof token).toBe('string')
    expect(token).toContain('.')
  })

  test('token contains userId and workspaceId', () => {
    const userId = 'user-abc-123'
    const workspaceId = 'ws-def-456'
    const token = createToken(userId, workspaceId)
    // Decode the payload (base64url before the last dot)
    const payloadB64 = token.substring(0, token.lastIndexOf('.'))
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    expect(payload.userId).toBe(userId)
    expect(payload.workspaceId).toBe(workspaceId)
  })

  test('token has future expiry', () => {
    const token = createToken('user-123')
    const payloadB64 = token.substring(0, token.lastIndexOf('.'))
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    expect(payload.exp).toBeGreaterThan(Date.now())
  })

  test('two tokens for the same user differ (different exp timestamps)', async () => {
    const t1 = createToken('user-123', 'ws-abc')
    await new Promise(r => setTimeout(r, 2)) // ensure time difference
    const t2 = createToken('user-123', 'ws-abc')
    // Tokens differ because expiry changes each call
    expect(t1).not.toBe(t2)
  })
})

// ── Token verification ────────────────────────────────────────────────────────

describe('verifyToken', () => {
  test('returns userId and workspaceId for a valid token', () => {
    const token = createToken('user-xyz', 'ws-xyz')
    const result = verifyToken(token)
    expect(result).not.toBeNull()
    expect(result?.userId).toBe('user-xyz')
    expect(result?.workspaceId).toBe('ws-xyz')
  })

  test('returns null for an empty string', () => {
    expect(verifyToken('')).toBeNull()
  })

  test('returns null for a garbage string', () => {
    expect(verifyToken('not.a.real.token.at.all')).toBeNull()
  })

  test('returns null for a token with tampered payload', () => {
    const token = createToken('user-123', 'ws-abc')
    const parts = token.split('.')
    // Replace payload with a different user
    const fakePayload = Buffer.from(
      JSON.stringify({ userId: 'attacker', workspaceId: 'ws-other', exp: Date.now() + 99999999 })
    ).toString('base64url')
    const tamperedToken = `${fakePayload}.${parts[parts.length - 1]}`
    expect(verifyToken(tamperedToken)).toBeNull()
  })

  test('returns null for a token with tampered signature', () => {
    const token = createToken('user-123', 'ws-abc')
    const dotIdx = token.lastIndexOf('.')
    const tamperedToken = token.slice(0, dotIdx) + '.deadbeef00000000'
    expect(verifyToken(tamperedToken)).toBeNull()
  })

  test('returns null for an expired token', () => {
    // Create a token with a past expiry by directly constructing it
    const expiredPayload = JSON.stringify({
      userId: 'user-123',
      workspaceId: 'ws-abc',
      exp: Date.now() - 1000, // already expired
    })
    const payloadB64 = Buffer.from(expiredPayload).toString('base64url')
    // We can't sign it correctly with the real SECRET but we can verify that
    // a valid token with past exp is rejected — simulate by checking that
    // expiry validation logic fires. We do this by directly testing the
    // JSON.parse path through a valid-structure but tampered token.
    // The cleanest way: verify a real expired token is impossible to forge,
    // so instead we verify the guard works via mutation.

    // Use the real signing so we can test the expiry path:
    const crypto = require('crypto')
    const secret = process.env.AUTH_SECRET!
    const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex')
    const expiredToken = `${payloadB64}.${sig}`
    expect(verifyToken(expiredToken)).toBeNull()
  })

  test('works without workspaceId (optional field)', () => {
    const token = createToken('user-only')
    const result = verifyToken(token)
    expect(result).not.toBeNull()
    expect(result?.userId).toBe('user-only')
    expect(result?.workspaceId).toBeUndefined()
  })
})
