import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { generateStrategy } from '@/lib/agents/strategy'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json()

    const brandResult = await sql`
      SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1
    `
    const brand = brandResult.rows[0] as import('@/types').BrandProfile
    if (!brand) return NextResponse.json({ error: 'Brand profile not found' }, { status: 404 })

    const runResult = await sql`
      INSERT INTO agent_runs (workspace_id, agent_name, status, input_json)
      VALUES (${workspaceId}, 'strategy', 'running', ${JSON.stringify({ workspaceId })})
      RETURNING id
    `
    const runId = runResult.rows[0].id

    const strategy = await generateStrategy(brand)

    await sql`
      UPDATE agent_runs
      SET status = 'completed', output_json = ${JSON.stringify(strategy)}, completed_at = NOW()
      WHERE id = ${runId}
    `

    const artifactResult = await sql`
      INSERT INTO artifacts (workspace_id, agent_run_id, type, title, content_json)
      VALUES (${workspaceId}, ${runId}, 'strategy', 'Marketing Strategy', ${JSON.stringify(strategy)})
      RETURNING id
    `
    const artifactId = artifactResult.rows[0].id

    await sql`
      INSERT INTO approvals (workspace_id, artifact_id, status)
      VALUES (${workspaceId}, ${artifactId}, 'pending')
    `

    return NextResponse.json({ strategy, artifactId, runId })
  } catch (error) {
    console.error('Strategy agent error:', error)
    return NextResponse.json({ error: 'Strategy generation failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')

  const result = await sql`
    SELECT a.*, ap.status as approval_status, ap.id as approval_id
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'strategy'
    ORDER BY a.created_at DESC LIMIT 1
  `
  return NextResponse.json(result.rows[0] || null)
}
