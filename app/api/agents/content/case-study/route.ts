import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'

interface KeyMetric {
  label: string
  value: string
  improvement: string
}

interface CaseStudy {
  headline: string
  subheadline: string
  summary: string
  clientOverview: string
  challengeSection: string
  solutionSection: string
  resultsSection: string
  keyMetrics: KeyMetric[]
  testimonialBlock: string
  lessonsLearned: string[]
  cta: string
  seoTitle: string
  metaDescription: string
  fullHtml: string
}

const CASE_STUDY_SCHEMA = `{
  "headline": "string — impact-led headline (result first, e.g. 'How Acme Grew Revenue 3x in 90 Days')",
  "subheadline": "string — supporting subheadline",
  "summary": "string — 3-sentence executive summary",
  "clientOverview": "string — who the client is (2-3 sentences)",
  "challengeSection": "string — detailed problem description in HTML (<p> tags)",
  "solutionSection": "string — how you solved it, your process in HTML (<p>, <ul> tags)",
  "resultsSection": "string — specific results with numbers in HTML (<p>, <ul> tags)",
  "keyMetrics": [
    { "label": "string", "value": "string", "improvement": "string" }
  ],
  "testimonialBlock": "string — formatted testimonial (quote + attribution)",
  "lessonsLearned": ["string — lesson (3-5 items)"],
  "cta": "string — next steps CTA paragraph",
  "seoTitle": "string — SEO title under 60 chars",
  "metaDescription": "string — meta description under 155 chars",
  "fullHtml": "string — complete formatted HTML case study combining all sections"
}`

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const body = await req.json()
    const {
      workspaceId,
      clientName,
      industry = '',
      problem,
      solution,
      results,
      timeframe = '',
      testimonial = '',
    }: {
      workspaceId: string
      clientName: string
      industry?: string
      problem: string
      solution: string
      results: string
      timeframe?: string
      testimonial?: string
    } = body

    if (!workspaceId || !clientName || !problem || !solution || !results) {
      return NextResponse.json(
        { error: 'workspaceId, clientName, problem, solution, and results are required' },
        { status: 400 }
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // 1. Load brand profile
    const brandResult = await sql`
      SELECT bp.* FROM brand_profiles bp
      JOIN workspaces w ON bp.workspace_id = w.id
      WHERE w.id = ${workspaceId} LIMIT 1
    `
    const brand = brandResult.rows[0] as Record<string, unknown> | undefined
    if (!brand) {
      return NextResponse.json({ error: 'Brand profile not found. Complete onboarding first.' }, { status: 400 })
    }

    // 2. Log agent run
    runId = newId()
    await sql`
      INSERT INTO agent_runs (id, workspace_id, agent_name, status)
      VALUES (${runId}, ${workspaceId}, 'case_study_writer', 'running')
    `

    // 3. Call runAgent
    const systemPrompt = `You are an expert B2B content strategist and case study writer. You craft compelling customer success stories that build trust, demonstrate ROI, and convert prospects into buyers. You lead with results, tell a clear narrative arc (challenge → solution → transformation), and use specific numbers and quotes to make stories credible and persuasive.`

    const userPrompt = `Write a complete, publication-ready case study for ${brand.business_name || 'our company'}.

BRAND DETAILS:
- Company: ${brand.business_name || ''}
- Industry: ${brand.industry || ''}
- Tone: ${brand.tone_of_voice || brand.tone || 'professional'}
- Target audience: ${brand.target_audience || 'business decision-makers'}

CASE STUDY BRIEF:
- Client: ${clientName}
- Client industry: ${industry || 'not specified'}
- The problem they faced: ${problem}
- Our solution: ${solution}
- Results achieved: ${results}
- Timeframe: ${timeframe || 'not specified'}
- Testimonial: ${testimonial || 'generate a plausible testimonial based on the results'}

REQUIREMENTS:
- Lead headline must start with the RESULT (impact-first structure)
- Extract 3-5 specific key metrics from the results (with % or numeric improvements)
- Challenge section should make the reader feel the pain
- Solution section should clearly explain the "how" — your process/methodology
- Results section must be specific with numbers
- Lessons learned should be generalizable insights
- CTA should invite similar companies to get in touch
- Full HTML must be a complete, well-formatted document combining all sections
- SEO title and meta description optimized for "[client type] [result] case study" searches

Respond with valid JSON only.`

    let caseStudy: CaseStudy
    try {
      caseStudy = await runAgent<CaseStudy>(systemPrompt, userPrompt, CASE_STUDY_SCHEMA)
    } catch (agentError) {
      await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
      throw agentError
    }

    // 4. Update agent run + save artifact
    await sql`
      UPDATE agent_runs
      SET status = 'completed', output_json = ${JSON.stringify(caseStudy)}, completed_at = CURRENT_TIMESTAMP
      WHERE id = ${runId}
    `

    const artifactId = newId()
    const title = caseStudy.headline || `${clientName} Case Study`
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
      VALUES (${artifactId}, ${workspaceId}, ${runId}, 'case_study', ${title}, ${JSON.stringify(caseStudy)})
    `
    await sql`
      INSERT INTO approvals (id, workspace_id, artifact_id)
      VALUES (${newId()}, ${workspaceId}, ${artifactId})
    `

    return NextResponse.json({ caseStudy, artifactId })
  } catch (error) {
    console.error('Case study writer agent error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 400 })
  const result = await sql`
    SELECT id, title, content_json, created_at
    FROM artifacts
    WHERE workspace_id = ${workspaceId} AND type = 'case_study'
    ORDER BY created_at DESC
    LIMIT 10
  `
  return NextResponse.json(result.rows)
}
