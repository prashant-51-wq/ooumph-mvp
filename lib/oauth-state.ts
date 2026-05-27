/**
 * lib/oauth-state.ts
 *
 * AES-256-GCM-encrypted state tokens for OAuth redirect flows. The state
 * parameter we hand to a provider (LinkedIn, X, WordPress.com, etc.) is the
 * only signal we get back on the callback that lets us know *which*
 * workspace is connecting *which* platform — so it MUST be:
 *
 *   1. Tamper-proof: attacker can't forge a workspaceId
 *   2. Confidential: contains no secrets in cleartext
 *   3. Time-bound:   expires so a leaked state can't be replayed
 *   4. Single-use:   the nonce is opaque; a fresh nonce is issued per flow
 *
 * The encryption scheme reuses our master key from AUTH_SECRET via the
 * same scrypt derivation as lib/secrets.ts, so we don't add a new secret
 * to the deployment surface.
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard
const KEY_LENGTH = 32
const TAG_LENGTH = 16

function getMasterKey(): Buffer {
  const secret = process.env.AUTH_SECRET || 'ooumph-dev-secret-change-in-production'
  // Distinct salt from lib/secrets.ts so a leaked BYOK ciphertext can't be
  // replayed as an OAuth state token and vice versa.
  return crypto.scryptSync(secret, 'ooumph-oauth-state-salt', KEY_LENGTH)
}

export interface OAuthStatePayload {
  workspaceId: string
  platform: string
  /** Where to send the user once the callback finishes. */
  returnUrl?: string
  /** Issued-at (epoch seconds). */
  iat: number
  /** Expires-at (epoch seconds). */
  exp: number
  /** Random nonce — disambiguates two flows started in the same second. */
  nonce: string
  /** Optional user id for audit on callback. */
  userId?: string
}

/**
 * Pack + encrypt the state payload. The output is URL-safe base64 so it
 * drops cleanly into the OAuth `state` query param.
 */
export function encryptState(payload: Omit<OAuthStatePayload, 'iat' | 'exp' | 'nonce'> & {
  ttlSeconds?: number
}): string {
  const now = Math.floor(Date.now() / 1000)
  const ttl = payload.ttlSeconds ?? 600 // 10 minutes
  const fullPayload: OAuthStatePayload = {
    workspaceId: payload.workspaceId,
    platform: payload.platform,
    returnUrl: payload.returnUrl,
    userId: payload.userId,
    iat: now,
    exp: now + ttl,
    nonce: crypto.randomBytes(8).toString('hex'),
  }
  const plaintext = JSON.stringify(fullPayload)

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv) as crypto.CipherGCM
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // Pack: iv || tag || ciphertext → url-safe base64
  return Buffer.concat([iv, tag, ct])
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Verify + decrypt a state token. Returns null on any failure (bad token,
 * tampered ciphertext, expired exp). Never throws.
 */
export function decryptState(stateToken: string): OAuthStatePayload | null {
  try {
    if (!stateToken || stateToken.length > 4096) return null
    // Reverse url-safe base64
    const padLen = (4 - (stateToken.length % 4)) % 4
    const padded = stateToken.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen)
    const raw = Buffer.from(padded, 'base64')
    if (raw.length < IV_LENGTH + TAG_LENGTH + 1) return null

    const iv = raw.subarray(0, IV_LENGTH)
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
    const ct = raw.subarray(IV_LENGTH + TAG_LENGTH)

    const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv) as crypto.DecipherGCM
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
    const payload = JSON.parse(plaintext) as OAuthStatePayload

    // Validate shape
    if (!payload.workspaceId || !payload.platform || typeof payload.exp !== 'number') {
      return null
    }
    // Expiry check
    if (Math.floor(Date.now() / 1000) > payload.exp) {
      return null
    }
    return payload
  } catch {
    return null
  }
}
