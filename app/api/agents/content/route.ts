import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { generateContentCalendar } from '@/lib/agents/content'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json()

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as import('@/types').BrandProfile

    const strategyResult = await sql`
      SELECT content_json FROM artifacts
      WHERE workspace_id = ${workspaceId} AND type = 'strategy'
      ORDER BY created_at DESC LIMIT 1
    `
    const strategy = strategyResult.rows[0]?.content_json

    if (!brand || !strategy) {
      return NextResponse.json({ error: 'Complete onboarding and strategy first' }, { status: 400 })
    }

    const runResult = await sql`
      INSERT INTO agent_runs (workspace_id, agent_name, status)
      VALUES (${workspaceId}, 'content_calendar', 'running')
      RETURNING id
    `
    const runId = runResult.rows[0].id

    const calendar = await generateContentCalendar(brand, strategy)

    await sql`
      UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(calendar)}, completed_at = NOW()
      WHERE id = ${runId}
    `

    const artifactResult = await sql`
      INSERT INTO artifacts (workspace_id, agent_run_id, type, title, content_json)
      VALUES (${workspaceId}, ${runId}, 'content_calendar', '30-Day Content Calendar', ${JSON.stringify(calendar)})
      RETURNING id
    `
    const artifactId = artifactResult.rows[0].id
    await sql`INSERT INTO approvals (workspace_id, artifact_id) VALUES (${workspaceId}, ${artifactId})`

    return NextResponse.json({ calendar, artifactId })
  } catch (error) {
    console.error('Content calendar error:', error)
    return NextResponse.json({ error: 'Content calendar generation failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const result = await sql`
    SELECT * FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'content_calendar'
    ORDER BY created_at DESC LIMIT 1
  `
  return NextResponse.json(result.rows[0] || null)
}
