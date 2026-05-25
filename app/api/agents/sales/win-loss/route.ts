/**
 * Win/Loss Analysis — Worker Agent
 *
 * POST { workspaceId }
 *   Loads closed deals, runs AI analysis, returns patterns + recommendations
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { sendApprovalRequestEmail } from '@/lib/email'
import { generateWinLossAnalysis } from '@/lib/agents/sales'
import type { BrandProfile } from '@/types'
import type { SalesDeal } from '@/lib/agents/sales'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId: string }
    const { workspaceId } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const [brandResult, wonResult, lostResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT * FROM sales_deals WHERE workspace_id = ${workspaceId} AND stage = 'closed_won' ORDER BY updated_at DESC LIMIT 30`,
      sql`SELECT * FROM sales_deals WHERE workspace_id = ${workspaceId} AND stage = 'closed_lost' ORDER BY updated_at DESC LIMIT 30`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const wonDeals = wonResult.rows as unknown as SalesDeal[]
    const lostDeals = lostResult.rows as unknown as SalesDeal[]

    if (wonDeals.length + lostDeals.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No closed deals yet. Win/loss analysis will be available once you have closed deals.',
        analysis: null,
      })
    }

    const analysis = await generateWinLossAnalysis(brand, wonDeals, lostDeals)

    const artifactId = newId()
    const title = `Win/Loss Analysis — ${brand.business_name}`
    const contentJson = {
      ...analysis,
      metadata: {
        wonDealsAnalyzed: wonDeals.length,
        lostDealsAnalyzed: lostDeals.length,
        generatedAt: new Date().toISOString(),
      },
    }

    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (${artifactId}, ${workspaceId}, 'win_loss_analysis', ${title}, ${JSON.stringify(contentJson)})
    `
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'win_loss_analysis',
        artifactTitle: title,
      })
    }

    return NextResponse.json({
      ok: true,
      analysis: contentJson,
      artifactId,
      message: `Win/loss analysis complete. Win rate: ${analysis.winRate}%. Analyzed ${wonDeals.length} won + ${lostDeals.length} lost deals.`,
    })
  } catch (error) {
    console.error('Win/loss worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
