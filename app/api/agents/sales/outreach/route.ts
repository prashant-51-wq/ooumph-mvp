/**
 * Outreach Sequence Generator — Worker Agent
 *
 * POST {
 *   workspaceId,
 *   leadId?,
 *   prospectName?,
 *   prospectContext?,
 *   sequenceType?: 'cold'|'warm'|'enterprise'|'win_back',
 *   channels?: string[]
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { sendApprovalRequestEmail } from '@/lib/email'
import { generateOutreachSequence } from '@/lib/agents/sales'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      leadId?: string
      prospectName?: string
      prospectContext?: string
      sequenceType?: 'cold' | 'warm' | 'enterprise' | 'win_back'
      channels?: string[]
    }

    const {
      workspaceId,
      leadId,
      sequenceType = 'cold',
    } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // Build prospect context
    let prospectName = body.prospectName || 'Prospect'
    let prospectContext = body.prospectContext || ''

    if (leadId) {
      const [leadResult, activitiesResult] = await Promise.all([
        sql`SELECT * FROM leads_captured WHERE id = ${leadId} AND workspace_id = ${workspaceId} LIMIT 1`,
        sql`SELECT type, title, created_at FROM lead_activities WHERE lead_id = ${leadId} ORDER BY created_at DESC LIMIT 15`,
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
          lead.notes ? `Notes: ${String(lead.notes).slice(0, 200)}` : '',
          actSummary ? `Past activity: ${actSummary}` : '',
          `Lead score: ${String(lead.score)}`,
          `Status: ${String(lead.status)}`,
        ].filter(Boolean).join(' | ')
      }
    }

    const sequence = await generateOutreachSequence(brand, prospectName, prospectContext, sequenceType)

    const artifactId = newId()
    const title = `${sequenceType.charAt(0).toUpperCase() + sequenceType.slice(1)} Outreach — ${prospectName}`

    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (${artifactId}, ${workspaceId}, 'outreach_sequence', ${title}, ${JSON.stringify({
        ...sequence,
        prospectName,
        sequenceType,
        leadId: leadId || null,
      })})
    `
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    // Auto-create workflow steps if warm sequence + leadId
    if (sequenceType === 'warm' && leadId) {
      const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      fetch(`${appUrl}/api/workflow/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
        body: JSON.stringify({
          workspaceId,
          trigger: 'outreach_sequence_created',
          data: { leadId, artifactId, sequenceType, touchCount: sequence.totalTouches },
        }),
      }).catch(() => {})
    }

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'outreach_sequence',
        artifactTitle: title,
      })
    }

    return NextResponse.json({
      ok: true,
      sequence,
      artifactId,
      message: `${sequenceType} sequence generated: ${sequence.totalTouches} touches over ${sequence.duration}.`,
    })
  } catch (error) {
    console.error('Outreach worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
