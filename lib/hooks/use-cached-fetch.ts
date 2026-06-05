'use client'

/**
 * lib/hooks/use-cached-fetch.ts — Sprint 20P
 *
 * Stale-while-revalidate fetch hook backed by both an in-memory cache
 * (module-level Map for same-session deduping) AND localStorage (so
 * the dashboard shows last-known data INSTANTLY across navigation and
 * page reloads while a fresh fetch runs in the background).
 *
 * Why not SWR / react-query?
 * --------------------------
 * Both are ~10-30 KB gzip. The dashboard only needs:
 *   1. Show cached data immediately on mount
 *   2. Background-revalidate once
 *   3. Dedupe concurrent identical requests
 *   4. Skip when the tab is hidden (Sprint 20M already added Page
 *      Visibility throttling at the polling layer)
 * Sixty lines covers it. No new dep, no version churn.
 *
 * Usage
 * -----
 *   const { data, isLoading, isStale, error, refetch } =
 *     useCachedFetch<StatsResponse>('/api/stats?workspaceId=' + wid, {
 *       cacheKey: `stats:${wid}`,
 *       maxAgeMs: 60_000,
 *       fallback: { artifacts: 0, pendingApprovals: 0, learningNotes: 0, completedTypes: [] },
 *     })
 *
 * Behavior
 * --------
 * - First mount: returns cached data from localStorage if present
 *   (isStale=true), then fires fetch in background.
 * - On 200: writes fresh data to memory + localStorage, isStale=false.
 * - On error: keeps last-good data visible, surfaces `error` so the
 *   caller can render an inline banner if they want.
 * - Concurrent mounts of the same cacheKey share one in-flight Promise.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface CachedEntry<T> {
  data: T
  ts: number
}

const memCache = new Map<string, CachedEntry<unknown>>()
const inflightMap = new Map<string, Promise<unknown>>()
const STORAGE_PREFIX = 'ooumph:cf:'

interface UseCachedFetchOptions<T> {
  /** Stable cache key. Distinguishes between fetches with different params. */
  cacheKey: string
  /** Cached data is considered fresh if newer than this many ms; otherwise
   *  we render it but flag `isStale=true` and trigger a background revalidate. */
  maxAgeMs?: number
  /** Returned as `data` when nothing's cached yet. Prevents the UI from
   *  blank-flashing on cold mounts. */
  fallback?: T
  /** Validate the parsed response. Default: accept anything. */
  validate?: (raw: unknown) => raw is T
  /** Re-fetch when the tab regains focus (default true). */
  revalidateOnFocus?: boolean
}

export interface UseCachedFetchResult<T> {
  data: T | undefined
  isLoading: boolean
  isStale: boolean
  error: string | null
  refetch: () => Promise<void>
}

function readPersisted<T>(cacheKey: string): CachedEntry<T> | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + cacheKey)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as CachedEntry<T>
    if (parsed && typeof parsed.ts === 'number') return parsed
  } catch { /* ignore */ }
  return undefined
}

function writePersisted<T>(cacheKey: string, entry: CachedEntry<T>): void {
  if (typeof window === 'undefined') return
  try {
    const payload = JSON.stringify(entry)
    // Don't blow localStorage on huge payloads.
    if (payload.length < 200_000) {
      window.localStorage.setItem(STORAGE_PREFIX + cacheKey, payload)
    }
  } catch { /* quota exceeded / private mode */ }
}

export function useCachedFetch<T>(
  url: string | null,
  opts: UseCachedFetchOptions<T>,
): UseCachedFetchResult<T> {
  const { cacheKey, maxAgeMs = 60_000, fallback, validate, revalidateOnFocus = true } = opts

  // Seed from memory → fallback. localStorage is loaded in an effect so
  // server and client render identically (no hydration mismatch — Sprint 20D).
  const seed = (memCache.get(cacheKey) as CachedEntry<T> | undefined)
  const [data, setData] = useState<T | undefined>(seed?.data ?? fallback)
  const [ts, setTs] = useState<number>(seed?.ts ?? 0)
  const [isLoading, setIsLoading] = useState<boolean>(!seed)
  const [error, setError] = useState<string | null>(null)
  const lastUrlRef = useRef<string | null>(null)

  const fetchAndStore = useCallback(async (targetUrl: string): Promise<void> => {
    // Dedupe: if another caller is already fetching this exact URL,
    // await their promise instead of firing a duplicate.
    let p = inflightMap.get(cacheKey) as Promise<T> | undefined
    if (!p) {
      p = (async () => {
        const res = await fetch(targetUrl, { credentials: 'include' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const raw: unknown = await res.json()
        if (validate && !validate(raw)) throw new Error('validation failed')
        return raw as T
      })()
      inflightMap.set(cacheKey, p as Promise<unknown>)
      p.finally(() => { inflightMap.delete(cacheKey) })
    }
    try {
      const fresh = await p
      const now = Date.now()
      const entry: CachedEntry<T> = { data: fresh, ts: now }
      memCache.set(cacheKey, entry as CachedEntry<unknown>)
      writePersisted(cacheKey, entry)
      setData(fresh)
      setTs(now)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [cacheKey, validate])

  // Hydrate from localStorage post-mount and decide whether to revalidate.
  useEffect(() => {
    if (!url) return
    lastUrlRef.current = url

    // 1. If memory has nothing, try localStorage.
    if (!memCache.has(cacheKey)) {
      const persisted = readPersisted<T>(cacheKey)
      if (persisted) {
        memCache.set(cacheKey, persisted as CachedEntry<unknown>)
        setData(persisted.data)
        setTs(persisted.ts)
        setIsLoading(false)
      }
    }

    // 2. Decide if we need to revalidate.
    const current = memCache.get(cacheKey) as CachedEntry<T> | undefined
    const age = current ? Date.now() - current.ts : Infinity
    if (age > maxAgeMs) {
      void fetchAndStore(url)
    }
  }, [url, cacheKey, maxAgeMs, fetchAndStore])

  // Re-fetch on tab refocus.
  useEffect(() => {
    if (!url || !revalidateOnFocus || typeof document === 'undefined') return
    const onVis = () => {
      if (document.hidden) return
      const current = memCache.get(cacheKey) as CachedEntry<T> | undefined
      const age = current ? Date.now() - current.ts : Infinity
      if (age > maxAgeMs) void fetchAndStore(url)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [url, cacheKey, maxAgeMs, fetchAndStore, revalidateOnFocus])

  const refetch = useCallback(async () => {
    if (!url) return
    setIsLoading(true)
    await fetchAndStore(url)
  }, [url, fetchAndStore])

  return {
    data,
    isLoading,
    isStale: ts > 0 && Date.now() - ts > maxAgeMs,
    error,
    refetch,
  }
}
