/**
 * GA4 Intelligence Worker — Analytics Intelligence Supervisor
 * POST /api/agents/analytics/ga4
 * Fetches GA4 traffic data and returns AI-powered marketing insights.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { getGA4Report, formatGA4Report } from '@/lib/tools'

const SYSTEM = `You are an expert digital marketing analyst. You analyze website analytics data and provide actionable insights, identify patterns, and make specific recommendations to improve marketing performance. Always respond with valid JSON.`

interface GA4Highlight {
  metric: string
  value: string
  trend: 'up' | 'down' | 'stable'
  insight: string
}

interface ChannelBreakdown {
  channel: string
  sessions: number
  recommendation: string
}

interface GA4Intelligence {
  summary: string
  healthScore: number
  highlights: GA4Highlight[]
  topOpportunities: string[]
  contentGaps: string[]
  channelBreakdown: ChannelBreakdown[]
  weeklyActions: string[]
  rawData: unknown
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, days } = await req.json() as { workspaceId: string; days?: number }
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

    // 1. Load workspace with model_settings
    const wsResult = await sql`SELECT w.*, w.model_settings FROM workspaces w WHERE w.id = ${workspaceId} LIMIT 1`
    const workspace = wsResult.rows[0]
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    // 2. Parse model_settings and extract GA4 credentials
    let modelSettings: Record<string, unknown> = {}
    try {
      modelSettings = typeof workspace.model_settings === 'string'
        ? JSON.parse(workspace.model_settings)
        : (workspace.model_settings as Record<string, unknown>) || {}
    } catch { modelSettings = {} }

    const ga4PropertyId = modelSettings.ga4PropertyId as string | undefined
    const ga4AccessToken = modelSettings.ga4AccessToken as string | undefined

    if (!ga4PropertyId || !ga4AccessToken) {
      return NextResponse.json({
        error: 'GA4 not configured. Add GA4 Property ID and Access Token in Settings → API Keys',
        configured: false,
      })
    }

    // 3. Fetch GA4 data
    const report = await getGA4Report(ga4PropertyId, ga4AccessToken, days || 30)
    if (!report) {
      return NextResponse.json({ error: 'Failed to fetch GA4 data. Check your credentials.' }, { status: 400 })
    }

    // 4. Load brand profile for context
    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0]

    const formattedReport = formatGA4Report(report)

    // 5. Log agent run
    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'ga4_intelligence', 'running')`

    // 6. Run AI analysis
    const userPrompt = `Analyze the following GA4 website analytics data and provide actionable marketing insights.

Business: ${brand?.business_name || 'Unknown'}
Industry: ${brand?.industry || 'Not specified'}
Target Audience: ${brand?.target_audience || 'Not specified'}
Active Channels: ${Array.isArray(brand?.channels) ? brand.channels.join(', ') : brand?.channels || 'Not specified'}
Period: Last ${days || 30} days

GA4 ANALYTICS DATA:
${formattedReport}

Provide a comprehensive analysis with specific, actionable recommendations. Focus on traffic patterns, channel performance, conversion opportunities, and content gaps.

Return JSON with exactly this structure:
{
  "summary": "2-3 sentence executive summary of website performance",
  "healthScore": 75,
  "highlights": [
    { "metric": "Organic Sessions", "value": "1,234", "trend": "up", "insight": "SEO efforts are paying off" }
  ],
  "topOpportunities": ["Specific actionable opportunity 1", "opportunity 2", "opportunity 3"],
  "contentGaps": ["Topic or page missing from site 1", "content gap 2"],
  "channelBreakdown": [
    { "channel": "Organic Search", "sessions": 500, "recommendation": "specific recommendation" }
  ],
  "weeklyActions": ["Action to take this week 1", "action 2", "action 3"]
}`

    const intelligence = await runAgent<GA4Intelligence>(SYSTEM, userPrompt)

    // Attach raw data
    intelligence.rawData = report

    // 7. Update agent run status
    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(intelligence)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    // 8. Save as artifact
    const artifactId = newId()
    const title = `GA4 Intelligence Report — ${brand?.business_name || workspaceId} — ${new Date().toLocaleDateString()}`
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'ga4_intelligence', ${title}, ${JSON.stringify(intelligence)})`

    return NextResponse.json({ intelligence, artifactId, configured: true })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('GA4 Intelligence error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'ga4_intelligence'
    ORDER BY a.created_at DESC LIMIT 5
  `
  return NextResponse.json(result.rows)
}
