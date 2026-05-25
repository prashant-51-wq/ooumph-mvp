// Google Analytics 4 Data API v1beta

export interface GA4Metric {
  sessions: number
  users: number
  pageviews: number
  bounceRate: number
  avgSessionDuration: number
  newUsers: number
}

export interface GA4TopItem {
  name: string
  value: number
}

export interface GA4Report {
  metrics: GA4Metric
  topPages: GA4TopItem[]
  topSources: GA4TopItem[]
  topCountries: GA4TopItem[]
  dailySessions: { date: string; sessions: number }[]
  dateRange: string
}

async function runGA4Report(
  propertyId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function parseMetricValue(data: Record<string, unknown>, metricIndex: number): number {
  try {
    const rows = data.rows as { metricValues: { value: string }[] }[] | undefined
    if (!rows || rows.length === 0) return 0
    return parseFloat(rows[0].metricValues[metricIndex]?.value || '0') || 0
  } catch {
    return 0
  }
}

function parseTopItems(data: Record<string, unknown> | null): GA4TopItem[] {
  if (!data) return []
  try {
    const rows = data.rows as { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] | undefined
    if (!rows) return []
    return rows.map((row) => ({
      name: row.dimensionValues[0]?.value || '',
      value: parseFloat(row.metricValues[0]?.value || '0') || 0,
    }))
  } catch {
    return []
  }
}

export async function getGA4Report(
  propertyId: string,
  accessToken: string,
  days = 30
): Promise<GA4Report | null> {
  if (!accessToken) return null
  try {
    const dateRange = { startDate: `${days}daysAgo`, endDate: 'today' }

    const [metricsResult, pagesResult, sourcesResult, countriesResult, dailyResult] =
      await Promise.allSettled([
        runGA4Report(propertyId, accessToken, {
          dateRanges: [dateRange],
          metrics: [
            { name: 'sessions' },
            { name: 'activeUsers' },
            { name: 'screenPageViews' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
            { name: 'newUsers' },
          ],
        }),
        runGA4Report(propertyId, accessToken, {
          dateRanges: [dateRange],
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }],
          limit: 10,
        }),
        runGA4Report(propertyId, accessToken, {
          dateRanges: [dateRange],
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics: [{ name: 'sessions' }],
          limit: 10,
        }),
        runGA4Report(propertyId, accessToken, {
          dateRanges: [dateRange],
          dimensions: [{ name: 'country' }],
          metrics: [{ name: 'sessions' }],
          limit: 10,
        }),
        runGA4Report(propertyId, accessToken, {
          dateRanges: [dateRange],
          dimensions: [{ name: 'date' }],
          metrics: [{ name: 'sessions' }],
        }),
      ])

    const metricsData =
      metricsResult.status === 'fulfilled' ? metricsResult.value : null
    const pagesData =
      pagesResult.status === 'fulfilled' ? pagesResult.value : null
    const sourcesData =
      sourcesResult.status === 'fulfilled' ? sourcesResult.value : null
    const countriesData =
      countriesResult.status === 'fulfilled' ? countriesResult.value : null
    const dailyData =
      dailyResult.status === 'fulfilled' ? dailyResult.value : null

    const metrics: GA4Metric = {
      sessions: metricsData ? parseMetricValue(metricsData, 0) : 0,
      users: metricsData ? parseMetricValue(metricsData, 1) : 0,
      pageviews: metricsData ? parseMetricValue(metricsData, 2) : 0,
      bounceRate: metricsData ? parseMetricValue(metricsData, 3) : 0,
      avgSessionDuration: metricsData ? parseMetricValue(metricsData, 4) : 0,
      newUsers: metricsData ? parseMetricValue(metricsData, 5) : 0,
    }

    const dailySessions: { date: string; sessions: number }[] = []
    if (dailyData) {
      try {
        const rows = (dailyData.rows as { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[]) || []
        for (const row of rows) {
          dailySessions.push({
            date: row.dimensionValues[0]?.value || '',
            sessions: parseFloat(row.metricValues[0]?.value || '0') || 0,
          })
        }
      } catch {
        // ignore
      }
    }

    return {
      metrics,
      topPages: parseTopItems(pagesData),
      topSources: parseTopItems(sourcesData),
      topCountries: parseTopItems(countriesData),
      dailySessions,
      dateRange: `Last ${days} days`,
    }
  } catch {
    return null
  }
}

export function formatGA4Report(report: GA4Report): string {
  const { metrics, topPages, topSources, topCountries, dateRange } = report
  const lines: string[] = [
    `GA4 ANALYTICS REPORT (${dateRange})`,
    `Sessions: ${metrics.sessions.toLocaleString()} | Users: ${metrics.users.toLocaleString()} | Pageviews: ${metrics.pageviews.toLocaleString()}`,
    `New Users: ${metrics.newUsers.toLocaleString()} | Bounce Rate: ${(metrics.bounceRate * 100).toFixed(1)}% | Avg Session: ${Math.round(metrics.avgSessionDuration)}s`,
    '',
    'TOP PAGES:',
    ...topPages.slice(0, 5).map((p, i) => `  ${i + 1}. ${p.name} (${p.value.toLocaleString()} views)`),
    '',
    'TOP SOURCES:',
    ...topSources.slice(0, 5).map((s, i) => `  ${i + 1}. ${s.name} (${s.value.toLocaleString()} sessions)`),
    '',
    'TOP COUNTRIES:',
    ...topCountries.slice(0, 5).map((c, i) => `  ${i + 1}. ${c.name} (${c.value.toLocaleString()} sessions)`),
  ]
  return lines.join('\n')
}
