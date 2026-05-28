/**
 * Retargeting Worker: Abandoned Journey Analyzer
 * POST { workspaceId, funnelStages? }
 * GET  ?workspaceId=xxx
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { sendApprovalRequestEmail } from '@/lib/email'
import type { BrandProfile } from '@/types'
import { analyzeAbandonedJourney, writeRetargetingCopy } from '@/lib/agents/retargeting'

const SYSTEM = `You are a conversion funnel analyst and revenue recovery specialist.
You find the highest-value drop-off points and design precision retargeting to recover them.
Respond ONLY with valid JSON.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      funnelStages?: Array<{ name: string; dropoffRate: number; usersLost: number }>
    }
    const { workspaceId } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // ── Enrich funnel data from real DB signals ─────────────────────────────
    let funnelStages = body.funnelStages

    if (!funnelStages || funnelStages.length === 0) {
      // Build estimated funnel data from available signals
      const [totalLeadsRes, statusCountRes, bookingsRes, emailSubsRes] = await Promise.all([
        sql`SELECT COUNT(*) as total FROM leads_captured WHERE workspace_id = ${workspaceId}`,
        sql`SELECT status, COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} GROUP BY status`,
        sql`SELECT status, COUNT(*) as cnt FROM bookings WHERE workspace_id = ${workspaceId} GROUP BY status`,
        sql`SELECT COUNT(*) as total FROM email_subscribers WHERE workspace_id = ${workspaceId}`,
      ])

      const totalLeads = Number(totalLeadsRes.rows[0]?.total || 0)
      const emailSubs = Number(emailSubsRes.rows[0]?.total || 0)

      const statusCounts: Record<string, number> = {}
      for (const r of statusCountRes.rows) {
        statusCounts[String(r.status || 'unknown')] = Number(r.cnt)
      }

      const bookingCounts: Record<string, number> = {}
      for (const r of bookingsRes.rows) {
        bookingCounts[String(r.status || 'unknown')] = Number(r.cnt)
      }

      // Estimate funnel stages from available data
      // If we have real data, use it — otherwise let AI infer
      if (totalLeads > 0) {
        const newLeads = statusCounts['new'] || 0
        const qualifiedLeads = (statusCounts['qualified'] || 0) + (statusCounts['proposal'] || 0)
        const customers = statusCounts['customer'] || 0
        const confirmedBookings = bookingCounts['confirmed'] || 0

        // Construct estimated stages with real data
        funnelStages = [
          {
            name: 'Lead Captured (Not Contacted)',
            dropoffRate: newLeads / Math.max(totalLeads, 1),
            usersLost: newLeads,
          },
          {
            name: 'Leads in Progress (Not Qualified)',
            dropoffRate: Math.max(0, totalLeads - qualifiedLeads - customers) / Math.max(totalLeads, 1),
            usersLost: Math.max(0, totalLeads - qualifiedLeads - customers),
          },
        ]

        if (confirmedBookings > 0) {
          const noShows = bookingCounts['no_show'] || 0
          if (noShows > 0) {
            funnelStages.push({
              name: 'Booking No-Shows',
              dropoffRate: noShows / Math.max(confirmedBookings + noShows, 1),
              usersLost: noShows,
            })
          }
        }

        if (emailSubs > 0 && emailSubs > customers) {
          funnelStages.push({
            name: 'Email Subscribers (Not Converted)',
            dropoffRate: (emailSubs - customers) / Math.max(emailSubs, 1),
            usersLost: Math.max(0, emailSubs - customers),
          })
        }
      }
      // If still no data, pass undefined — AI will infer the entire funnel
    }

    // ── Generate the journey map ──────────────────────────────────────────────
    const journey = await analyzeAbandonedJourney(brand, funnelStages)

    // ── Prioritize stages by recoverable value ────────────────────────────────
    // Recovery score = dropoffRate × usersLost × estimated deal value
    const estimatedDealValue = parseInt(brand.monthly_budget?.replace(/\D/g, '') || '500') / 5
    const prioritizedStages = [...(journey.funnelStages || [])].sort((a, b) => {
      const scoreA = (parseFloat(a.dropoffRate) / 100) * a.estimatedUsersLost * estimatedDealValue
      const scoreB = (parseFloat(b.dropoffRate) / 100) * b.estimatedUsersLost * estimatedDealValue
      return scoreB - scoreA
    })

    // ── Generate ad copy for the top 3 priority stages ─────────────────────────
    const topStages = prioritizedStages.slice(0, 3)
    const stageAdCopies: Record<string, unknown> = {}

    // Determine which platforms to target (use brand channels or default)
    const brandPlatforms = Array.isArray(brand.channels) ? brand.channels : ['meta']
    const primaryPlatform = brandPlatforms.includes('linkedin') ? 'linkedin'
      : brandPlatforms.includes('meta') || brandPlatforms.includes('instagram') || brandPlatforms.includes('facebook') ? 'meta'
      : 'meta'

    for (const stage of topStages) {
      try {
        const copy = await writeRetargetingCopy(
          brand,
          stage.name,
          primaryPlatform as 'meta' | 'google' | 'linkedin' | 'tiktok',
          stage.adCopy // use the AI-generated copy as context so we don't repeat it
        )
        stageAdCopies[stage.name] = copy
      } catch (e) {
        console.error(`Copy generation failed for stage "${stage.name}":`, e)
      }
    }

    // ── Build the 30-day recovery timeline ───────────────────────────────────
    interface RecoveryTimeline {
      week1: string[]
      week2: string[]
      week3: string[]
      week4: string[]
      month2Plus: string[]
      estimatedRecoveryByWeek: Record<string, string>
    }
    const recoveryTimeline = await runAgent<RecoveryTimeline>(
      SYSTEM,
      `Create a 30-day retargeting recovery timeline for these funnel stages.

Business: ${brand.business_name}
Offer: ${brand.offer}
Top priority stages: ${JSON.stringify(topStages.map(s => ({ name: s.name, dropoffRate: s.dropoffRate, urgency: s.urgencyLevel })))}
Quick wins: ${JSON.stringify(journey.quickWins)}
Estimated deal value: $${estimatedDealValue}

Return a weekly action plan:
{
  "week1": ["action 1 — specific and immediately actionable", "action 2"],
  "week2": ["action 1", "action 2"],
  "week3": ["action 1", "action 2"],
  "week4": ["action 1", "action 2"],
  "month2Plus": ["ongoing optimization actions"],
  "estimatedRecoveryByWeek": {
    "week1": "estimated $ recovered",
    "week2": "cumulative",
    "week4": "cumulative 30-day total"
  }
}`
    )

    const result = {
      journey: {
        ...journey,
        funnelStages: prioritizedStages,
      },
      prioritizedStages,
      stageAdCopies,
      recoveryTimeline,
      usedRealData: !!(funnelStages && funnelStages.length > 0),
      estimatedDealValue: `$${estimatedDealValue}`,
      topPriorityStage: prioritizedStages[0]?.name || 'N/A',
      generatedAt: new Date().toISOString(),
    }

    // ── Save artifact ─────────────────────────────────────────────────────────
    const runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'retargeting_abandoned', 'completed')`

    const artifactId = newId()
    const title = `Abandoned Journey Map — ${brand.business_name}`
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'abandoned_journey_map', ${title}, ${JSON.stringify(result)})`

    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'abandoned_journey_map',
        artifactTitle: title,
      })
    }

    return NextResponse.json({
      ok: true,
      artifactId,
      ...result,
    })
  } catch (error) {
    console.error('Abandoned journey error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at,
           ap.status as approval_status
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'abandoned_journey_map'
    ORDER BY a.created_at DESC LIMIT 5
  `
  return NextResponse.json(result.rows)
}
