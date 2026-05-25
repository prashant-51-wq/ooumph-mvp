/**
 * lib/fetch-with-timeout.ts
 * Wraps fetch() with an AbortController timeout.
 * Default timeout: 8 seconds. All external API calls should use this.
 */

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 8000, ...fetchOptions } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal })
    return res
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
