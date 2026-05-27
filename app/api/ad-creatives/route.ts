/**
 * /api/ad-creatives
 *
 * CRUD for individual ad creatives. Each creative carries an optional
 * artifact_id which is the link the HITL gate uses inside the deploy
 * orchestrator.
 *
 *   GET    ?workspaceId=…&campaignId=…
 *   POST   { workspaceId, campaignId, artifactId?, headline, bodyCopy, mediaUrl?, destinationUrl }
 *   PATCH  { id, workspaceId, ...updates }
 *   DELETE ?id=…&workspaceId=…
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface CreativeRow {
  id: string
  workspace_id: string
  ad_campaign_id: string
  artifact_id: string | null
  headline: string
  body_copy: string
  media_url: string | null
  destination_url: string
  created_at: string
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const campaignId = searchParams.get('campaignId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = campaignId
    ? await sql`
        SELECT * FROM ad_creatives
        WHERE workspace_id = ${workspaceId} AND ad_campaign_id = ${campaignId}
        ORDER BY created_at ASC LIMIT 200
      `
    : await sql`
        SELECT * FROM ad_creatives
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC LIMIT 200
      `
  return NextResponse.json(result.rows as unknown as CreativeRow[])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      campaignId?: string
      artifactId?: string | null
      headline?: string
      bodyCopy?: string
      mediaUrl?: string | null
      destinationUrl?: string
    }
    const { workspaceId, campaignId, artifactId, headline, bodyCopy, mediaUrl, destinationUrl } = body
    if (!workspaceId || !campaignId || !headline?.trim() || !bodyCopy?.trim() || !destinationUrl?.trim()) {
      return NextResponse.json(
        { error: 'workspaceId, campaignId, headline, bodyCopy, and destinationUrl are required' },
        { status: 400 },
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Verify parent campaign ownership
    const campCheck = await sql`SELECT id FROM ad_campaigns WHERE id = ${campaignId} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!campCheck.rows[0]) {
      return NextResponse.json({ error: 'Parent campaign not found in this workspace' }, { status: 404 })
    }
    // Verify artifact ownership if provided (status may still be draft — that's enforced at deploy time)
    if (artifactId) {
      const artCheck = await sql`SELECT id FROM artifacts WHERE id = ${artifactId} AND workspace_id = ${workspaceId} LIMIT 1`
      if (!artCheck.rows[0]) {
        return NextResponse.json({ error: 'Artifact not found in this workspace' }, { status: 404 })
      }
    }

    const id = newId()
    await sql`
      INSERT INTO ad_creatives (
        id, workspace_id, ad_campaign_id, artifact_id,
        headline, body_copy, media_url, destination_url, created_at
      ) VALUES (
        ${id}, ${workspaceId}, ${campaignId}, ${artifactId || null},
        ${headline.trim()}, ${bodyCopy.trim()},
        ${mediaUrl || null}, ${destinationUrl.trim()},
        CURRENT_TIMESTAMP
      )
    `
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('[/api/ad-creatives POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string; workspaceId?: string
      artifactId?: string | null
      headline?: string; bodyCopy?: string
      mediaUrl?: string | null
      destinationUrl?: string
    }
    const { id, workspaceId } = body
    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    const existing = await sql`SELECT id FROM ad_creatives WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!existing.rows[0]) return NextResponse.json({ error: 'Creative not found' }, { status: 404 })

    await sql`
      UPDATE ad_creatives SET
        artifact_id     = COALESCE(${body.artifactId === undefined ? null : (body.artifactId || null)}, artifact_id),
        headline        = COALESCE(${body.headline ?? null}, headline),
        body_copy       = COALESCE(${body.bodyCopy ?? null}, body_copy),
        media_url       = COALESCE(${body.mediaUrl === undefined ? null : (body.mediaUrl || null)}, media_url),
        destination_url = COALESCE(${body.destinationUrl ?? null}, destination_url)
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/ad-creatives PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  await sql`DELETE FROM ad_creatives WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
