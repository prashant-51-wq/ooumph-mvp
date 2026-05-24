import crypto from 'crypto'

const SECRET = process.env.AUTH_SECRET || 'ooumph-dev-secret-change-in-production'

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
