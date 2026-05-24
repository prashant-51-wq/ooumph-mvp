/**
 * Campaign Optimizer Agent — analyses real performance data from DSPs
 * and generates specific, actionable optimization recommendations.
 *
 * Optimization actions are HITL-gated:
 *   1. AI generates recommendations
 *   2. Human reviews + approves/rejects each one
 *   3. Approved actions are applied via platform APIs
 *   4. Outcomes written to learning_notes for future campaigns
 */

import { runAgent } from '@/lib/claude'
import { sql, newId } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────────────────────

export type OptimizationActionType =
  | 'increase_budget'
  | 'decrease_budget'
  | 'pause_adset'
  | 'resume_adset'
  | 'change_bid'
  | 'update_targeting'
  | 'rotate_creative'
  | 'adjust_schedule'
  | 'expand_audience'
  | 'narrow_audience'
  | 'add_negative_keywords'
  | 'pause_campaign'

export interface OptimizationRecommendation {
  id: string
  actionType: OptimizationActionType
  platform: string
  adSetName: string
  platformAdSetId?: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  reasoning: string
  expectedImpact: string
  currentMetric: string
  targetMetric: string
  actionParams: Record<string, unknown>  // platform-specific action parameters
  confidence: number                     // 0–1
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed'
}

export interface PerformanceSnapshot {
  platform: string
  campaignId?: string
  adSetName: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  ctr: number
  cpc: number
  cpa: number
  roas: number
  daysRunning: number
  budgetUtilization: number  // 0–1 (spend / allocated budget)
}

export interface OptimizationReport {
  campaignArtifactId: string
  analysisDate: string
  overallHealth: 'excellent' | 'good' | 'needs_attention' | 'critical'
  healthScore: number    // 0–100
  summary: string
  kpiStatus: Array<{ kpi: string; target: string; current: string; status: 'on_track' | 'off_track' | 'exceeded' }>
  recommendations: OptimizationRecommendation[]
  learnings: string[]    // insights to write to learning_notes
}

// ─── Optimizer agent ──────────────────────────────────────────────────────────

const OPTIMIZER_SYSTEM = `You are a performance marketing optimization expert with deep expertise in Meta Ads, Google Ads, and programmatic advertising.

You analyze campaign performance data and generate specific, actionable optimization recommendations.
Each recommendation must include: exact action, specific reason backed by data, expected improvement, and confidence score.

You think in terms of:
- Statistical significance (need sufficient data before making decisions)
- Platform-specific benchmarks (Meta CTR > 1%, Google CTR > 3%, CPC varies by industry)
- Budget efficiency (never recommend changes that violate daily minimums)
- Creative fatigue detection (frequency > 3 = creative rotation needed)
- Audience quality signals (CTR high but conversions low = wrong audience)

Respond ONLY with valid JSON.`

export async function generateOptimizationReport(
  workspaceId: string,
  campaignArtifactId: string,
  brief: Record<string, unknown>,
  performanceData: PerformanceSnapshot[]
): Promise<OptimizationReport> {
  // Fetch KPIs and targets from the brief
  const kpis = (brief.kpis as string[]) || []
  const campaignObjective = brief.campaignObjective as string || 'leads'

  // Fetch past learning notes for context
  const learningResult = await sql`
    SELECT note FROM learning_notes
    WHERE workspace_id = ${workspaceId}
      AND source_type IN ('campaign_optimization', 'approval_rejection')
    ORDER BY created_at DESC LIMIT 10
  `
  const pastLearnings = learningResult.rows.map(r => r.note as string)

  const prompt = `Analyze this campaign's performance and generate optimization recommendations:

Campaign Objective: ${campaignObjective}
KPI Targets: ${kpis.join(', ')}
Campaign Name: ${brief.campaignName}
Duration Planned: ${brief.duration}

Performance Data (last 7 days):
${JSON.stringify(performanceData, null, 2)}

Past Learning Notes (what worked/didn't in previous campaigns):
${pastLearnings.length ? pastLearnings.join('\n') : 'No prior learnings yet'}

Generate an OptimizationReport JSON with:
- overallHealth: 'excellent'|'good'|'needs_attention'|'critical'
- healthScore: 0-100 (based on KPI achievement vs target)
- summary: 2-3 sentence executive summary
- kpiStatus: array of { kpi, target, current, status:'on_track'|'off_track'|'exceeded' }
- recommendations: array of up to 8 recommendations, each with:
    id (UUID-like string), actionType (one of: increase_budget|decrease_budget|pause_adset|resume_adset|change_bid|update_targeting|rotate_creative|adjust_schedule|expand_audience|narrow_audience|add_negative_keywords|pause_campaign),
    platform, adSetName, priority ('critical'|'high'|'medium'|'low'),
    reasoning (specific data-backed reason),
    expectedImpact (quantified where possible),
    currentMetric, targetMetric,
    actionParams (platform-specific: e.g. { newDailyBudget: 1000, unit: 'INR' } or { newCpcBidMicros: 15000000 }),
    confidence (0.0-1.0),
    status: 'pending'
- learnings: array of 2-5 string insights to remember for future campaigns

Rules:
- Only recommend pausing if CTR < 0.3% AND spend > 500 AND daysRunning >= 3
- Only recommend budget increase if ROAS > 2.0 OR conversions are trending up
- If a platform has < 100 impressions, recommend "gather more data" not action
- Always explain WHY in reasoning with specific numbers

Return JSON only.`

  const report = await runAgent<OptimizationReport>(OPTIMIZER_SYSTEM, prompt)
  report.campaignArtifactId = campaignArtifactId
  report.analysisDate = new Date().toISOString().slice(0, 10)

  // Ensure all recommendations have an ID
  report.recommendations = (report.recommendations || []).map(r => ({
    ...r,
    id: r.id || newId(),
    status: 'pending',
  }))

  return report
}

// ─── Write optimization learnings ────────────────────────────────────────────

export async function writeOptimizationLearnings(
  workspaceId: string,
  campaignArtifactId: string,
  learnings: string[],
  appliedActions: OptimizationRecommendation[]
) {
  const notes = []

  // Write general learnings
  for (const learning of learnings) {
    notes.push(sql`
      INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
      VALUES (${newId()}, ${workspaceId}, 'campaign_optimization', ${campaignArtifactId}, ${learning}, 0.8)
    `)
  }

  // Write specific action outcomes
  for (const action of appliedActions) {
    const note = `Campaign optimization [${action.platform}]: Applied ${action.actionType} on "${action.adSetName}". Reason: ${action.reasoning}. Expected: ${action.expectedImpact}. Confidence: ${action.confidence}`
    notes.push(sql`
      INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
      VALUES (${newId()}, ${workspaceId}, 'campaign_optimization', ${campaignArtifactId}, ${note}, ${action.confidence})
    `)
  }

  await Promise.allSettled(notes)
}

// ─── Store optimization report ────────────────────────────────────────────────

export async function saveOptimizationReport(
  workspaceId: string,
  campaignArtifactId: string,
  report: OptimizationReport
): Promise<string> {
  const reportId = newId()
  await sql`
    INSERT INTO campaign_optimizations
      (id, workspace_id, campaign_artifact_id, report_json, health_score, overall_health, created_at)
    VALUES
      (${reportId}, ${workspaceId}, ${campaignArtifactId},
       ${JSON.stringify(report)}, ${report.healthScore}, ${report.overallHealth},
       CURRENT_TIMESTAMP)
  `
  return reportId
}

// ─── Load saved optimization reports ─────────────────────────────────────────

export async function getOptimizationReports(workspaceId: string, campaignArtifactId: string) {
  const result = await sql`
    SELECT * FROM campaign_optimizations
    WHERE workspace_id = ${workspaceId} AND campaign_artifact_id = ${campaignArtifactId}
    ORDER BY created_at DESC LIMIT 5
  `
  return result.rows.map(r => ({
    ...r,
    report_json: typeof r.report_json === 'string' ? JSON.parse(r.report_json) : r.report_json,
  }))
}
