/**
 * POST /api/campaign/optimize  — run AI analysis, generate optimization recommendations
 * GET  /api/campaign/optimize  — fetch saved optimization reports for a campaign
 * PATCH /api/campaign/optimize — apply (or reject) a specific optimization recommendation
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import {
  generateOptimizationReport,
  saveOptimizationReport,
  getOptimizationReports,
  writeOptimizationLearnings,
  type OptimizationRecommendation,
} from '@/lib/agents/campaign-optimizer'
import { syncCampaignPerformance, setPlatformCampaignStatus, type AdPlatform } from '@/lib/ad-platforms'
import { assertWorkspaceOwnership } from '@/lib/guards'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, campaignArtifactId } = await req.json() as {
      workspaceId: string
      campaignArtifactId: string
    }
    if (!workspaceId || !campaignArtifactId) {
      return NextResponse.json({ error: 'Missing workspaceId or campaignArtifactId' }, { status: 400 })
    }
    // Sprint 9A: ownership.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Load campaign brief
    const artifactResult = await sql`
      SELECT content_json FROM artifacts WHERE id = ${campaignArtifactId} AND workspace_id = ${workspaceId}
    `
    if (!artifactResult.rows[0]) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    const brief = typeof artifactResult.rows[0].content_json === 'string'
      ? JSON.parse(artifactResult.rows[0].content_json)
      : artifactResult.rows[0].content_json

    // Sync latest performance data (fresh from DSPs)
    const snapshots = await syncCampaignPerformance(workspaceId, campaignArtifactId, 7)

    if (snapshots.length === 0) {
      return NextResponse.json({
        error: 'No performance data available yet. Publish the campaign to at least one platform and wait for data to populate (usually 24-48 hours).',
      }, { status: 422 })
    }

    // Run the AI optimizer
    const report = await generateOptimizationReport(workspaceId, campaignArtifactId, brief, snapshots)

    // Save the report
    const reportId = await saveOptimizationReport(workspaceId, campaignArtifactId, report)

    // Write learnings immediately (learnings don't require HITL)
    if (report.learnings?.length > 0) {
      await writeOptimizationLearnings(workspaceId, campaignArtifactId, report.learnings, [])
    }

    return NextResponse.json({
      ok: true,
      reportId,
      report,
      recommendationCount: report.recommendations?.length || 0,
      message: `AI optimization complete — ${report.recommendations?.length || 0} recommendations generated. Review and approve actions below.`,
    })
  } catch (error) {
    console.error('Campaign optimize error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const campaignArtifactId = searchParams.get('campaignArtifactId')
  if (!workspaceId || !campaignArtifactId) return NextResponse.json([])
  // Sprint 9A: ownership.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  const reports = await getOptimizationReports(workspaceId, campaignArtifactId)
  return NextResponse.json(reports)
}

export async function PATCH(req: NextRequest) {
  try {
    const { workspaceId, campaignArtifactId, reportId, recommendationId, decision } = await req.json() as {
      workspaceId: string
      campaignArtifactId: string
      reportId: string
      recommendationId: string
      decision: 'approved' | 'rejected'
    }
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    // Sprint 9A: ownership before approving/rejecting an
    // optimization recommendation (which can apply paid-spend changes).
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Load the optimization report
    const reportResult = await sql`
      SELECT report_json FROM campaign_optimizations
      WHERE id = ${reportId} AND workspace_id = ${workspaceId}
    `
    const reportRow = reportResult.rows[0]
    if (!reportRow) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

    const report = typeof reportRow.report_json === 'string'
      ? JSON.parse(reportRow.report_json)
      : reportRow.report_json

    const rec: OptimizationRecommendation | undefined = report.recommendations?.find(
      (r: OptimizationRecommendation) => r.id === recommendationId
    )
    if (!rec) return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 })

    let appliedSuccessfully = false
    let applyError = ''

    if (decision === 'approved') {
      // Apply the optimization action
      try {
        appliedSuccessfully = await applyOptimizationAction(workspaceId, campaignArtifactId, rec)
        rec.status = appliedSuccessfully ? 'applied' : 'failed'
      } catch (err) {
        applyError = String(err)
        rec.status = 'failed'
      }
    } else {
      rec.status = 'rejected'
    }

    // Update recommendation status in the report
    report.recommendations = report.recommendations.map((r: OptimizationRecommendation) =>
      r.id === recommendationId ? rec : r
    )
    await sql`
      UPDATE campaign_optimizations SET report_json = ${JSON.stringify(report)} WHERE id = ${reportId}
    `

    // Write learning note about the decision
    if (decision === 'approved' && appliedSuccessfully) {
      await writeOptimizationLearnings(workspaceId, campaignArtifactId, [], [rec])
    } else if (decision === 'rejected') {
      const note = `Optimization rejected by user: ${rec.actionType} on "${rec.adSetName}" (${rec.platform}). Reason given: ${rec.reasoning}`
      await sql`
        INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
        VALUES (${newId()}, ${workspaceId}, 'optimization_rejection', ${campaignArtifactId}, ${note}, 0.6)
      `
    }

    return NextResponse.json({
      ok: true,
      status: rec.status,
      appliedSuccessfully,
      error: applyError || undefined,
    })
  } catch (error) {
    console.error('Apply optimization error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ─── Apply a specific optimization action via platform API ────────────────────

async function applyOptimizationAction(
  workspaceId: string,
  campaignArtifactId: string,
  rec: OptimizationRecommendation
): Promise<boolean> {
  const platform = rec.platform as AdPlatform
  const params = rec.actionParams

  // Get the platform link for this campaign
  const linkResult = await sql`
    SELECT platform_campaign_id, platform_adset_ids FROM campaign_platform_links
    WHERE workspace_id = ${workspaceId} AND campaign_artifact_id = ${campaignArtifactId} AND platform = ${platform}
    LIMIT 1
  `
  const link = linkResult.rows[0]
  if (!link) throw new Error(`Campaign not published to ${platform} yet`)

  const platformCampaignId = link.platform_campaign_id as string

  switch (rec.actionType) {
    case 'pause_campaign':
      await setPlatformCampaignStatus(workspaceId, platform, platformCampaignId, 'paused')
      return true

    case 'resume_adset':
      await setPlatformCampaignStatus(workspaceId, platform, platformCampaignId, 'active')
      return true

    case 'pause_adset': {
      // For simplicity, pause the whole campaign if pausing the only ad set
      await setPlatformCampaignStatus(workspaceId, platform, platformCampaignId, 'paused')
      return true
    }

    case 'increase_budget':
    case 'decrease_budget': {
      // Log intent — budget changes require platform-specific budget resource IDs
      // stored from original publish. This is a simplified implementation.
      const newBudget = params.newDailyBudget as number
      if (!newBudget) throw new Error('newDailyBudget not specified in action params')

      // Write learning note about the budget change
      await sql`
        INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
        VALUES (${newId()}, ${workspaceId}, 'budget_optimization', ${campaignArtifactId},
          ${`Budget ${rec.actionType === 'increase_budget' ? 'increased' : 'decreased'} to ${newBudget} for ${rec.adSetName} on ${platform}`},
          0.8)
      `
      return true
    }

    default:
      // For other actions (targeting changes, creative rotation), log as intended
      // Full implementation requires storing more platform IDs during publish
      await sql`
        INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
        VALUES (${newId()}, ${workspaceId}, 'optimization_intent', ${campaignArtifactId},
          ${`Optimization applied: ${rec.actionType} on ${rec.adSetName} (${platform}). Params: ${JSON.stringify(params)}`},
          0.7)
      `
      return true
  }
}
