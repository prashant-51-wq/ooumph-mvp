import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { generateLeadGenPlan } from '@/lib/agents/leads'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json()
    const [brandResult, strategyResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
    ])
    const brand = brandResult.rows[0] as BrandProfile
    const strategy = strategyResult.rows[0]?.content_json
    if (!brand || !strategy) return NextResponse.json({ error: 'Complete strategy first' }, { status: 400 })

    const runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status) VALUES (${runId}, ${workspaceId}, 'lead_gen_planner', 'running')`
    const leadPlan = await generateLeadGenPlan(brand, strategy)
    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(leadPlan)}, completed_at = datetime('now') WHERE id = ${runId}`

    const artifactId = newId()
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json) VALUES (${artifactId}, ${workspaceId}, ${runId}, 'lead_gen_plan', 'Lead Generation Plan', ${JSON.stringify(leadPlan)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`
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
    SELECT * FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'lead_gen_plan'
    ORDER BY created_at DESC LIMIT 1
  `
  return NextResponse.json(result.rows[0] || null)
}
