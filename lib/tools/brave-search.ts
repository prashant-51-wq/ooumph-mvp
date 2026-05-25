// Brave Search API wrapper
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

export interface BraveResult {
  title: string
  url: string
  description: string
}

export async function braveSearch(query: string, count = 8): Promise<BraveResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetchWithTimeout(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
      { headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.web?.results || []).map((r: { title?: string; url?: string; description?: string }) => ({
      title: r.title || '',
      url: r.url || '',
      description: r.description || '',
    }))
  } catch { return [] }
}

export function formatSearchResults(results: BraveResult[]): string {
  if (!results.length) return 'No search results available.'
  return results.map((r, i) => `[${i+1}] ${r.title}\n${r.url}\n${r.description}`).join('\n\n')
}
