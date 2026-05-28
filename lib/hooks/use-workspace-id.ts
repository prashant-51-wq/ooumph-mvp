'use client'

/**
 * lib/hooks/use-workspace-id.ts — Sprint 9E
 *
 * Single source of truth for "which workspace is the current session
 * scoped to" on the client. Backs out the long-standing pattern of
 * scattering `localStorage.getItem('workspaceId')` across every
 * dashboard page.
 *
 * Why we needed this:
 *   - `localStorage` and the auth-cookie session can drift. If a user
 *     opens a second tab, signs out, signs back in as a different
 *     account, the localStorage value in the OLD tab still points at
 *     the previous workspace. The next save / test / fetch on the old
 *     tab silently writes to the wrong tenant.
 *   - Server-side (`getSessionWorkspaceId`) reads straight from the
 *     signed JWT cookie — it can't drift. The client should follow
 *     the same source.
 *
 * Behavior:
 *   - On mount, fetches `/api/auth/me` and trusts the workspaceId in
 *     the response (session-derived).
 *   - Mirrors the resolved value back to localStorage so legacy code
 *     that still calls `localStorage.getItem('workspaceId')` directly
 *     keeps working — but the hook is the canonical path.
 *   - Returns null while loading; returns the workspaceId once
 *     known. The `loading` flag lets the caller decide whether to
 *     render a spinner or proceed.
 *   - SSR-safe: the hook does nothing during the server render.
 *
 * Migration plan for existing pages:
 *   Replace:
 *     const wsId = localStorage.getItem('workspaceId') || ''
 *   with:
 *     const { workspaceId, loading } = useWorkspaceId()
 *     if (loading || !workspaceId) return  // or render skeleton
 *
 * Pages already on this pattern can keep doing what they do; the
 * localStorage mirror keeps them working. New pages and the
 * highest-traffic surfaces should migrate to the hook.
 */

import { useEffect, useState } from 'react'

interface MeResponse {
  user: {
    id: string
    email: string
    name: string
    isAdmin: boolean
    workspaceId: string | null
    workspaceName: string | null
  } | null
}

export interface UseWorkspaceIdResult {
  workspaceId: string | null
  loading: boolean
  error: string | null
  /** True once /api/auth/me responded — the workspaceId is final. */
  resolved: boolean
}

let _cachedMe: MeResponse['user'] | null = null
let _cacheFetchedAt = 0
const CACHE_TTL_MS = 60_000  // 1 minute — short enough to catch a workspace switch, long enough to dedupe.

/**
 * React hook returning the current session's workspaceId. SSR-safe.
 *
 * The hook caches the /api/auth/me response in a module-level variable
 * for 60s so dozens of mounted components don't each fire their own
 * request on the same page load.
 */
export function useWorkspaceId(): UseWorkspaceIdResult {
  const [state, setState] = useState<UseWorkspaceIdResult>(() => {
    // Hydrate optimistically from localStorage so the first render
    // isn't blank for users who already had a session. The fetch
    // will reconcile within ~50ms.
    if (typeof window !== 'undefined') {
      const ls = window.localStorage.getItem('workspaceId')
      if (ls) {
        return { workspaceId: ls, loading: true, error: null, resolved: false }
      }
    }
    return { workspaceId: null, loading: true, error: null, resolved: false }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false

    const now = Date.now()
    if (_cachedMe && now - _cacheFetchedAt < CACHE_TTL_MS) {
      // Use the cached value, but still mark resolved so callers can
      // proceed without waiting.
      const wsId = _cachedMe.workspaceId || null
      if (wsId) window.localStorage.setItem('workspaceId', wsId)
      else window.localStorage.removeItem('workspaceId')
      setState({ workspaceId: wsId, loading: false, error: null, resolved: true })
      return
    }

    fetch('/api/auth/me', { credentials: 'include' })
      .then(async r => r.ok ? (r.json() as Promise<MeResponse>) : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => {
        if (cancelled) return
        _cachedMe = j.user
        _cacheFetchedAt = Date.now()
        const wsId = j.user?.workspaceId || null
        if (wsId) window.localStorage.setItem('workspaceId', wsId)
        // We deliberately do NOT clear localStorage on an absent user
        // here, because /api/auth/me legitimately returns user=null on
        // 401 (e.g. expired session) and we don't want to wipe state
        // that the next sign-in will overwrite anyway.
        setState({ workspaceId: wsId, loading: false, error: null, resolved: true })
      })
      .catch(e => {
        if (cancelled) return
        // On network error, keep whatever optimistic localStorage value
        // we hydrated with — better than going blank.
        setState(prev => ({ ...prev, loading: false, error: e instanceof Error ? e.message : String(e), resolved: false }))
      })

    return () => { cancelled = true }
  }, [])

  return state
}

/**
 * Force-clear the cached /me response. Call after sign-out or
 * workspace-switch flows so the next useWorkspaceId() mount refetches.
 */
export function clearWorkspaceCache(): void {
  _cachedMe = null
  _cacheFetchedAt = 0
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('workspaceId')
  }
}
