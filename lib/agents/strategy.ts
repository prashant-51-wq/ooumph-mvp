import { runAgent } from '@/lib/claude'
import { braveSearch, formatSearchResults } from '@/lib/tools/brave-search'
import { scrapeMultiple } from '@/lib/tools/firecrawl'
import type { BrandProfile, Strategy } from '@/types'

const SYSTEM_PROMPT = `You are the AI Strategy Agent for Ooumph, an AI Marketing Agency OS.
Your job is to create a comprehensive, actionable one-page marketing strategy for a business.
Be specific, data-driven, and India-market aware where relevant.
Always respond with valid JSON.`

function normalizeChannels(channels: unknown): string[] {
  if (Array.isArray(channels)) return channels.map(String)
  if (typeof channels === 'string') {
    // Could be a JSON array string or comma-separated
    try {
      const parsed = JSON.parse(channels)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch { /* not JSON */ }
    return channels.split(',').map(s => s.trim()).filter(Boolean)
  }
  return []
}

export async function generateStrategy(brand: BrandProfile): Promise<Strategy> {
  const industry = brand.industry || brand.offer || ''
  const audience = brand.target_audience || ''
  const competitors = brand.competitors || ''
  const year = new Date().getFullYear()
  const channelsList = normalizeChannels(brand.channels)

  // Fetch real market data from Brave Search (graceful fallback if key not set)
  const [marketTrends, competitorInsights, buyerBehavior] = await Promise.all([
    braveSearch(`${industry} market trends ${year}`, 8),
    competitors ? braveSearch(`${competitors} marketing strategy`, 8) : Promise.resolve([]),
    braveSearch(`${audience} buying behavior ${industry}`, 8),
  ])

  // Optionally scrape competitor websites via Firecrawl (graceful fallback if key not set)
  let competitorContent = ''
  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  if (firecrawlKey && competitors) {
    // Extract URLs from the competitor search results
    const competitorUrls = competitorInsights
      .filter(r => r.url && !r.url.includes('google.com') && !r.url.includes('bing.com'))
      .slice(0, 2)
      .map(r => r.url)
    if (competitorUrls.length) {
      const scraped = await scrapeMultiple(competitorUrls)
      if (scraped.length) {
        competitorContent = scraped
          .map(s => `### ${s.title} (${s.url})\n${s.markdown.slice(0, 800)}`)
          .join('\n\n')
      }
    }
  }

  const liveMarketData = [
    marketTrends.length
      ? `MARKET TRENDS (${industry}, ${year}):\n${formatSearchResults(marketTrends)}`
      : '',
    competitorInsights.length
      ? `COMPETITOR SIGNALS (${competitors}):\n${formatSearchResults(competitorInsights)}`
      : '',
    buyerBehavior.length
      ? `BUYER BEHAVIOR (${audience}):\n${formatSearchResults(buyerBehavior)}`
      : '',
    competitorContent
      ? `COMPETITOR WEBSITE CONTENT (scraped via Firecrawl):\n${competitorContent}`
      : '',
  ].filter(Boolean).join('\n\n---\n\n')

  const userPrompt = `Create a complete marketing strategy for this business:

Business: ${brand.business_name}
Industry: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}
Channels: ${channelsList.join(', ')}
Goals: ${brand.goals}
Competitors: ${brand.competitors}
Tone: ${brand.tone}
Monthly Budget: ${brand.monthly_budget}
${liveMarketData ? `\n--- LIVE MARKET INTELLIGENCE (from Brave Search${firecrawlKey ? ' + Firecrawl' : ''}) ---\n\n${liveMarketData}\n\nUse the real market data above to ground the strategy in current trends, actual competitor positioning, and real buyer signals.` : ''}

Generate a strategy with:
1. Sharp market positioning statement
2. Unique Value Proposition (1 sentence, memorable)
3. Ideal Customer Profile (ICP) with demographics, psychographics, 3 pain points, 3 buying triggers, 3 objections
4. 3 Content Pillars (each with name, description, 5 topic ideas)
5. 30-day primary objective (specific, measurable)
6. 5 KPIs with targets and timeframes
7. Channel strategy (one entry per channel they selected)

Return JSON matching this exact shape:
{
  "positioning": "string",
  "uniqueValueProposition": "string",
  "icp": {
    "demographics": "string",
    "psychographics": "string",
    "painPoints": ["string", "string", "string"],
    "buyingTriggers": ["string", "string", "string"],
    "objections": ["string", "string", "string"]
  },
  "contentPillars": [
    { "name": "string", "description": "string", "topics": ["string x5"] }
  ],
  "thirtyDayObjective": "string",
  "kpis": [
    { "metric": "string", "target": "string", "timeframe": "string" }
  ],
  "channelStrategy": [
    { "channel": "string", "frequency": "string", "contentType": "string" }
  ]
}`

  return runAgent<Strategy>(SYSTEM_PROMPT, userPrompt)
}
