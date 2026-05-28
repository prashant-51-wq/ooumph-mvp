import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { generateContentCalendar } from '@/lib/agents/content'
import { sendApprovalRequestEmail } from '@/lib/email'
import { generateStaticPost, generateStoryCover, generateVideoBrief } from '@/lib/creative-workers'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId } = await req.json()
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota
    const [brandResult, strategyResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
    ])
    const brand = brandResult.rows[0] as unknown as BrandProfile
    const strategy = strategyResult.rows[0]?.content_json as unknown as import('@/types').Strategy
    if (!brand || !strategy) return NextResponse.json({ error: 'Generate strategy first' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status) VALUES (${runId}, ${workspaceId}, 'content_calendar', 'running')`

    let calendar
    try {
      calendar = await generateContentCalendar(brand, strategy)
    } catch (agentError) {
      await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
      throw agentError
    }

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(calendar)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json) VALUES (${artifactId}, ${workspaceId}, ${runId}, 'content_calendar', '30-Day Content Calendar', ${JSON.stringify(calendar)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'content_calendar',
        artifactTitle: '30-Day Content Calendar',
      })
    }

    // ── Creative Supervisor requests (fire-and-forget, non-blocking) ──────────
    // Content Intelligence → requests visual assets to support the calendar
    const calObj = calendar as unknown as Record<string, unknown>
    const firstTheme = (calObj?.weeklyThemes as unknown[])?.[0] ||
                       (calObj?.themes as unknown[])?.[0] ||
                       `${brand.business_name} content`
    Promise.allSettled([
      generateStaticPost(workspaceId, String(firstTheme), 'instagram').then(r =>
        sql`INSERT INTO creative_requests (id, workspace_id, requesting_agent, creative_type, context_json, status, artifact_id)
            VALUES (${newId()}, ${workspaceId}, 'content_intelligence', 'visual_post',
                    ${JSON.stringify({ theme: firstTheme, calendarId: artifactId })}, 'completed', ${r.artifactId})`
      ),
      generateStoryCover(workspaceId, String(firstTheme), 'instagram').then(r =>
        sql`INSERT INTO creative_requests (id, workspace_id, requesting_agent, creative_type, context_json, status, artifact_id)
            VALUES (${newId()}, ${workspaceId}, 'content_intelligence', 'visual_story',
                    ${JSON.stringify({ theme: firstTheme, calendarId: artifactId })}, 'completed', ${r.artifactId})`
      ),
      generateVideoBrief(workspaceId, String(firstTheme), 'reel').then(r =>
        sql`INSERT INTO creative_requests (id, workspace_id, requesting_agent, creative_type, context_json, status, artifact_id)
            VALUES (${newId()}, ${workspaceId}, 'content_intelligence', 'video_brief',
                    ${JSON.stringify({ theme: firstTheme, calendarId: artifactId })}, 'completed', ${r.artifactId})`
      ),
    ]).catch(e => console.error('Content creative requests failed:', e))

    return NextResponse.json({ calendar, artifactId })
  } catch (error) {
    console.error('Content calendar error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const result = await sql`SELECT * FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'content_calendar' ORDER BY created_at DESC LIMIT 1`
  return NextResponse.json(result.rows[0] || null)
}
