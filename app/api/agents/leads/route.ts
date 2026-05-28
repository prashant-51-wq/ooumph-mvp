import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { generateLeadGenPlan } from '@/lib/agents/leads'
import { sendApprovalRequestEmail } from '@/lib/email'
import { generateAdCreative, generateLandingVisual } from '@/lib/creative-workers'
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
    if (!brand || !strategy) return NextResponse.json({ error: 'Complete strategy first' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status) VALUES (${runId}, ${workspaceId}, 'lead_gen_planner', 'running')`

    let leadPlan
    try {
      leadPlan = await generateLeadGenPlan(brand, strategy)
    } catch (agentError) {
      await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
      throw agentError
    }

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(leadPlan)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json) VALUES (${artifactId}, ${workspaceId}, ${runId}, 'lead_gen_plan', 'Lead Generation Plan', ${JSON.stringify(leadPlan)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'lead_gen_plan',
        artifactTitle: 'Lead Generation Plan',
      })
    }

    // ── Creative Supervisor requests ───────────────────────────────────────────
    // Lead Funnel & Operations Agent → ad creative to drive traffic + landing page for conversion
    const leadPlanObj = leadPlan as unknown as Record<string, unknown>
    const leadMagnet = leadPlanObj?.leadMagnet || leadPlanObj?.offer || 'Lead Magnet'
    Promise.allSettled([
      generateAdCreative(workspaceId, String(leadMagnet), 'facebook', ['square', 'landscape', 'story']).then(r =>
        sql`INSERT INTO creative_requests (id, workspace_id, requesting_agent, creative_type, context_json, status, artifact_id)
            VALUES (${newId()}, ${workspaceId}, 'lead_funnel', 'visual_ad',
                    ${JSON.stringify({ leadMagnet: String(leadMagnet), leadPlanId: artifactId })}, 'completed', ${r.artifactId})`
      ),
      generateLandingVisual(workspaceId, 'lead_capture').then(r =>
        sql`INSERT INTO creative_requests (id, workspace_id, requesting_agent, creative_type, context_json, status, artifact_id)
            VALUES (${newId()}, ${workspaceId}, 'lead_funnel', 'landing_visual_pack',
                    ${JSON.stringify({ leadPlanId: artifactId })}, 'completed', ${r.artifactId})`
      ),
    ]).catch(e => console.error('Lead gen creative requests failed:', e))

    return NextResponse.json({ leadPlan, artifactId })
  } catch (error) {
    console.error('Lead gen error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const result = await sql`
    SELECT a.*, ap.status as approval_status, ap.id as approval_id
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'lead_gen_plan'
    ORDER BY a.created_at DESC LIMIT 1
  `
  return NextResponse.json(result.rows[0] || null)
}
