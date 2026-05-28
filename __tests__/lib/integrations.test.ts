/**
 * Unit tests for lib/integrations.ts — Sprint 10E
 *
 * Locks in the invariants of the Sprint 9B encryption rollout BEFORE
 * Sprint 10B migrates the remaining 7 readers and flips
 * prepareAccessTokenWrite() to write '' to the plaintext column.
 * Without these tests, the call-site migration could silently regress:
 *   - "fall back to plaintext when encrypted column is empty" — needed
 *     for legacy rows until they're re-saved
 *   - "fall back to plaintext when encrypted decryption fails" — needed
 *     so a single corrupted/key-rotated row doesn't 401 the publish
 *   - "return null when BOTH columns are empty" — used to gate "no
 *     active integration" error paths
 *
 * Run from the repo root:
 *   npx vitest run __tests__/lib/integrations.test.ts
 *   (or: `npm test`, once the script is wired into package.json)
 */

// AUTH_SECRET must be set BEFORE importing lib/secrets (which reads it
// at module load via scryptSync inside getMasterKey). Tests use a
// fixed value so encrypt → decrypt is deterministic across runs.
process.env.AUTH_SECRET = 'test-suite-deterministic-secret'

import { describe, test, expect } from 'vitest'
import { readAccessToken, prepareAccessTokenWrite, tokenPreview } from '@/lib/integrations'
import { encryptSecret } from '@/lib/secrets'

describe('readAccessToken', () => {
  test('returns null when row is null/undefined', () => {
    expect(readAccessToken(null)).toBe(null)
    expect(readAccessToken(undefined)).toBe(null)
  })

  test('returns null when both columns are empty', () => {
    expect(readAccessToken({ access_token: '', encrypted_access_token: '' })).toBe(null)
    expect(readAccessToken({ access_token: null, encrypted_access_token: null })).toBe(null)
    expect(readAccessToken({})).toBe(null)
  })

  test('prefers encrypted column (decrypted) when populated', () => {
    const plaintext = 'sk-real-token-abc123'
    const encrypted = encryptSecret(plaintext)
    // Even when plaintext column ALSO has a value, the encrypted column wins.
    expect(readAccessToken({
      access_token: 'this-is-stale-DO-NOT-RETURN',
      encrypted_access_token: encrypted,
    })).toBe(plaintext)
  })

  test('falls back to plaintext column when encrypted is empty (legacy row)', () => {
    expect(readAccessToken({ access_token: 'legacy-plaintext-token', encrypted_access_token: null }))
      .toBe('legacy-plaintext-token')
    expect(readAccessToken({ access_token: 'legacy-plaintext-token', encrypted_access_token: '' }))
      .toBe('legacy-plaintext-token')
  })

  test('falls back to plaintext when encrypted column fails to decrypt', () => {
    // A garbage value simulates either a corrupted row or an AUTH_SECRET
    // rotation that orphaned the row. Falling back to plaintext keeps
    // publishes working in those cases.
    expect(readAccessToken({
      access_token: 'fallback-plaintext-token',
      encrypted_access_token: 'this-is-not-a-valid-ciphertext-blob',
    })).toBe('fallback-plaintext-token')
  })

  test('returns null when encrypted decrypts to empty AND plaintext is empty', () => {
    // Edge case — encrypting '' is technically valid but yields no token.
    const encryptedEmpty = encryptSecret('')
    expect(readAccessToken({ access_token: '', encrypted_access_token: encryptedEmpty })).toBe(null)
  })

  test('trims whitespace-only values to null', () => {
    expect(readAccessToken({ access_token: '   ', encrypted_access_token: '' })).toBe(null)
    expect(readAccessToken({ access_token: '', encrypted_access_token: '   ' })).toBe(null)
  })
})

describe('prepareAccessTokenWrite', () => {
  test('returns empty result for empty input — supports disconnect path', () => {
    const result = prepareAccessTokenWrite('')
    expect(result.plaintext).toBe('')
    expect(result.encrypted).toBe(null)
  })

  test('produces a round-trippable encrypted blob, plaintext column empty (Phase 2)', () => {
    const plaintext = 'sk-ant-test-round-trip-token'
    const result = prepareAccessTokenWrite(plaintext)
    // Sprint 10B Phase 2: now that every reader uses readAccessToken(),
    // writers stop populating the plaintext column.
    expect(result.plaintext).toBe('')
    expect(result.encrypted).toBeTruthy()
    // Verify the encrypted blob, when stored as the encrypted column,
    // is what readAccessToken() unwraps.
    expect(readAccessToken({ access_token: '', encrypted_access_token: result.encrypted }))
      .toBe(plaintext)
  })

  test('two writes of the same plaintext produce DIFFERENT ciphertexts', () => {
    // AES-GCM uses a random IV, so identical plaintext should not produce
    // identical ciphertext. Important security property — without this,
    // an attacker observing two rows with the same encrypted blob would
    // learn that the plaintext is identical.
    const a = prepareAccessTokenWrite('sk-same-token')
    const b = prepareAccessTokenWrite('sk-same-token')
    expect(a.encrypted).not.toBe(b.encrypted)
    // But both decrypt to the same plaintext.
    expect(readAccessToken({ access_token: '', encrypted_access_token: a.encrypted })).toBe('sk-same-token')
    expect(readAccessToken({ access_token: '', encrypted_access_token: b.encrypted })).toBe('sk-same-token')
  })
})

describe('tokenPreview', () => {
  test('returns empty string for null/undefined/empty row', () => {
    expect(tokenPreview(null)).toBe('')
    expect(tokenPreview(undefined)).toBe('')
    expect(tokenPreview({})).toBe('')
    expect(tokenPreview({ access_token: '', encrypted_access_token: '' })).toBe('')
  })

  test('returns first 4 chars by default', () => {
    expect(tokenPreview({ access_token: 'abcdefghij', encrypted_access_token: null })).toBe('abcd')
  })

  test('respects custom char count', () => {
    expect(tokenPreview({ access_token: 'abcdefghij', encrypted_access_token: null }, 8)).toBe('abcdefgh')
    expect(tokenPreview({ access_token: 'abcdefghij', encrypted_access_token: null }, 2)).toBe('ab')
  })

  test('previews the DECRYPTED value when encrypted column is populated', () => {
    const encrypted = encryptSecret('sk-ant-supersecret')
    expect(tokenPreview({ access_token: 'STALE', encrypted_access_token: encrypted }, 6)).toBe('sk-ant')
  })

  test('handles tokens shorter than the requested preview length', () => {
    expect(tokenPreview({ access_token: 'ab', encrypted_access_token: null }, 4)).toBe('ab')
  })
})
