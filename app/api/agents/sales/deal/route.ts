/**
 * Deal Intelligence Agent — Worker Agent
 *
 * POST { workspaceId, dealId }
 *   Analyzes a deal, updates probability, logs activity, returns analysis
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { analyzeDeal } from '@/lib/agents/sales'
import type { BrandProfile } from '@/types'
import type { SalesDeal } from '@/lib/agents/sales'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      dealId: string
    }

    const { workspaceId, dealId } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!dealId) return NextResponse.json({ error: 'dealId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const [brandResult, dealResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT * FROM sales_deals WHERE id = ${dealId} AND workspace_id = ${workspaceId} LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const deal = dealResult.rows[0] as unknown as SalesDeal
    if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

    // Gather activity history — check both deal ID and associated lead ID
    const activityIds = [dealId, deal.lead_id].filter(Boolean) as string[]
    const allActivities: Array<{ type: string; title: string; created_at: string }> = []

    for (const id of activityIds) {
      const res = await sql`
        SELECT type, title, created_at FROM lead_activities
        WHERE lead_id = ${id}
        ORDER BY created_at DESC LIMIT 20
      `
      allActivities.push(...(res.rows as Array<{ type: string; title: string; created_at: string }>))
    }

    // Deduplicate and sort by created_at desc
    const seen = new Set<string>()
    const activities = allActivities
      .filter(a => {
        const key = `${a.type}:${a.title}:${a.created_at}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 30)

    const analysis = await analyzeDeal(brand, deal, activities)

    // Auto-update probability based on analysis
    await sql`
      UPDATE sales_deals
      SET probability = ${analysis.winProbability},
          updated_at = ${new Date().toISOString()}
      WHERE id = ${dealId} AND workspace_id = ${workspaceId}
    `

    // Log analysis as activity on the deal
    await sql`
      INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
      VALUES (
        ${newId()}, ${workspaceId}, ${dealId},
        'deal_analysis',
        ${'AI Analysis: Score ' + analysis.dealScore + '/100 — ' + analysis.nextAction},
        ${analysis.reasoning},
        ${JSON.stringify({
          dealScore: analysis.dealScore,
          health: analysis.health,
          winProbability: analysis.winProbability,
          urgency: analysis.urgency,
          nextActionType: analysis.nextActionType,
        })},
        ${new Date().toISOString()}
      )
    `

    return NextResponse.json({
      ok: true,
      analysis,
      dealId,
      probabilityUpdated: analysis.winProbability,
      message: `Deal analyzed. Health: ${analysis.health}. Score: ${analysis.dealScore}/100. Urgency: ${analysis.urgency}.`,
    })
  } catch (error) {
    console.error('Deal intelligence error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
