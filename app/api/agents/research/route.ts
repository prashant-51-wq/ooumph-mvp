/**
 * Research & Competitive Intelligence Agent
 * Performs live web research for market analysis, competitor scraping,
 * keyword intelligence, and general research queries.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { braveSearch, formatSearchResults } from '@/lib/tools/brave-search'
import { scrapeUrl } from '@/lib/tools/firecrawl'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the Research Analyst Agent for Ooumph AI Marketing OS.
You conduct deep web research to deliver structured intelligence reports
covering market trends, competitive landscapes, keyword opportunities, and any
research topic relevant to the brand's growth.
Always respond with valid JSON that strictly matches the requested schema.`

type ResearchType = 'market' | 'competitor' | 'keyword' | 'general'

interface ResearchReport {
  title: string
  summary: string
  keyFindings: string[]
  opportunities: string[]
  threats: string[]
  recommendations: string[]
  sources: { title: string; url: string }[]
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, query, type, competitorUrl } = await req.json() as {
      workspaceId: string
      query: string
      type: ResearchType
      competitorUrl?: string
    }

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 })
    // Sprint 9A: ownership before burning AI + Brave credits on
    // someone else's behalf.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 12C: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    // Load brand profile
    const brandResult = await sql`
      SELECT bp.* FROM brand_profiles bp
      JOIN workspaces w ON w.id = bp.workspace_id
      WHERE w.id = ${workspaceId}
      LIMIT 1
    `
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'research_analyst', 'running')`

    // Gather live data based on type
    let contextSections: string[] = []

    if (type === 'competitor' && competitorUrl) {
      const [scrape, brandSearch] = await Promise.all([
        scrapeUrl(competitorUrl),
        braveSearch(`${query} brand reviews marketing strategy`, 8),
      ])
      if (scrape) {
        contextSections.push(`COMPETITOR WEBSITE CONTENT (${competitorUrl}):\n${scrape.markdown.slice(0, 4000)}`)
      }
      if (brandSearch.length) {
        contextSections.push(`COMPETITOR BRAND SIGNALS:\n${formatSearchResults(brandSearch)}`)
      }
    } else if (type === 'market') {
      const [trends, industry, audience] = await Promise.all([
        braveSearch(`${query} market trends 2025`, 8),
        braveSearch(`${query} industry analysis`, 8),
        braveSearch(`${query} target audience`, 8),
      ])
      if (trends.length) contextSections.push(`MARKET TRENDS:\n${formatSearchResults(trends)}`)
      if (industry.length) contextSections.push(`INDUSTRY ANALYSIS:\n${formatSearchResults(industry)}`)
      if (audience.length) contextSections.push(`TARGET AUDIENCE INSIGHTS:\n${formatSearchResults(audience)}`)
    } else if (type === 'keyword') {
      const [keywords, seo, intent] = await Promise.all([
        braveSearch(`${query} keywords`, 8),
        braveSearch(`${query} SEO opportunities`, 8),
        braveSearch(`${query} search intent`, 8),
      ])
      if (keywords.length) contextSections.push(`KEYWORD DATA:\n${formatSearchResults(keywords)}`)
      if (seo.length) contextSections.push(`SEO OPPORTUNITIES:\n${formatSearchResults(seo)}`)
      if (intent.length) contextSections.push(`SEARCH INTENT SIGNALS:\n${formatSearchResults(intent)}`)
    } else {
      // general — 3 variations
      const [r1, r2, r3] = await Promise.all([
        braveSearch(query, 8),
        braveSearch(`${query} insights 2025`, 8),
        braveSearch(`${query} best practices examples`, 8),
      ])
      if (r1.length) contextSections.push(`PRIMARY RESULTS:\n${formatSearchResults(r1)}`)
      if (r2.length) contextSections.push(`INSIGHTS:\n${formatSearchResults(r2)}`)
      if (r3.length) contextSections.push(`BEST PRACTICES:\n${formatSearchResults(r3)}`)
    }

    const liveContext = contextSections.join('\n\n---\n\n')

    const prompt = `Conduct a ${type} research report on the following topic for this brand:

BRAND CONTEXT:
Business: ${brand.business_name}
Industry: ${brand.industry || 'Not specified'}
Target Audience: ${brand.target_audience}
Channels: ${Array.isArray(brand.channels) ? brand.channels.join(', ') : brand.channels || 'Not specified'}
Offer: ${brand.offer}
Tone: ${brand.tone}
${brand.competitors ? `Competitors: ${brand.competitors}` : ''}

RESEARCH REQUEST:
Type: ${type}
Query: "${query}"
${competitorUrl ? `Competitor URL: ${competitorUrl}` : ''}

${liveContext ? `--- LIVE WEB RESEARCH DATA ---\n\n${liveContext}\n\n--- END OF WEB DATA ---` : '(No live web data available — rely on training knowledge)'}

Produce a comprehensive, actionable research report. Use all data above.

Return ONLY valid JSON:
{
  "title": "Descriptive report title including the topic",
  "summary": "3-4 sentence executive summary of the most important findings",
  "keyFindings": ["finding 1", "finding 2", "finding 3", "finding 4", "finding 5"],
  "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3", "opportunity 4"],
  "threats": ["threat or risk 1", "threat or risk 2", "threat or risk 3"],
  "recommendations": ["actionable recommendation 1", "recommendation 2", "recommendation 3", "recommendation 4", "recommendation 5"],
  "sources": [
    { "title": "source title", "url": "https://..." }
  ]
}`

    const report = await runAgent<ResearchReport>(SYSTEM, prompt)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(report)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = report.title || `${type} Research — ${query} — ${new Date().toLocaleDateString()}`
    const contentJson = { ...report, type, query, businessName: brand.business_name }

    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'research_report', ${title}, ${JSON.stringify(contentJson)})`

    return NextResponse.json({ report: contentJson, type, artifactId })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('Research agent error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })
  // Sprint 9A: ownership.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = await sql`
    SELECT id, title, content_json, created_at
    FROM artifacts
    WHERE workspace_id = ${workspaceId} AND type = 'research_report'
    ORDER BY created_at DESC
    LIMIT 20
  `
  return NextResponse.json(result.rows)
}
