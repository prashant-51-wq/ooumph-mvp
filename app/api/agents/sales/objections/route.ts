/**
 * Objection Handling Playbook — Worker Agent
 *
 * POST { workspaceId, objections?: string[] }
 *   If no objections provided, AI generates top 10 likely ones for this industry + offer.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { sendApprovalRequestEmail } from '@/lib/email'
import { generateObjectionPlaybook } from '@/lib/agents/sales'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      objections?: string[]
    }

    const { workspaceId, objections = [] } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const playbook = await generateObjectionPlaybook(brand, objections)

    const artifactId = newId()
    const title = `Objection Playbook — ${brand.business_name}`
    const contentJson = {
      playbook,
      businessName: brand.business_name,
      offer: brand.offer,
      targetAudience: brand.target_audience,
      totalObjections: playbook.length,
      generatedAt: new Date().toISOString(),
    }

    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (${artifactId}, ${workspaceId}, 'objection_playbook', ${title}, ${JSON.stringify(contentJson)})
    `
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'objection_playbook',
        artifactTitle: title,
      })
    }

    return NextResponse.json({
      ok: true,
      playbook,
      artifactId,
      message: `Objection playbook created with ${playbook.length} handlers.`,
    })
  } catch (error) {
    console.error('Objections worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
