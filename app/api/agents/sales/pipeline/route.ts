/**
 * Sales Pipeline Manager — Worker Agent
 *
 * GET  ?workspaceId=xxx
 *   Returns: { deals, metrics }
 *
 * POST { workspaceId, action, deal?, dealId?, newStage? }
 *   action: 'create_deal' | 'update_deal' | 'move_stage' | 'close_deal'
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import type { SalesDeal } from '@/lib/agents/sales'

function computeMetrics(deals: SalesDeal[]) {
  const totalValue = deals.reduce((s, d) => s + (d.value || 0), 0)
  const weightedValue = deals.reduce((s, d) => s + (d.value || 0) * ((d.probability || 0) / 100), 0)

  const dealsByStage: Record<string, { count: number; value: number }> = {}
  for (const d of deals) {
    const stage = d.stage || 'prospect'
    if (!dealsByStage[stage]) dealsByStage[stage] = { count: 0, value: 0 }
    dealsByStage[stage].count++
    dealsByStage[stage].value += d.value || 0
  }

  const wonDeals = deals.filter(d => d.stage === 'closed_won')
  const lostDeals = deals.filter(d => d.stage === 'closed_lost')
  const winRate = (wonDeals.length + lostDeals.length) > 0
    ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
    : 0

  return {
    totalValue: Math.round(totalValue),
    weightedValue: Math.round(weightedValue),
    dealsByStage,
    winRate,
    openDeals: deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)).length,
    totalDeals: deals.length,
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const result = await sql`
      SELECT * FROM sales_deals WHERE workspace_id = ${workspaceId}
      ORDER BY
        CASE stage
          WHEN 'negotiation' THEN 1
          WHEN 'proposal' THEN 2
          WHEN 'qualified' THEN 3
          WHEN 'prospect' THEN 4
          WHEN 'closed_won' THEN 5
          WHEN 'closed_lost' THEN 6
          ELSE 7
        END,
        value DESC
    `
    const deals = result.rows as unknown as SalesDeal[]
    const metrics = computeMetrics(deals)

    return NextResponse.json({ ok: true, deals, metrics })
  } catch (error) {
    console.error('Pipeline GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      action: 'create_deal' | 'update_deal' | 'move_stage' | 'close_deal'
      deal?: Partial<SalesDeal>
      dealId?: string
      newStage?: string
      closeType?: 'closed_won' | 'closed_lost'
    }

    const { workspaceId, action } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    // ── CREATE DEAL ────────────────────────────────────────────────────────────
    if (action === 'create_deal') {
      const d = body.deal
      if (!d?.contact_name) return NextResponse.json({ error: 'contact_name required' }, { status: 400 })
      if (!d?.title) return NextResponse.json({ error: 'deal title required' }, { status: 400 })

      const dealId = newId()
      const now = new Date().toISOString()

      await sql`
        INSERT INTO sales_deals (
          id, workspace_id, lead_id, contact_name, contact_email,
          company, title, value, currency, stage, probability,
          expected_close, notes, source, custom_fields, created_at, updated_at
        ) VALUES (
          ${dealId}, ${workspaceId}, ${d.lead_id || null}, ${d.contact_name}, ${d.contact_email || null},
          ${d.company || null}, ${d.title}, ${d.value || 0}, ${d.currency || 'USD'},
          ${d.stage || 'prospect'}, ${d.probability || 10},
          ${d.expected_close || null}, ${d.notes || null}, ${d.source || null},
          ${JSON.stringify(d.custom_fields || {})}, ${now}, ${now}
        )
      `

      // Fire deal_created workflow trigger (fire-and-forget)
      const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      fetch(`${appUrl}/api/workflow/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
        body: JSON.stringify({
          workspaceId,
          trigger: 'deal_created',
          data: { dealId, stage: d.stage || 'prospect', value: d.value || 0, contact_name: d.contact_name },
        }),
      }).catch(() => {})

      return NextResponse.json({ ok: true, dealId, message: 'Deal created.' })
    }

    // ── UPDATE DEAL ────────────────────────────────────────────────────────────
    if (action === 'update_deal') {
      const { dealId, deal: d } = body
      if (!dealId) return NextResponse.json({ error: 'dealId required' }, { status: 400 })
      if (!d) return NextResponse.json({ error: 'deal data required' }, { status: 400 })

      const existing = await sql`SELECT * FROM sales_deals WHERE id = ${dealId} AND workspace_id = ${workspaceId} LIMIT 1`
      if (!existing.rows[0]) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

      const now = new Date().toISOString()
      await sql`
        UPDATE sales_deals SET
          contact_name   = ${d.contact_name   ?? existing.rows[0].contact_name},
          contact_email  = ${d.contact_email  ?? existing.rows[0].contact_email},
          company        = ${d.company        ?? existing.rows[0].company},
          title          = ${d.title          ?? existing.rows[0].title},
          value          = ${d.value          ?? existing.rows[0].value},
          currency       = ${d.currency       ?? existing.rows[0].currency},
          stage          = ${d.stage          ?? existing.rows[0].stage},
          probability    = ${d.probability    ?? existing.rows[0].probability},
          expected_close = ${d.expected_close ?? existing.rows[0].expected_close},
          notes          = ${d.notes          ?? existing.rows[0].notes},
          source         = ${d.source         ?? existing.rows[0].source},
          custom_fields  = ${d.custom_fields ? JSON.stringify(d.custom_fields) : existing.rows[0].custom_fields},
          updated_at     = ${now}
        WHERE id = ${dealId} AND workspace_id = ${workspaceId}
      `

      return NextResponse.json({ ok: true, dealId, message: 'Deal updated.' })
    }

    // ── MOVE STAGE ─────────────────────────────────────────────────────────────
    if (action === 'move_stage') {
      const { dealId, newStage } = body
      if (!dealId) return NextResponse.json({ error: 'dealId required' }, { status: 400 })
      if (!newStage) return NextResponse.json({ error: 'newStage required' }, { status: 400 })

      const existing = await sql`SELECT * FROM sales_deals WHERE id = ${dealId} AND workspace_id = ${workspaceId} LIMIT 1`
      if (!existing.rows[0]) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

      const stageProbabilities: Record<string, number> = {
        prospect: 10, qualified: 25, proposal: 45, negotiation: 70, closed_won: 100, closed_lost: 0,
      }

      const now = new Date().toISOString()
      const newProbability = stageProbabilities[newStage] ?? Number(existing.rows[0].probability)

      await sql`
        UPDATE sales_deals
        SET stage = ${newStage}, probability = ${newProbability}, updated_at = ${now}
        WHERE id = ${dealId} AND workspace_id = ${workspaceId}
      `

      // Log stage change as activity
      await sql`
        INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
        VALUES (${newId()}, ${workspaceId}, ${dealId}, 'stage_change',
                ${'Stage moved to ' + newStage},
                ${'Deal advanced from ' + String(existing.rows[0].stage) + ' to ' + newStage},
                ${JSON.stringify({ from: existing.rows[0].stage, to: newStage, dealId })},
                ${now})
      `

      return NextResponse.json({ ok: true, dealId, newStage, probability: newProbability, message: `Deal moved to ${newStage}.` })
    }

    // ── CLOSE DEAL ─────────────────────────────────────────────────────────────
    if (action === 'close_deal') {
      const { dealId, closeType = 'closed_won' } = body
      if (!dealId) return NextResponse.json({ error: 'dealId required' }, { status: 400 })

      const existing = await sql`SELECT * FROM sales_deals WHERE id = ${dealId} AND workspace_id = ${workspaceId} LIMIT 1`
      if (!existing.rows[0]) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

      const now = new Date().toISOString()
      const probability = closeType === 'closed_won' ? 100 : 0

      await sql`
        UPDATE sales_deals
        SET stage = ${closeType}, probability = ${probability}, actual_close = ${now}, updated_at = ${now}
        WHERE id = ${dealId} AND workspace_id = ${workspaceId}
      `

      // Log close as activity
      await sql`
        INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
        VALUES (${newId()}, ${workspaceId}, ${dealId}, 'deal_closed',
                ${closeType === 'closed_won' ? 'Deal Won' : 'Deal Lost'},
                ${closeType === 'closed_won' ? 'Deal marked as closed won' : 'Deal marked as closed lost'},
                ${JSON.stringify({ closeType, dealId, value: existing.rows[0].value })},
                ${now})
      `

      return NextResponse.json({ ok: true, dealId, closeType, message: `Deal ${closeType === 'closed_won' ? 'won' : 'lost'}.` })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Pipeline POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
