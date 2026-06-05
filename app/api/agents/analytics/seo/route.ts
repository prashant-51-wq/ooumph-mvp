/**
 * SEO Intelligence Worker — Analytics Intelligence Supervisor
 * POST /api/agents/analytics/seo
 * Fetches Google Search Console data and returns AI-powered SEO insights.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { getSearchConsoleReport, formatSearchConsoleReport } from '@/lib/tools'
import { assertWorkspaceOwnership } from '@/lib/guards'

const SYSTEM = `You are an expert SEO strategist and digital marketing analyst. You analyze Google Search Console data and provide actionable SEO recommendations, identify keyword opportunities, and create concrete improvement roadmaps. Always respond with valid JSON.`

interface WinningKeyword {
  keyword: string
  clicks: number
  position: number
  opportunity: string
}

interface SEOIntelligence {
  summary: string
  seoHealthScore: number
  topWinningKeywords: WinningKeyword[]
  quickWins: string[]
  contentRecommendations: string[]
  technicalIssues: string[]
  competitorGaps: string[]
  monthlyActions: string[]
  rawData: unknown
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, days } = await req.json() as { workspaceId: string; days?: number }
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // 1. Load workspace with model_settings
    const wsResult = await sql`SELECT w.*, w.model_settings FROM workspaces w WHERE w.id = ${workspaceId} LIMIT 1`
    const workspace = wsResult.rows[0]
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    // 2. Parse model_settings and extract Search Console credentials
    let modelSettings: Record<string, unknown> = {}
    try {
      modelSettings = typeof workspace.model_settings === 'string'
        ? JSON.parse(workspace.model_settings)
        : (workspace.model_settings as Record<string, unknown>) || {}
    } catch { modelSettings = {} }

    const searchConsoleSiteUrl = modelSettings.searchConsoleSiteUrl as string | undefined
    // Fallback to ga4AccessToken for shared Google OAuth token
    const searchConsoleAccessToken = (modelSettings.searchConsoleAccessToken || modelSettings.ga4AccessToken) as string | undefined

    if (!searchConsoleSiteUrl || !searchConsoleAccessToken) {
      return NextResponse.json({
        error: 'Search Console not configured. Add Site URL and Access Token in Settings.',
        configured: false,
      })
    }

    // 3. Fetch Search Console data
    const report = await getSearchConsoleReport(searchConsoleSiteUrl, searchConsoleAccessToken, days || 28)
    if (!report) {
      return NextResponse.json({ error: 'Failed to fetch Search Console data. Check your credentials.' }, { status: 400 })
    }

    // 4. Load brand profile for context
    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0]

    const formattedReport = formatSearchConsoleReport(report)

    // 5. Log agent run
    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'seo_intelligence', 'running')`

    // 6. Run AI analysis
    const userPrompt = `Analyze the following Google Search Console data and provide comprehensive SEO insights and recommendations.

Business: ${brand?.business_name || 'Unknown'}
Industry: ${brand?.industry || 'Not specified'}
Target Audience: ${brand?.target_audience || 'Not specified'}
Site URL: ${searchConsoleSiteUrl}
Period: Last ${days || 28} days

SEARCH CONSOLE DATA:
${formattedReport}

Provide a detailed SEO analysis with specific, actionable recommendations. Focus on:
- Keyword opportunities (especially positions 4-10 that are close to page 1)
- Content gaps based on keyword data
- Technical SEO issues visible in the data
- Competitor keyword gaps
- A concrete 30-day SEO roadmap

Return JSON with exactly this structure:
{
  "summary": "2-3 sentence SEO performance summary",
  "seoHealthScore": 72,
  "topWinningKeywords": [
    { "keyword": "example keyword", "clicks": 150, "position": 3.2, "opportunity": "Can reach #1 with more content" }
  ],
  "quickWins": ["Keyword at position 6 — add internal links to boost to page 1", "quick win 2"],
  "contentRecommendations": ["Write a definitive guide on X topic", "recommendation 2"],
  "technicalIssues": ["issue 1 if any found in data", "issue 2"],
  "competitorGaps": ["Suspected gap vs competitors based on keyword data 1", "gap 2"],
  "monthlyActions": ["Week 1: Action 1", "Week 2: Action 2", "Week 3: Action 3", "Week 4: Action 4"]
}`

    const intelligence = await runAgent<SEOIntelligence>(SYSTEM, userPrompt, workspaceId)

    // Attach raw data
    intelligence.rawData = report

    // 7. Update agent run status
    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(intelligence)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    // 8. Save as artifact
    const artifactId = newId()
    const title = `SEO Intelligence Report — ${brand?.business_name || workspaceId} — ${new Date().toLocaleDateString()}`
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'seo_intelligence', ${title}, ${JSON.stringify(intelligence)})`

    return NextResponse.json({ intelligence, artifactId, configured: true })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('SEO Intelligence error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'seo_intelligence'
    ORDER BY a.created_at DESC LIMIT 5
  `
  return NextResponse.json(result.rows)
}
