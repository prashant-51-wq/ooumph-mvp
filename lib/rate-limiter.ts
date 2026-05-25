/**
 * lib/rate-limiter.ts
 * In-memory IP-based rate limiter for login endpoints.
 * Max 5 attempts per 15 minutes per IP. Resets on successful login.
 */

interface RateLimitEntry {
  count: number
  firstAttemptAt: number
}

const store = new Map<string, RateLimitEntry>()
const WINDOW_MS = 15 * 60 * 1000  // 15 minutes
const MAX_ATTEMPTS = 5

// Cleanup old entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (now - entry.firstAttemptAt > WINDOW_MS) {
        store.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}

/**
 * Records an attempt and returns whether the IP is now blocked.
 * Returns { blocked: true, retryAfterSeconds } if rate limited.
 * Returns { blocked: false } if OK.
 */
export function checkRateLimit(ip: string): { blocked: boolean; retryAfterSeconds?: number } {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now - entry.firstAttemptAt > WINDOW_MS) {
    // Fresh window
    store.set(ip, { count: 1, firstAttemptAt: now })
    return { blocked: false }
  }

  entry.count++
  if (entry.count > MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - entry.firstAttemptAt)) / 1000)
    return { blocked: true, retryAfterSeconds }
  }

  return { blocked: false }
}

/**
 * Clears the rate limit entry for an IP (call after successful login).
 */
export function clearRateLimit(ip: string): void {
  store.delete(ip)
}
