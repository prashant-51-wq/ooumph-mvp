'use client'

/**
 * /dashboard error boundary — Sprint 19P
 *
 * Catches any client-side render error within the dashboard tree and
 * shows a recoverable UI with three escape hatches:
 *
 *   1. "Reset draft state + reload" — clears all `ooumph:state:*` keys
 *      from localStorage. Fixes the most common cause we've actually
 *      hit: bloated cmo:messages locking the main thread on hydrate.
 *   2. "Reload page" — plain refresh, in case the error is transient.
 *   3. "Sign out" — escape hatch if everything else fails.
 *
 * Without this boundary, a thrown error in any nested client component
 * would propagate to the browser's blank "This page couldn't load."
 */
import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard error boundary]', error)
  }, [error])

  function clearStateAndReload() {
    try {
      const toRemove: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith('ooumph:state:')) toRemove.push(k)
      }
      toRemove.forEach(k => window.localStorage.removeItem(k))
    } catch { /* */ }
    window.location.reload()
  }

  async function signOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch { /* */ }
    try {
      window.localStorage.clear()
    } catch { /* */ }
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-900 border border-red-900/40 rounded-2xl p-6 space-y-5">
        <div className="flex items-start gap-3">
          <span className="text-3xl">⚠️</span>
          <div>
            <h1 className="text-white text-lg font-semibold mb-1">Something broke in the dashboard</h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              An unexpected error stopped this page from loading. Most often this is
              caused by oversized draft state in your browser&apos;s local storage.
            </p>
          </div>
        </div>

        <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Error</p>
          <p className="text-rose-300 text-xs font-mono break-words">{error.message || 'Unknown error'}</p>
          {error.digest && (
            <p className="text-gray-600 text-[10px] mt-1">Digest: {error.digest}</p>
          )}
        </div>

        <div className="space-y-2">
          <button
            onClick={clearStateAndReload}
            className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium">
            Clear draft state &amp; reload (fixes 90% of cases)
          </button>
          <button
            onClick={reset}
            className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium">
            Try again (re-render without reload)
          </button>
          <button
            type="button"
            onClick={() => {
              // Sprint 20H bug #4: some environments (SES lockdown / Chrome
              // sandbox / Brave shields) silently block window.location.reload().
              // Use href assignment to the same URL as a more robust fallback —
              // it forces a fresh navigation that browsers won't intercept.
              try { window.location.reload() } catch { /* fall through */ }
              try { window.location.href = window.location.href } catch { /* */ }
            }}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm">
            Full page reload
          </button>
          <a
            href="/dashboard"
            className="block text-center w-full px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm">
            Go to CMO Dashboard
          </a>
          <button
            onClick={signOut}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs">
            Sign out and start fresh
          </button>
        </div>

        <p className="text-gray-600 text-[11px]">
          If this keeps happening after clearing state, open browser DevTools (F12) → Console
          tab, copy the red error trace, and report it.
        </p>
      </div>
    </div>
  )
}
