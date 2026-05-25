/**
 * Demo Script Generator — Worker Agent
 *
 * POST {
 *   workspaceId,
 *   leadId?,
 *   prospectName,
 *   prospectContext?,
 *   focusFeatures?: string[]
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { sendApprovalRequestEmail } from '@/lib/email'
import { generateDemoScript } from '@/lib/agents/sales'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      leadId?: string
      prospectName?: string
      prospectContext?: string
      focusFeatures?: string[]
    }

    const { workspaceId, leadId, focusFeatures = [] } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    let prospectName = body.prospectName || 'Prospect'
    let prospectContext = body.prospectContext || ''

    if (leadId) {
      const [leadResult, activitiesResult] = await Promise.all([
        sql`SELECT * FROM leads_captured WHERE id = ${leadId} AND workspace_id = ${workspaceId} LIMIT 1`,
        sql`SELECT type, title FROM lead_activities WHERE lead_id = ${leadId} ORDER BY created_at DESC LIMIT 10`,
      ])

      const lead = leadResult.rows[0]
      if (lead) {
        prospectName = String(lead.name || prospectName)
        const actSummary = activitiesResult.rows
          .map(a => `${String(a.type)}: ${String(a.title)}`)
          .join(', ')

        prospectContext = [
          body.prospectContext,
          lead.source ? `Source: ${String(lead.source)}` : '',
          lead.campaign ? `Campaign: ${String(lead.campaign)}` : '',
          lead.email ? `Email: ${String(lead.email)}` : '',
          lead.notes ? `Notes: ${String(lead.notes).slice(0, 300)}` : '',
          actSummary ? `Activity history: ${actSummary}` : '',
        ].filter(Boolean).join(' | ')
      }
    }

    const script = await generateDemoScript(brand, prospectName, prospectContext, focusFeatures)

    const artifactId = newId()
    const title = `Demo Script — ${prospectName}`
    const contentJson = { ...script, leadId: leadId || null, generatedAt: new Date().toISOString() }

    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (${artifactId}, ${workspaceId}, 'demo_script', ${title}, ${JSON.stringify(contentJson)})
    `
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'demo_script',
        artifactTitle: title,
      })
    }

    return NextResponse.json({
      ok: true,
      script: contentJson,
      artifactId,
      message: `Demo script generated for ${prospectName}. Estimated time: ${script.talkingTime}.`,
    })
  } catch (error) {
    console.error('Demo script worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
