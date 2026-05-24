/**
 * Brand Monitor Agent
 * Real-time brand & competitor intelligence via web search signals.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { braveSearch, formatSearchResults } from '@/lib/tools/brave-search'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the Brand Monitor Agent for Ooumph AI Marketing OS.
You analyze web search signals to produce brand intelligence reports covering:
mentions, sentiment, competitor activity, and industry trends.
You identify actionable alerts and prioritize recommendations by business impact.
Always respond with valid JSON.`

type MonitorType = 'mentions' | 'competitors' | 'sentiment' | 'trends' | 'all'

interface BusinessMention {
  title: string
  url: string
  snippet: string
  sentiment: 'positive' | 'neutral' | 'negative'
}

interface CompetitorNews {
  competitor: string
  update: string
  impact: string
}

interface Alert {
  level: 'high' | 'medium' | 'low'
  message: string
}

interface BrandReport {
  businessMentions: BusinessMention[]
  competitorNews: CompetitorNews[]
  industryTrends: string[]
  alerts: Alert[]
  recommendedActions: string[]
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, monitorType = 'all' } = await req.json() as {
      workspaceId: string
      monitorType?: MonitorType
    }

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

    const bpResult = await sql`SELECT bp.* FROM brand_profiles bp JOIN workspaces w ON bp.workspace_id = w.id WHERE w.id = ${workspaceId} LIMIT 1`
    const bp = bpResult.rows[0] as unknown as BrandProfile

    if (!bp) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'brand_monitor', 'running')`

    const businessName = bp.business_name || ''
    const competitors = bp.competitors || ''
    const industry = bp.industry || ''
    const targetAudience = bp.target_audience || ''

    // Run relevant searches based on monitorType
    const searchPromises: Promise<{ title: string; url: string; description: string }[]>[] = []
    const searchLabels: string[] = []

    const shouldRun = (type: MonitorType) => monitorType === 'all' || monitorType === type

    if (shouldRun('mentions')) {
      searchPromises.push(braveSearch(`"${businessName}" OR "${businessName}" reviews OR "${businessName}" mentioned`, 8))
      searchLabels.push('BRAND MENTIONS')
    }
    if (shouldRun('sentiment')) {
      searchPromises.push(braveSearch(`${businessName} customer feedback OR ${businessName} testimonials OR ${businessName} opinion`, 8))
      searchLabels.push('SENTIMENT SIGNALS')
    }
    if (shouldRun('competitors') && competitors) {
      searchPromises.push(braveSearch(`${competitors} latest news OR ${competitors} new features OR ${competitors} update`, 8))
      searchLabels.push('COMPETITOR ACTIVITY')
    }
    if (shouldRun('trends')) {
      searchPromises.push(braveSearch(`${industry} news this week OR ${industry} trends OR ${targetAudience} ${industry}`, 8))
      searchLabels.push('INDUSTRY TRENDS')
    }

    const searchResults = await Promise.all(searchPromises)

    const liveSignals = searchResults
      .map((results, i) => results.length ? `${searchLabels[i]}:\n${formatSearchResults(results)}` : '')
      .filter(Boolean)
      .join('\n\n---\n\n')

    const prompt = `Analyze the following web intelligence signals for:

Business: ${businessName}
Industry: ${industry}
Competitors: ${competitors || 'Not specified'}
Target Audience: ${targetAudience}
Monitor Scope: ${monitorType === 'all' ? 'Full scan (mentions + sentiment + competitors + trends)' : monitorType}

--- LIVE WEB SIGNALS ---
${liveSignals || 'No live signals available — generate insights based on brand profile context.'}
--- END SIGNALS ---

Produce a comprehensive brand intelligence report. Return JSON:
{
  "businessMentions": [
    {
      "title": "page or article title",
      "url": "url from search results",
      "snippet": "relevant excerpt",
      "sentiment": "positive|neutral|negative"
    }
  ],
  "competitorNews": [
    {
      "competitor": "competitor name",
      "update": "what they announced or changed",
      "impact": "how this affects ${businessName} (1 sentence)"
    }
  ],
  "industryTrends": [
    "trend 1 relevant to ${industry}",
    "trend 2",
    "trend 3"
  ],
  "alerts": [
    {
      "level": "high|medium|low",
      "message": "actionable alert message"
    }
  ],
  "recommendedActions": [
    "specific action to take this week based on findings"
  ]
}`

    const report = await runAgent<BrandReport>(SYSTEM, prompt)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(report)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = `Brand Monitor — ${businessName} — ${new Date().toLocaleDateString()}`
    const contentJson = {
      ...report,
      businessName,
      monitorType,
      scannedAt: new Date().toISOString(),
    }

    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'brand_monitor', ${title}, ${JSON.stringify(contentJson)})`

    return NextResponse.json({
      artifactId,
      report: contentJson,
      alertCount: report.alerts?.length || 0,
      highAlerts: report.alerts?.filter(a => a.level === 'high').length || 0,
      message: `Brand scan complete. Found ${report.alerts?.length || 0} alerts.`,
    })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('Brand Monitor error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at
    FROM artifacts a
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'brand_monitor'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
