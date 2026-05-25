// Google Search Console API

export interface SearchConsoleKeyword {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SearchConsolePage {
  page: string
  clicks: number
  impressions: number
  ctr: number
}

export interface SearchConsoleReport {
  topKeywords: SearchConsoleKeyword[]
  topPages: SearchConsolePage[]
  summary: { totalClicks: number; totalImpressions: number; avgCtr: number; avgPosition: number }
  dateRange: string
}

function getDateString(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split('T')[0]
}

export async function getSearchConsoleReport(
  siteUrl: string,
  accessToken: string,
  days = 28
): Promise<SearchConsoleReport | null> {
  if (!accessToken) return null
  try {
    const startDate = getDateString(days)
    const endDate = getDateString(0)
    const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }

    const [keywordsResult, pagesResult] = await Promise.allSettled([
      fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ startDate, endDate, dimensions: ['query'], rowLimit: 20 }),
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ startDate, endDate, dimensions: ['page'], rowLimit: 20 }),
      }).then((r) => (r.ok ? r.json() : null)),
    ])

    const keywordsData = keywordsResult.status === 'fulfilled' ? keywordsResult.value : null
    const pagesData = pagesResult.status === 'fulfilled' ? pagesResult.value : null

    type RawRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }

    const topKeywords: SearchConsoleKeyword[] = ((keywordsData?.rows as RawRow[]) || []).map((row) => ({
      query: row.keys[0] || '',
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
    }))

    const topPages: SearchConsolePage[] = ((pagesData?.rows as RawRow[]) || []).map((row) => ({
      page: row.keys[0] || '',
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
    }))

    const totalClicks = topKeywords.reduce((s, k) => s + k.clicks, 0)
    const totalImpressions = topKeywords.reduce((s, k) => s + k.impressions, 0)
    const avgCtr = topKeywords.length > 0
      ? topKeywords.reduce((s, k) => s + k.ctr, 0) / topKeywords.length
      : 0
    const avgPosition = topKeywords.length > 0
      ? topKeywords.reduce((s, k) => s + k.position, 0) / topKeywords.length
      : 0

    return {
      topKeywords,
      topPages,
      summary: { totalClicks, totalImpressions, avgCtr, avgPosition },
      dateRange: `${startDate} to ${endDate}`,
    }
  } catch {
    return null
  }
}

export function formatSearchConsoleReport(report: SearchConsoleReport): string {
  const { topKeywords, topPages, summary, dateRange } = report
  const lines: string[] = [
    `SEARCH CONSOLE REPORT (${dateRange})`,
    `Total Clicks: ${summary.totalClicks.toLocaleString()} | Total Impressions: ${summary.totalImpressions.toLocaleString()}`,
    `Avg CTR: ${(summary.avgCtr * 100).toFixed(2)}% | Avg Position: ${summary.avgPosition.toFixed(1)}`,
    '',
    'TOP KEYWORDS:',
    ...topKeywords.slice(0, 10).map(
      (k, i) =>
        `  ${i + 1}. "${k.query}" — ${k.clicks} clicks, ${k.impressions} impressions, pos ${k.position.toFixed(1)}`
    ),
    '',
    'TOP PAGES:',
    ...topPages.slice(0, 10).map(
      (p, i) => `  ${i + 1}. ${p.page} — ${p.clicks} clicks, CTR ${(p.ctr * 100).toFixed(2)}%`
    ),
  ]
  return lines.join('\n')
}
