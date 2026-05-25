/**
 * Sales Supervisor Agent
 * POST { workspaceId, mode, ...modeParams }
 *
 * modes:
 *   pipeline_plan      — body: { workspaceId, growthTarget? }
 *   write_proposal     — body: { workspaceId, prospectName, prospectCompany, need, budget, dealId? }
 *   outreach_sequence  — body: { workspaceId, leadId, sequenceType?, context? }
 *   analyze_deal       — body: { workspaceId, dealId }
 *   forecast           — body: { workspaceId, period? }
 *   demo_script        — body: { workspaceId, leadId?, prospectContext?, focusFeatures? }
 *   objection_playbook — body: { workspaceId, objections? }
 *   win_loss           — body: { workspaceId }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { sendApprovalRequestEmail } from '@/lib/email'
import {
  generateSalesPipeline,
  generateSalesProposal,
  generateOutreachSequence,
  analyzeDeal,
  generateSalesForecast,
  generateDemoScript,
  generateObjectionPlaybook,
  generateWinLossAnalysis,
} from '@/lib/agents/sales'
import type { BrandProfile } from '@/types'
import type { SalesDeal } from '@/lib/agents/sales'

type Mode =
  | 'pipeline_plan'
  | 'write_proposal'
  | 'outreach_sequence'
  | 'analyze_deal'
  | 'forecast'
  | 'demo_script'
  | 'objection_playbook'
  | 'win_loss'

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const body = await req.json() as {
      workspaceId: string
      mode: Mode
      // pipeline_plan
      growthTarget?: string
      // write_proposal
      prospectName?: string
      prospectCompany?: string
      need?: string
      budget?: string
      dealId?: string
      tone?: string
      // outreach_sequence
      leadId?: string
      sequenceType?: 'cold' | 'warm' | 'enterprise' | 'win_back'
      context?: string
      // forecast
      period?: 'month' | 'quarter' | 'year'
      // demo_script
      prospectContext?: string
      focusFeatures?: string[]
      // objection_playbook
      objections?: string[]
    }

    const { workspaceId, mode } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!mode) return NextResponse.json({ error: 'mode required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Load brand profile — required for all modes
    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // Track agent run
    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'sales_supervisor', 'running')`

    // ── PIPELINE PLAN ──────────────────────────────────────────────────────────
    if (mode === 'pipeline_plan') {
      const dealsResult = await sql`
        SELECT * FROM sales_deals WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC
      `
      const deals = dealsResult.rows as unknown as SalesDeal[]

      let plan
      if (deals.length === 0) {
        // Generate a sample pipeline plan from brand profile + ICP
        const SAMPLE_SYSTEM = `You are a sales strategy expert. When given a business profile with no existing pipeline data,
generate a strategic pipeline plan with realistic deal flow, ICP guidance, and actionable recommendations.
Always respond with valid JSON.`
        interface SamplePlan {
          totalValue: number
          weightedValue: number
          dealsByStage: Record<string, { count: number; value: number }>
          avgDealSize: number
          avgCycleDays: number
          winRate: number
          forecastThisMonth: number
          topDeals: Array<{ title: string; value: number; stage: string; probability: number }>
          recommendations: string[]
        }
        plan = await runAgent<SamplePlan>(
          SAMPLE_SYSTEM,
          `Generate a sample pipeline plan and strategic recommendations for a new business:
Business: ${brand.business_name}
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}
Monthly Budget: ${brand.monthly_budget}
Growth Target: ${body.growthTarget || 'Not specified'}

Since there are no deals yet, create a hypothetical but realistic pipeline with projected metrics and actionable steps to build pipeline from scratch.

Return JSON with these fields: totalValue, weightedValue, dealsByStage (object), avgDealSize, avgCycleDays, winRate, forecastThisMonth, topDeals (empty array), recommendations (6 steps to build pipeline from zero)`,
        )
      } else {
        plan = await generateSalesPipeline(brand, deals)
      }

      await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(plan)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

      const artifactId = newId()
      const title = `Sales Pipeline Plan — ${brand.business_name}`
      await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
                VALUES (${artifactId}, ${workspaceId}, ${runId}, 'sales_pipeline', ${title}, ${JSON.stringify(plan)})`
      await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

      if (brand.approval_email) {
        await sendApprovalRequestEmail({ to: brand.approval_email, businessName: brand.business_name, artifactType: 'sales_pipeline', artifactTitle: title })
      }

      return NextResponse.json({ ok: true, artifactId, plan, message: 'Pipeline plan generated.' })
    }

    // ── WRITE PROPOSAL ─────────────────────────────────────────────────────────
    if (mode === 'write_proposal') {
      const { prospectName, prospectCompany, need, budget, dealId } = body
      if (!prospectName) return NextResponse.json({ error: 'prospectName required' }, { status: 400 })
      if (!need) return NextResponse.json({ error: 'need required' }, { status: 400 })

      const proposal = await generateSalesProposal(
        brand,
        prospectName,
        prospectCompany || 'Their Company',
        need,
        budget || 'Not specified',
      )

      await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(proposal)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

      const artifactId = newId()
      const title = `Proposal for ${prospectName}${prospectCompany ? ` — ${prospectCompany}` : ''}`
      await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
                VALUES (${artifactId}, ${workspaceId}, ${runId}, 'sales_proposal', ${title}, ${JSON.stringify(proposal)})`
      await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

      // Link proposal to deal if dealId provided
      if (dealId) {
        const dealResult = await sql`SELECT custom_fields FROM sales_deals WHERE id = ${dealId} AND workspace_id = ${workspaceId} LIMIT 1`
        if (dealResult.rows[0]) {
          const existingFields = (dealResult.rows[0].custom_fields as Record<string, unknown>) || {}
          const updatedFields = { ...existingFields, proposal_artifact_id: artifactId }
          await sql`UPDATE sales_deals SET custom_fields = ${JSON.stringify(updatedFields)}, updated_at = ${new Date().toISOString()} WHERE id = ${dealId} AND workspace_id = ${workspaceId}`
        }
      }

      if (brand.approval_email) {
        await sendApprovalRequestEmail({ to: brand.approval_email, businessName: brand.business_name, artifactType: 'sales_proposal', artifactTitle: title })
      }

      return NextResponse.json({ ok: true, artifactId, proposal, message: 'Proposal generated.' })
    }

    // ── OUTREACH SEQUENCE ──────────────────────────────────────────────────────
    if (mode === 'outreach_sequence') {
      const { leadId, sequenceType = 'cold', context = '' } = body

      let prospect = 'Prospect'
      let prospectContext = context

      if (leadId) {
        const [leadResult, activitiesResult] = await Promise.all([
          sql`SELECT * FROM leads_captured WHERE id = ${leadId} AND workspace_id = ${workspaceId} LIMIT 1`,
          sql`SELECT type, title FROM lead_activities WHERE lead_id = ${leadId} ORDER BY created_at DESC LIMIT 10`,
        ])
        const lead = leadResult.rows[0]
        if (lead) {
          prospect = `${String(lead.name || 'Prospect')}${lead.email ? ` (${String(lead.email)})` : ''}`
          const actSummary = activitiesResult.rows.map(a => `${String(a.type)}: ${String(a.title)}`).join(', ')
          prospectContext = [
            context,
            lead.source ? `Source: ${String(lead.source)}` : '',
            lead.campaign ? `Campaign: ${String(lead.campaign)}` : '',
            lead.notes ? `Notes: ${String(lead.notes)}` : '',
            actSummary ? `Past activity: ${actSummary}` : '',
          ].filter(Boolean).join(' | ')
        }
      }

      const sequence = await generateOutreachSequence(brand, prospect, prospectContext, sequenceType)

      await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(sequence)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

      const artifactId = newId()
      const title = `${sequenceType.charAt(0).toUpperCase() + sequenceType.slice(1)} Outreach Sequence — ${prospect}`
      await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
                VALUES (${artifactId}, ${workspaceId}, ${runId}, 'outreach_sequence', ${title}, ${JSON.stringify(sequence)})`
      await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

      if (brand.approval_email) {
        await sendApprovalRequestEmail({ to: brand.approval_email, businessName: brand.business_name, artifactType: 'outreach_sequence', artifactTitle: title })
      }

      return NextResponse.json({ ok: true, artifactId, sequence, message: `Outreach sequence generated with ${sequence.totalTouches} touches.` })
    }

    // ── ANALYZE DEAL ───────────────────────────────────────────────────────────
    if (mode === 'analyze_deal') {
      const { dealId } = body
      if (!dealId) return NextResponse.json({ error: 'dealId required' }, { status: 400 })

      const [dealResult, activitiesResult] = await Promise.all([
        sql`SELECT * FROM sales_deals WHERE id = ${dealId} AND workspace_id = ${workspaceId} LIMIT 1`,
        sql`SELECT type, title, created_at FROM lead_activities WHERE lead_id = ${dealId} ORDER BY created_at DESC LIMIT 30`,
      ])

      const deal = dealResult.rows[0] as unknown as SalesDeal
      if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

      const activities = activitiesResult.rows as Array<{ type: string; title: string; created_at: string }>

      // Also pull by lead_id if deal has one
      if (deal.lead_id) {
        const leadActivities = await sql`SELECT type, title, created_at FROM lead_activities WHERE lead_id = ${deal.lead_id} ORDER BY created_at DESC LIMIT 20`
        activities.push(...(leadActivities.rows as Array<{ type: string; title: string; created_at: string }>))
      }

      const analysis = await analyzeDeal(brand, deal, activities)

      await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(analysis)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

      // Auto-update deal probability
      await sql`UPDATE sales_deals SET probability = ${analysis.winProbability}, updated_at = ${new Date().toISOString()} WHERE id = ${dealId} AND workspace_id = ${workspaceId}`

      // Log analysis as activity
      await sql`
        INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
        VALUES (${newId()}, ${workspaceId}, ${dealId}, 'deal_analysis', ${'AI Deal Analysis: ' + analysis.nextAction}, ${analysis.reasoning}, ${JSON.stringify({ dealScore: analysis.dealScore, health: analysis.health, urgency: analysis.urgency })}, ${new Date().toISOString()})
      `

      const artifactId = newId()
      const title = `Deal Analysis — ${deal.title}`
      await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
                VALUES (${artifactId}, ${workspaceId}, ${runId}, 'deal_analysis', ${title}, ${JSON.stringify({ ...analysis, dealId, dealTitle: deal.title })})`
      await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

      return NextResponse.json({ ok: true, artifactId, analysis, dealId, message: `Deal analyzed. Health: ${analysis.health}. Score: ${analysis.dealScore}/100.` })
    }

    // ── FORECAST ───────────────────────────────────────────────────────────────
    if (mode === 'forecast') {
      const period = body.period || 'month'

      const dealsResult = await sql`SELECT * FROM sales_deals WHERE workspace_id = ${workspaceId}`
      const deals = dealsResult.rows as unknown as SalesDeal[]

      const forecast = await generateSalesForecast(brand, deals, period)

      await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(forecast)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

      const artifactId = newId()
      const title = `Sales Forecast — ${period.charAt(0).toUpperCase() + period.slice(1)} — ${brand.business_name}`
      await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
                VALUES (${artifactId}, ${workspaceId}, ${runId}, 'sales_forecast', ${title}, ${JSON.stringify(forecast)})`
      await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

      if (brand.approval_email) {
        await sendApprovalRequestEmail({ to: brand.approval_email, businessName: brand.business_name, artifactType: 'sales_forecast', artifactTitle: title })
      }

      return NextResponse.json({ ok: true, artifactId, forecast, message: `${period} forecast generated.` })
    }

    // ── DEMO SCRIPT ────────────────────────────────────────────────────────────
    if (mode === 'demo_script') {
      const { leadId, prospectContext = '', focusFeatures = [] } = body
      let prospectName = body.prospectName || 'Prospect'
      let finalContext = prospectContext

      if (leadId) {
        const leadResult = await sql`SELECT * FROM leads_captured WHERE id = ${leadId} AND workspace_id = ${workspaceId} LIMIT 1`
        const lead = leadResult.rows[0]
        if (lead) {
          prospectName = String(lead.name || prospectName)
          finalContext = [
            prospectContext,
            lead.source ? `Source: ${String(lead.source)}` : '',
            lead.campaign ? `Campaign: ${String(lead.campaign)}` : '',
            lead.notes ? `Notes: ${String(lead.notes)}` : '',
          ].filter(Boolean).join(' | ')
        }
      }

      const script = await generateDemoScript(brand, prospectName, finalContext, focusFeatures)

      await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(script)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

      const artifactId = newId()
      const title = `Demo Script — ${prospectName}`
      await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
                VALUES (${artifactId}, ${workspaceId}, ${runId}, 'demo_script', ${title}, ${JSON.stringify(script)})`
      await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

      if (brand.approval_email) {
        await sendApprovalRequestEmail({ to: brand.approval_email, businessName: brand.business_name, artifactType: 'demo_script', artifactTitle: title })
      }

      return NextResponse.json({ ok: true, artifactId, script, message: 'Demo script generated.' })
    }

    // ── OBJECTION PLAYBOOK ─────────────────────────────────────────────────────
    if (mode === 'objection_playbook') {
      const objections = body.objections || []

      const playbook = await generateObjectionPlaybook(brand, objections)

      await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(playbook)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

      const artifactId = newId()
      const title = `Objection Handling Playbook — ${brand.business_name}`
      await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
                VALUES (${artifactId}, ${workspaceId}, ${runId}, 'objection_playbook', ${title}, ${JSON.stringify({ playbook, businessName: brand.business_name })})`
      await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

      if (brand.approval_email) {
        await sendApprovalRequestEmail({ to: brand.approval_email, businessName: brand.business_name, artifactType: 'objection_playbook', artifactTitle: title })
      }

      return NextResponse.json({ ok: true, artifactId, playbook, message: `Playbook generated with ${playbook.length} objection handlers.` })
    }

    // ── WIN/LOSS ANALYSIS ──────────────────────────────────────────────────────
    if (mode === 'win_loss') {
      const [wonResult, lostResult] = await Promise.all([
        sql`SELECT * FROM sales_deals WHERE workspace_id = ${workspaceId} AND stage = 'closed_won' ORDER BY updated_at DESC LIMIT 30`,
        sql`SELECT * FROM sales_deals WHERE workspace_id = ${workspaceId} AND stage = 'closed_lost' ORDER BY updated_at DESC LIMIT 30`,
      ])

      const wonDeals = wonResult.rows as unknown as SalesDeal[]
      const lostDeals = lostResult.rows as unknown as SalesDeal[]

      const analysis = await generateWinLossAnalysis(brand, wonDeals, lostDeals)

      await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(analysis)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

      const artifactId = newId()
      const title = `Win/Loss Analysis — ${brand.business_name}`
      await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
                VALUES (${artifactId}, ${workspaceId}, ${runId}, 'win_loss_analysis', ${title}, ${JSON.stringify(analysis)})`
      await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

      if (brand.approval_email) {
        await sendApprovalRequestEmail({ to: brand.approval_email, businessName: brand.business_name, artifactType: 'win_loss_analysis', artifactTitle: title })
      }

      return NextResponse.json({ ok: true, artifactId, analysis, message: `Win/loss analysis complete. Win rate: ${analysis.winRate}%.` })
    }

    return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })
  } catch (error) {
    if (runId) {
      await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
        .catch(() => {})
    }
    console.error('Sales supervisor error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.type, a.title, a.content_json, a.created_at,
           ap.status as approval_status, ap.id as approval_id
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId}
      AND a.type IN ('sales_pipeline', 'sales_proposal', 'outreach_sequence', 'deal_analysis', 'sales_forecast', 'demo_script', 'objection_playbook', 'win_loss_analysis')
    ORDER BY a.created_at DESC LIMIT 50
  `
  return NextResponse.json(result.rows)
}
