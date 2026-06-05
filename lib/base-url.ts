/**
 * lib/base-url.ts — Sprint 19Y
 *
 * Server-side helper that returns the right absolute URL for self-fetch
 * (CMO calling /api/agents/strategy from inside an API route, for example).
 *
 * The bug this fixes: NEXT_PUBLIC_BASE_URL was set to "" in production,
 * and NEXT_PUBLIC_APP_URL was unset. CMO and a few other server routes
 * fell through to `http://localhost:3000`, which doesn't resolve on
 * Vercel. Every CMO execute → sub-agent call silently failed (TCP refused
 * at the function host). The user saw "Run complete" but no artifacts.
 *
 * Resolution order (highest priority first):
 *   1. NEXT_PUBLIC_BASE_URL  — explicit override, useful for staging
 *   2. NEXT_PUBLIC_APP_URL   — older variable name, same purpose
 *   3. VERCEL_URL            — auto-set by Vercel on every deploy; we
 *                              prepend https:// since Vercel strips it.
 *                              On a preview branch this is the branch
 *                              alias; on prod it's the deployment URL.
 *                              Aliases like `ooumph-mvp.vercel.app` are
 *                              NOT exposed here — VERCEL_URL is the
 *                              raw deployment ID URL. That's fine for
 *                              self-fetch (DNS resolves either way).
 *   4. http://localhost:3000 — local dev fallback. PORT is honored.
 */
export function getBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  if (process.env.VERCEL_URL) {
    // VERCEL_URL is the hostname only ("ooumph-xxx-yyy.vercel.app"); we
    // need the protocol too. Vercel functions run on HTTPS-only edges.
    return `https://${process.env.VERCEL_URL}`
  }
  return `http://localhost:${process.env.PORT || 3000}`
}
