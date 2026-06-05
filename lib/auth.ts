import crypto from 'crypto'

// Sprint 18A (audit pass #5 P0 #2): AUTH_SECRET defaulted to a public,
// hardcoded string used for BOTH JWT signing AND AES-256-GCM master key
// derivation. A prod deploy that forgot to set the env var ended up with
// forgeable sessions AND decryptable secrets. We now fail-loudly in
// production and fail-noisily in dev so the warning is impossible to miss.
const DEFAULT_SECRET = 'ooumph-dev-secret-change-in-production'
function resolveSecret(): string {
  const raw = process.env.AUTH_SECRET
  if (raw && raw.length >= 32 && raw !== DEFAULT_SECRET) return raw
  if (process.env.NODE_ENV === 'production') {
    // Fail boot. Any caller trying to mint or verify a token in production
    // without a real AUTH_SECRET should crash now, not silently downgrade
    // to a known-insecure key.
    throw new Error(
      '[lib/auth] AUTH_SECRET is unset, too short, or still set to the default. ' +
      'Set AUTH_SECRET to a >=32-char random value in your environment before booting in production.',
    )
  }
  // Dev — loud warning but allow the workflow.
  if (raw !== DEFAULT_SECRET) {
    console.warn('[lib/auth] AUTH_SECRET is missing or too short; falling back to the dev default. Sessions and BYOK encryption will NOT be secure.')
  }
  return raw || DEFAULT_SECRET
}
const SECRET = resolveSecret()

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(32).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return { hash, salt }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const attempt = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
    if (attempt.length !== hash.length) return false
    return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'))
  } catch { return false }
}

export function createToken(userId: string, workspaceId?: string): string {
  const payload = JSON.stringify({ userId, workspaceId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })
  const payloadB64 = Buffer.from(payload).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('hex')
  return `${payloadB64}.${sig}`
}

export function verifyToken(token: string): { userId: string; workspaceId?: string } | null {
  try {
    const dotIdx = token.lastIndexOf('.')
    if (dotIdx < 0) return null
    const payloadB64 = token.slice(0, dotIdx)
    const sig = token.slice(dotIdx + 1)
    const expectedSig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('hex')
    if (sig.length !== expectedSig.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null
    const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null
    return { userId: data.userId, workspaceId: data.workspaceId }
  } catch { return null }
}

export const COOKIE_NAME = 'ooumph_session'
