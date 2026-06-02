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
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw !== null) {
        const parsed = JSON.parse(raw) as T
        setValue(parsed)
      }
    } catch {
      // Corrupt JSON or storage disabled — fall through to default.
    }
    hydrated.current = true
  }, [storageKey])

  // Mirror every change back to localStorage.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!hydrated.current) return  // skip pre-hydration default write
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // Quota exceeded / private mode — fail open, in-memory state still works.
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
