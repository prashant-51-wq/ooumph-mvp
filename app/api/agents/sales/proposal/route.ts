/**
 * Proposal Generator — Worker Agent
 *
 * POST { workspaceId, prospectName, prospectCompany, need, budget, dealId?, tone? }
 * GET  ?workspaceId=xxx  — returns last 10 proposals
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { sendApprovalRequestEmail } from '@/lib/email'
import { generateSalesProposal } from '@/lib/agents/sales'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      prospectName: string
      prospectCompany?: string
      need: string
      budget?: string
      dealId?: string
      tone?: string
    }

    const { workspaceId, prospectName, prospectCompany, need, budget, dealId } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!prospectName) return NextResponse.json({ error: 'prospectName required' }, { status: 400 })
    if (!need) return NextResponse.json({ error: 'need required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const proposal = await generateSalesProposal(
      brand,
      prospectName,
      prospectCompany || 'Their Company',
      need,
      budget || 'Not specified',
    )

    const artifactId = newId()
    const title = `Proposal for ${prospectName}${prospectCompany ? ` — ${prospectCompany}` : ''}`

    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (${artifactId}, ${workspaceId}, 'sales_proposal', ${title}, ${JSON.stringify(proposal)})
    `
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    // Link to deal if provided
    if (dealId) {
      const dealResult = await sql`SELECT custom_fields FROM sales_deals WHERE id = ${dealId} AND workspace_id = ${workspaceId} LIMIT 1`
      if (dealResult.rows[0]) {
        const existing = (dealResult.rows[0].custom_fields as Record<string, unknown>) || {}
        await sql`
          UPDATE sales_deals
          SET custom_fields = ${JSON.stringify({ ...existing, proposal_artifact_id: artifactId })},
              updated_at = ${new Date().toISOString()}
          WHERE id = ${dealId} AND workspace_id = ${workspaceId}
        `
      }
    }

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'sales_proposal',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ ok: true, proposal, artifactId, message: 'Proposal generated.' })
  } catch (error) {
    console.error('Proposal worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json([], { status: 200 })

    const result = await sql`
      SELECT a.id, a.title, a.content_json, a.created_at,
             ap.status as approval_status, ap.id as approval_id
      FROM artifacts a
      LEFT JOIN approvals ap ON ap.artifact_id = a.id
      WHERE a.workspace_id = ${workspaceId} AND a.type = 'sales_proposal'
      ORDER BY a.created_at DESC LIMIT 10
    `
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Proposal GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
