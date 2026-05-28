/**
 * lib/integrations.ts — Sprint 9B
 *
 * Shared accessor for the `integrations` table's access_token. The table
 * has TWO storage columns:
 *
 *   - `encrypted_access_token` (TEXT, added in Sprint 9B). AES-256-GCM via
 *     lib/secrets.ts. The new default. Set by /api/integrations POST and
 *     the OAuth callback for any row created or re-saved after 9B.
 *
 *   - `access_token` (TEXT, the legacy column). Plaintext. Still populated
 *     during the migration window so the ~16 routes that read it directly
 *     don't break. Once every reader has migrated to readAccessToken(),
 *     a follow-up sprint can blank this column out on each write.
 *
 * Why a helper rather than schema migration alone:
 *   - Writers don't all share a path (POST, OAuth callback, GHL, refresh)
 *   - Readers don't all share a path (publish, publish/direct, agents,
 *     calendar, webhooks)
 *   - Doing the rollout in two phases (dual-write first, drop plaintext
 *     later) keeps the deploy reversible and avoids a flag-day cutover.
 *
 * Usage:
 *
 *   import { readAccessToken, prepareAccessTokenWrite } from '@/lib/integrations'
 *
 *   // Read path:
 *   const token = readAccessToken(row)   // string | null
 *
 *   // Write path:
 *   const w = prepareAccessTokenWrite(plaintext)
 *   await sql`INSERT INTO integrations (... access_token, encrypted_access_token ...)
 *             VALUES (... ${w.plaintext}, ${w.encrypted} ...)`
 */

import { encryptSecret, decryptSecret } from '@/lib/secrets'

/** Shape we'll accept — works for either Postgres or SQLite query rows. */
export interface IntegrationLikeRow {
  access_token?: string | null
  encrypted_access_token?: string | null
}

/**
 * Returns the plaintext access token from an integrations row.
 * Prefers the encrypted column (decrypted) when present; falls back to the
 * legacy plaintext column for rows that pre-date Sprint 9B.
 *
 * Returns null if neither column has a value, or if the encrypted column
 * fails to decrypt (corrupted / wrong key).
 */
export function readAccessToken(row: IntegrationLikeRow | null | undefined): string | null {
  if (!row) return null
  const enc = (row.encrypted_access_token || '').trim()
  if (enc) {
    const plain = decryptSecret(enc)
    if (plain) return plain
    // Decrypt failed (likely a corrupted row or key rotation). Fall through
    // to plaintext if present so the caller can still publish — better
    // than a silent 401 from the provider.
  }
  const plain = (row.access_token || '').trim()
  return plain || null
}

/**
 * Prepare a token for storage. Returns { plaintext, encrypted } so the
 * caller can write to BOTH columns during the migration window.
 *
 * Once every reader has switched to readAccessToken(), a follow-up sprint
 * can change the call sites to write '' to plaintext.
 *
 * Pass an empty string to clear both columns (e.g. on disconnect).
 */
export function prepareAccessTokenWrite(plaintext: string): {
  plaintext: string
  encrypted: string | null
} {
  if (!plaintext) return { plaintext: '', encrypted: null }
  return {
    // Sprint 10B Phase 2: all 10 readers now go through readAccessToken(),
    // so new writes can stop populating the plaintext column. We send ''
    // (rather than NULL) because some Postgres deployments set the
    // column NOT NULL — defense in depth. The encrypted column is the
    // sole source of truth for newly-written rows.
    //
    // Legacy rows that still have plaintext populated continue to work
    // because readAccessToken() falls back to access_token when
    // encrypted_access_token is empty. A future migration can backfill
    // those legacy rows by reading + re-saving via this helper.
    plaintext: '',
    encrypted: encryptSecret(plaintext),
  }
}

/**
 * Display preview for an access token (first N chars, masked tail).
 * Works regardless of which column the row was stored in. Used by
 * /api/integrations GET to render "abcd••••••••" in the UI without
 * sending the live token to the client.
 */
export function tokenPreview(row: IntegrationLikeRow | null | undefined, chars = 4): string {
  const t = readAccessToken(row)
  if (!t) return ''
  return t.slice(0, chars)
}
