/**
 * Revenue Forecast Agent — Worker Agent
 *
 * POST { workspaceId, period?: 'month'|'quarter'|'year' }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { sendApprovalRequestEmail } from '@/lib/email'
import { generateSalesForecast } from '@/lib/agents/sales'
import type { BrandProfile } from '@/types'
import type { SalesDeal } from '@/lib/agents/sales'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      period?: 'month' | 'quarter' | 'year'
    }

    const { workspaceId, period = 'month' } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const [brandResult, dealsResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT * FROM sales_deals WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const deals = dealsResult.rows as unknown as SalesDeal[]

    // Compute simple pipeline metrics before calling AI
    const openDeals = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage))
    const totalValue = openDeals.reduce((s, d) => s + (d.value || 0), 0)
    const weightedValue = openDeals.reduce((s, d) => s + (d.value || 0) * ((d.probability || 0) / 100), 0)
    const wonDeals = deals.filter(d => d.stage === 'closed_won')
    const lostDeals = deals.filter(d => d.stage === 'closed_lost')

    const forecast = await generateSalesForecast(brand, deals, period)

    const artifactId = newId()
    const title = `Sales Forecast — ${period.charAt(0).toUpperCase() + period.slice(1)} — ${brand.business_name}`
    const contentJson = {
      ...forecast,
      metadata: {
        generatedAt: new Date().toISOString(),
        period,
        totalPipelineValue: Math.round(totalValue),
        weightedPipelineValue: Math.round(weightedValue),
        openDealCount: openDeals.length,
        wonDealCount: wonDeals.length,
        lostDealCount: lostDeals.length,
      },
    }

    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (${artifactId}, ${workspaceId}, 'sales_forecast', ${title}, ${JSON.stringify(contentJson)})
    `
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'sales_forecast',
        artifactTitle: title,
      })
    }

    return NextResponse.json({
      ok: true,
      forecast: contentJson,
      artifactId,
      message: `${period} forecast generated. Realistic: ${forecast.realistic}. Committed: ${forecast.committed}.`,
    })
  } catch (error) {
    console.error('Forecast worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
