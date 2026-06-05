/**
 * lib/rate-limiter.ts
 *
 * In-memory rate limiting with two independent stores:
 *
 *   1. Login limiter (existing) — 5 attempts / 15 min per IP.
 *      Fixed-window counter. Used by /api/auth/login.
 *
 *   2. API sliding-window limiter (new) — configurable per endpoint.
 *      Sliding window using a circular timestamp ring. Key is
 *      `{ip}:{endpoint}` so limits are per-route, not global.
 *      Default: 60 req / 60 s for standard endpoints.
 *
 * Both stores run cleanup every 5 minutes so stale entries don't
 * accumulate in long-lived serverless warm instances.
 *
 * Usage (API routes):
 *
 *   import { checkApiRateLimit } from '@/lib/rate-limiter'
 *
 *   export async function GET(req: NextRequest) {
 *     const limited = checkApiRateLimit(req, 'stats')
 *     if (limited) return limited   // already a NextResponse 429
 *     // ...
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'

// ── Login limiter (unchanged) ───────────────────────────────────────────────

interface RateLimitEntry {
  count: number
  firstAttemptAt: number
}

const loginStore = new Map<string, RateLimitEntry>()
const LOGIN_WINDOW_MS = 15 * 60 * 1000  // 15 minutes
const LOGIN_MAX_ATTEMPTS = 5

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of loginStore.entries()) {
      if (now - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
        loginStore.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}

/**
 * Records a login attempt and returns whether the IP is now blocked.
 */
export function checkRateLimit(ip: string): { blocked: boolean; retryAfterSeconds?: number } {
  const now = Date.now()
  const entry = loginStore.get(ip)

  if (!entry || now - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginStore.set(ip, { count: 1, firstAttemptAt: now })
    return { blocked: false }
  }

  entry.count++
  if (entry.count > LOGIN_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((LOGIN_WINDOW_MS - (now - entry.firstAttemptAt)) / 1000)
    return { blocked: true, retryAfterSeconds }
  }

  return { blocked: false }
}

/**
 * Clears the login rate limit for an IP (call after successful login).
 */
export function clearRateLimit(ip: string): void {
  loginStore.delete(ip)
}

// ── Sliding-window API limiter ─────────────────────────────────────────────

export interface ApiRateLimitConfig {
  /** Rolling window in milliseconds */
  windowMs: number
  /** Maximum requests allowed within the window */
  maxRequests: number
}

/** Named endpoint configs. Add new endpoints here as the API surface grows. */
export const API_RATE_LIMIT_CONFIGS: Record<string, ApiRateLimitConfig> = {
  // Data-heavy read endpoints — 60 req/min prevents dashboard hammering
  stats:         { windowMs: 60_000, maxRequests: 60 },
  // LLM-backed generation — 60 req/min limits runaway spend from one tenant
  'agents/cmo':  { windowMs: 60_000, maxRequests: 60 },
  // Public form endpoint — 60/min stops basic flood attacks
  'lp-submit':   { windowMs: 60_000, maxRequests: 60 },
  // Default for any unlisted endpoint registered with checkApiRateLimit
  default:       { windowMs: 60_000, maxRequests: 120 },
}

// Sliding-window store: key → sorted array of request timestamps (ms)
const apiStore = new Map<string, number[]>()

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    // Maximum possible window across all configs — entries older than this are dead.
    const maxWindow = Math.max(...Object.values(API_RATE_LIMIT_CONFIGS).map(c => c.windowMs))
    for (const [key, timestamps] of apiStore.entries()) {
      const fresh = timestamps.filter(t => now - t <= maxWindow)
      if (fresh.length === 0) {
        apiStore.delete(key)
      } else {
        apiStore.set(key, fresh)
      }
    }
  }, 5 * 60 * 1000)
}

/**
 * Sliding-window check. Returns the number of remaining requests in the
 * window if not limited, or a negative sentinel (-1) if blocked.
 *
 * Internal helper — prefer `checkApiRateLimit` for route handlers.
 */
function slidingWindowCheck(
  key: string,
  config: ApiRateLimitConfig,
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now()
  const windowStart = now - config.windowMs
  const timestamps = (apiStore.get(key) || []).filter(t => t > windowStart)

  if (timestamps.length >= config.maxRequests) {
    // The oldest timestamp in the window tells us when a slot will free up.
    const oldestInWindow = timestamps[0] ?? now
    const retryAfterMs = oldestInWindow + config.windowMs - now
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 0) }
  }

  timestamps.push(now)
  apiStore.set(key, timestamps)
  return {
    allowed: true,
    remaining: config.maxRequests - timestamps.length,
    retryAfterMs: 0,
  }
}

/**
 * Resolves the caller's IP from the request. Prefers Vercel's forwarded
 * header, falls back to x-real-ip, then a development sentinel.
 */
function resolveIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

/**
 * Check and record a request against the sliding-window limiter for a named
 * endpoint. Returns a NextResponse 429 if the caller is over-limit, or null
 * if the request should proceed.
 *
 * @param req      Incoming NextRequest (used to resolve caller IP).
 * @param endpoint Named key from API_RATE_LIMIT_CONFIGS (e.g. 'stats').
 *                 Falls back to 'default' config if not found.
 *
 * Usage:
 *   const limited = checkApiRateLimit(req, 'stats')
 *   if (limited) return limited
 */
export function checkApiRateLimit(
  req: NextRequest,
  endpoint = 'default',
): NextResponse | null {
  const config = API_RATE_LIMIT_CONFIGS[endpoint] ?? API_RATE_LIMIT_CONFIGS.default
  const ip = resolveIp(req)
  const key = `${ip}:${endpoint}`

  const result = slidingWindowCheck(key, config)

  if (!result.allowed) {
    const retryAfterSecs = Math.ceil(result.retryAfterMs / 1000)
    return NextResponse.json(
      {
        error: 'Too many requests. Please slow down.',
        retryAfterSeconds: retryAfterSecs,
        endpoint,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSecs),
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil((Date.now() + result.retryAfterMs) / 1000)),
        },
      },
    )
  }

  return null
}
