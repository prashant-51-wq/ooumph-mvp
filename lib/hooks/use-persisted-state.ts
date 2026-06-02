'use client'

/**
 * lib/hooks/use-persisted-state.ts — Sprint 19M
 *
 * Drop-in replacement for `useState` that mirrors the value to localStorage,
 * so dashboard pages don't reset everything when the user navigates away
 * and comes back. Survives page refresh too.
 *
 * Per-user only (localStorage is browser-local). Not multi-device. For
 * multi-device drafts use a server-backed `drafts` table instead — but
 * that's heavier infrastructure and 90% of the pain is solved at the
 * single-browser level.
 *
 * Usage (identical to useState):
 *
 *   const [prompt, setPrompt] = usePersistedState('cmo:prompt', '')
 *   const [messages, setMessages] = usePersistedState<Message[]>('cmo:messages', [])
 *
 * The first arg is a stable storage key — namespace it so two pages
 * don't collide. Convention: `<page>:<field>` (e.g. `cmo:messages`,
 * `image-gen:prompt`).
 *
 * SSR-safe: returns the default value during server render, hydrates
 * from localStorage on first client effect. Brief flash possible if the
 * server-rendered default differs from the persisted value — acceptable
 * for our use-case (most defaults are empty / null).
 *
 * Sync across tabs: listens to the `storage` event so editing in one
 * tab updates other tabs of the same site on the same key.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const PREFIX = 'ooumph:state:'

type SetStateAction<T> = T | ((prev: T) => T)

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (next: SetStateAction<T>) => void] {
  const storageKey = PREFIX + key
  const initial = useRef<T>(defaultValue)
  const hydrated = useRef(false)

  const [value, setValue] = useState<T>(defaultValue)

  // Hydrate from localStorage on mount.
  // Sprint 19P: skip hydration when the stored payload is huge. Parsing a
  // multi-MB JSON blob on the main thread blocks for seconds and crashes
  // the tab with "This page couldn't load." If a previous session bloated
  // the entry (Sprint 19O fixes future writes but legacy entries already
  // out there can still cripple a fresh page load), we discard them and
  // start from the default — the user loses old draft state but gets a
  // working dashboard back. Threshold matches the write-side 1 MB cap.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw !== null) {
        if (raw.length > 1_000_000) {
          console.warn(`[usePersistedState] discarding bloated ${storageKey} (${(raw.length / 1024).toFixed(0)} KB) — using default`)
          try { window.localStorage.removeItem(storageKey) } catch { /* */ }
        } else {
          const parsed = JSON.parse(raw) as T
          setValue(parsed)
        }
      }
    } catch {
      // Corrupt JSON or storage disabled — fall through to default.
      try { window.localStorage.removeItem(storageKey) } catch { /* */ }
    }
    hydrated.current = true
  }, [storageKey])

  // Mirror to localStorage with a 500ms debounce. Sprint 19O: previously
  // every state change triggered an immediate JSON.stringify + setItem,
  // which on the CMO page (where messages mutate token-by-token during
  // SSE streaming) could lock the main thread for hundreds of ms per
  // second and eventually cause browser tabs to crash with "This page
  // couldn't load." Debouncing collapses rapid updates into one write
  // after activity settles.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!hydrated.current) return
    if (writeTimer.current) clearTimeout(writeTimer.current)
    writeTimer.current = setTimeout(() => {
      try {
        const serialised = JSON.stringify(value)
        // Sprint 19O: refuse to persist payloads > 1 MB. Browser quotas
        // are ~5-10 MB total per origin; a single key over 1 MB hints
        // at unbounded growth (chat that's never trimmed, etc.) and
        // would silently degrade performance anyway.
        if (serialised.length > 1_000_000) {
          console.warn(`[usePersistedState] skipping ${storageKey} — payload ${(serialised.length / 1024).toFixed(0)} KB exceeds 1 MB cap`)
          return
        }
        window.localStorage.setItem(storageKey, serialised)
      } catch {
        // Quota exceeded / private mode — fail open.
      }
    }, 500)
    return () => {
      if (writeTimer.current) {
        clearTimeout(writeTimer.current)
        writeTimer.current = null
      }
    }
  }, [storageKey, value])

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return
      if (e.newValue === null) {
        setValue(initial.current)
        return
      }
      try {
        setValue(JSON.parse(e.newValue) as T)
      } catch { /* ignore */ }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storageKey])

  const set = useCallback((next: SetStateAction<T>) => {
    setValue(prev => {
      const computed = typeof next === 'function'
        ? (next as (p: T) => T)(prev)
        : next
      return computed
    })
  }, [])

  return [value, set]
}

/**
 * Clear a persisted-state key. Useful after submit/reset so the draft
 * doesn't haunt the page on next visit.
 */
export function clearPersistedState(key: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(PREFIX + key) } catch { /* */ }
}

/**
 * Clear ALL persisted state. Use on sign-out so the next user doesn't
 * see the previous user's drafts.
 */
export function clearAllPersistedState(): void {
  if (typeof window === 'undefined') return
  try {
    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(PREFIX)) toRemove.push(k)
    }
    toRemove.forEach(k => window.localStorage.removeItem(k))
  } catch { /* */ }
}
