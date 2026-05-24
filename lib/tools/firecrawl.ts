// Firecrawl website scraper wrapper
export interface ScrapeResult {
  markdown: string
  title: string
  url: string
}

export async function scrapeUrl(url: string): Promise<ScrapeResult | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return { markdown: data.data?.markdown || '', title: data.data?.metadata?.title || url, url }
  } catch { return null }
}

export async function scrapeMultiple(urls: string[]): Promise<ScrapeResult[]> {
  const results = await Promise.allSettled(urls.map(u => scrapeUrl(u)))
  return results
    .filter((r): r is PromiseFulfilledResult<ScrapeResult> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)
}
