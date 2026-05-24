import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { generateAssets } from '@/lib/agents/assets'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json()

    const [brandResult, strategyResult, notesResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT note FROM learning_notes WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 10`,
    ])

    const brand = brandResult.rows[0] as import('@/types').BrandProfile
    const strategy = strategyResult.rows[0]?.content_json
    const learningNotes = notesResult.rows.map((r) => r.note)

    if (!brand || !strategy) {
      return NextResponse.json({ error: 'Complete strategy first' }, { status: 400 })
    }

    const runResult = await sql`
      INSERT INTO agent_runs (workspace_id, agent_name, status)
      VALUES (${workspaceId}, 'asset_generator', 'running')
      RETURNING id
    `
    const runId = runResult.rows[0].id

    const assets = await generateAssets(brand, strategy, learningNotes)

    await sql`
      UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(assets)}, completed_at = NOW()
      WHERE id = ${runId}
    `

    const assetTypes = ['carousel', 'reelScript', 'adCopy', 'emailDraft', 'linkedInPost'] as const
    const assetTitles = {
      carousel: 'Carousel Post',
      reelScript: 'Reel Script',
      adCopy: 'Ad Copy Set',
      emailDraft: 'Email Draft',
      linkedInPost: 'LinkedIn Post',
    }

    const artifactIds: Record<string, string> = {}
    for (const type of assetTypes) {
      const result = await sql`
        INSERT INTO artifacts (workspace_id, agent_run_id, type, title, content_json)
        VALUES (${workspaceId}, ${runId}, ${type}, ${assetTitles[type]}, ${JSON.stringify(assets[type])})
        RETURNING id
      `
      artifactIds[type] = result.rows[0].id
      await sql`INSERT INTO approvals (workspace_id, artifact_id) VALUES (${workspaceId}, ${result.rows[0].id})`
    }

    return NextResponse.json({ assets, artifactIds })
  } catch (error) {
    console.error('Asset generation error:', error)
    return NextResponse.json({ error: 'Asset generation failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const result = await sql`
    SELECT a.*, ap.status as approval_status, ap.id as approval_id, ap.notes as approval_notes
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId}
    AND a.type IN ('carousel', 'reelScript', 'adCopy', 'emailDraft', 'linkedInPost')
    ORDER BY a.created_at DESC
  `
  return NextResponse.json(result.rows)
}
