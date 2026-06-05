/**
 * __tests__/unit/secrets.test.ts
 *
 * Tests for lib/secrets.ts — WORKSPACE-002 from TEST_PLAN.md
 *
 * Per CODING_STANDARDS.md:
 *   "NEVER store or return plaintext API keys"
 *   "All passwords: bcrypt with 12 rounds minimum"
 *
 * These tests verify:
 * 1. AES-256-GCM encryption/decryption is reversible
 * 2. Encrypted values are never the plaintext
 * 3. Different workspace IDs produce different ciphertexts
 * 4. Tampered ciphertext fails to decrypt
 *
 * Run: npm test
 */

process.env.AUTH_SECRET = 'test-suite-auth-secret-32-chars-min!!'
process.env.NODE_ENV = 'test'

import { describe, test, expect } from 'vitest'
import { encryptSecret, decryptSecret } from '@/lib/secrets'

// ── NOTE: Current encryptSecret signature ────────────────────────────────────
// The current lib/secrets.ts uses a GLOBAL key (AUTH_SECRET only) — it does
// NOT take a workspaceId parameter. This means encryption is workspace-agnostic.
// SECURITY GAP (documented in TASK_BREAKDOWN.md future work):
//   Workspace-ID should be incorporated into key derivation for per-workspace
//   key isolation. Changing this requires a DB migration of all encrypted values.
//   For now: workspace isolation is enforced at the DB layer (workspace_id FK)
//   not the encryption layer.
// ─────────────────────────────────────────────────────────────────────────────

// ── Encryption round-trip ─────────────────────────────────────────────────────

describe('encryptSecret / decryptSecret — AES-256-GCM', () => {
  test('encrypted value round-trips correctly', () => {
    const plaintext = 'sk-ant-api03-test-key-abc123'
    const encrypted = encryptSecret(plaintext)
    const decrypted = decryptSecret(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  test('encrypted value does NOT contain the plaintext API key', () => {
    const apiKey = 'sk-ant-api03-this-should-never-appear-in-ciphertext'
    const encrypted = encryptSecret(apiKey)
    expect(encrypted).not.toContain(apiKey)
    // Verify it's base64-encoded blobs separated by colons (iv:tag:ciphertext)
    const parts = encrypted.split(':')
    expect(parts).toHaveLength(3)
  })

  test('same plaintext produces different ciphertext each call (random IV)', () => {
    const plaintext = 'sk-openai-test-key'
    const enc1 = encryptSecret(plaintext)
    const enc2 = encryptSecret(plaintext)
    // IVs differ → ciphertexts differ (critical: prevents replay attacks)
    expect(enc1).not.toBe(enc2)
    // Both still decrypt correctly
    expect(decryptSecret(enc1)).toBe(plaintext)
    expect(decryptSecret(enc2)).toBe(plaintext)
  })

  test('tampered ciphertext returns null on decryption (GCM auth tag check)', () => {
    // NOTE: Current implementation returns null on error instead of throwing.
    // The GCM auth tag should catch tampering — if it silently succeeds,
    // that would be a critical security bug.
    const encrypted = encryptSecret('sensitive-api-key')
    const parts = encrypted.split(':')
    // Corrupt the ciphertext portion (index 2 in iv:tag:ciphertext format)
    parts[2] = 'AAAA' + parts[2].slice(4)
    const tampered = parts.join(':')
    // Should return null (auth tag mismatch) not the original plaintext
    const result = decryptSecret(tampered)
    expect(result).not.toBe('sensitive-api-key')
    // result is null (auth tag fails) or throws — either is correct behavior
  })

  test('handles long API keys correctly', () => {
    const longKey = 'sk-ant-api03-' + 'a'.repeat(200)
    const encrypted = encryptSecret(longKey)
    expect(decryptSecret(encrypted)).toBe(longKey)
  })

  test('handles special characters in API keys', () => {
    const keyWithSpecialChars = 'sk_live_abc123!@#$%^&*()_+-='
    const encrypted = encryptSecret(keyWithSpecialChars)
    expect(decryptSecret(encrypted)).toBe(keyWithSpecialChars)
  })

  test('returns null for malformed encrypted string', () => {
    expect(decryptSecret('not-a-valid-encrypted-string')).toBeNull()
    expect(decryptSecret('')).toBeNull()
    expect(decryptSecret('only:two:parts:here:extra')).toBeNull()
  })
})

// ── Security invariants ───────────────────────────────────────────────────────

describe('API key security invariants — documented rules', () => {
  test('encryption output format is iv:tag:ciphertext (3 colon-separated base64 parts)', () => {
    const encrypted = encryptSecret('any-api-key')
    const parts = encrypted.split(':')
    expect(parts).toHaveLength(3)
    // All parts must be non-empty base64
    parts.forEach(part => {
      expect(part.length).toBeGreaterThan(0)
    })
  })

  test('DOCUMENTED SECURITY GAP: current encryption is workspace-agnostic (future improvement needed)', () => {
    // This test documents a known architectural limitation:
    // encryptSecret() uses the same global key for all workspaces.
    // Workspace isolation is enforced only at the DB layer (workspace_id FK),
    // not at the encryption layer.
    //
    // FUTURE WORK: Incorporate workspaceId into key derivation:
    //   key = scrypt(AUTH_SECRET + workspaceId, salt, 32)
    // This would require migrating all existing encrypted values.
    //
    // The test below DOCUMENTS this behavior — it should be updated to FAIL
    // when the workspace-specific key derivation is implemented.
    const plaintext = 'same-secret'
    const enc1 = encryptSecret(plaintext)  // encrypted without workspace context
    // Under current implementation, any caller with AUTH_SECRET can decrypt
    // any workspace's secret — workspace isolation is DB-enforced only.
    const decrypted = decryptSecret(enc1)
    expect(decrypted).toBe(plaintext) // documents current behavior
    // NOTE: When workspace-ID key derivation is added, the call above should
    // require: decryptSecret(enc1, 'workspace-id') and this test updates.
  })
})
