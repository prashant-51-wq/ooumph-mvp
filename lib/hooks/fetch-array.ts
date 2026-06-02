'use client'

/**
 * lib/hooks/fetch-array.ts — Sprint 19T
 *
 * One-liner helpers that turn a fetch Response into an array, regardless
 * of what shape the API returns. Before this existed, every dashboard
 * page did `await res.json() as Foo[]` and immediately called `.filter`
 * / `.some` / `.slice`. When the API hiccuped (401, paginated wrapper,
 * `{error}` object) the call crashed the component, the dashboard error
 * boundary kicked in, and the user lost the ability to type or scroll
 * anywhere on the page until they clicked "Clear draft state & reload."
 *
 * Use these instead of inline `await res.json()` casts. They guarantee
 * an array. Non-array shapes get coerced or dropped silently — the
 * caller decides whether that's a hard error worth raising to the user.
 *
 * Shapes handled:
 *   - `[...]`              → returned as-is
 *   - `{ rows: [...] }`    → returned as `rows` (paginated endpoints)
 *   - `{ items: [...] }`   → returned as `items`
 *   - `{ data: [...] }`    → returned as `data`
 *   - `{ posts: [...] }`   → returned as `posts` (analytics)
 *   - anything else        → empty array
 */

/**
 * Read a fetch Response and return an array of T, no matter what the
 * server actually sent. If the response is not OK, returns []. If the
 * body is an error object or unknown shape, returns []. Never throws
 * for shape reasons.
 *
 * Network/JSON-parse errors do propagate — wrap in try/catch if you
 * care.
 */
export async function readJsonArray<T = unknown>(res: Response): Promise<T[]> {
  if (!res.ok) return []
  try {
    const raw: unknown = await res.json()
    return coerceArray<T>(raw)
  } catch {
    return []
  }
}

/**
 * Pure shape-coercer. Use when you already have parsed JSON in hand
 * (e.g. from a third-party hook).
 */
export function coerceArray<T = unknown>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    if (Array.isArray(r.rows)) return r.rows as T[]
    if (Array.isArray(r.items)) return r.items as T[]
    if (Array.isArray(r.data)) return r.data as T[]
    if (Array.isArray(r.posts)) return r.posts as T[]
    if (Array.isArray(r.results)) return r.results as T[]
  }
  return []
}

/**
 * Convenience: full fetch + extract. Use for one-shot loads where the
 * caller doesn't need headers/status.
 *
 *   const items = await fetchJsonArray<Item>('/api/items?workspaceId=...')
 */
export async function fetchJsonArray<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T[]> {
  try {
    const res = await fetch(input, init)
    return await readJsonArray<T>(res)
  } catch {
    return []
  }
}
