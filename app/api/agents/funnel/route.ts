import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { generateFunnelPlan } from '@/lib/agents/funnel'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json()
    const [brandResult, strategyResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
    ])
    const brand = brandResult.rows[0] as import('@/types').BrandProfile
    const strategy = strategyResult.rows[0]?.content_json
    if (!brand || !strategy) return NextResponse.json({ error: 'Complete strategy first' }, { status: 400 })

    const runResult = await sql`
      INSERT INTO agent_runs (workspace_id, agent_name, status)
      VALUES (${workspaceId}, 'funnel_planner', 'running') RETURNING id
    `
    const runId = runResult.rows[0].id
    const funnel = await generateFunnelPlan(brand, strategy)
    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(funnel)}, completed_at = NOW() WHERE id = ${runId}`

    const result = await sql`
      INSERT INTO artifacts (workspace_id, agent_run_id, type, title, content_json)
      VALUES (${workspaceId}, ${runId}, 'funnel_plan', 'Funnel Blueprint', ${JSON.stringify(funnel)})
      RETURNING id
    `
    await sql`INSERT INTO approvals (workspace_id, artifact_id) VALUES (${workspaceId}, ${result.rows[0].id})`
    return NextResponse.json({ funnel, artifactId: result.rows[0].id })
  } catch (error) {
    console.error('Funnel error:', error)
    return NextResponse.json({ error: 'Funnel generation failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const result = await sql`
    SELECT * FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'funnel_plan'
    ORDER BY created_at DESC LIMIT 1
  `
  return NextResponse.json(result.rows[0] || null)
}
