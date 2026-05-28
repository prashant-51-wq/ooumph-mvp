/**
 * Retargeting Supervisor
 * POST { workspaceId, mode, ...modeParams }
 *
 * modes:
 *   audience_segment   — Analyze workspace leads and segment them
 *   build_campaign     — Full retargeting campaign blueprint
 *   lookalike          — Lookalike audience from a source pool
 *   abandoned_journey  — Map funnel drop-offs and recovery strategies
 *   copy_variants      — Warm-audience ad copy for a segment × platform
 *   pixel_strategy     — Complete pixel implementation plan
 *   frequency_optimize — Diagnose and fix frequency / burnout issues
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { sendApprovalRequestEmail } from '@/lib/email'
import type { BrandProfile } from '@/types'
import {
  segmentAudiences,
  buildRetargetingCampaign,
  buildLookalikeAudience,
  analyzeAbandonedJourney,
  writeRetargetingCopy,
  designPixelStrategy,
  optimizeAdFrequency,
} from '@/lib/agents/retargeting'

const ARTIFACT_TYPES = {
  audience_segment: 'retargeting_audiences',
  build_campaign: 'retargeting_campaign',
  lookalike: 'lookalike_audiences',
  abandoned_journey: 'abandoned_journey_map',
  copy_variants: 'retargeting_copy',
  pixel_strategy: 'pixel_strategy',
  frequency_optimize: 'frequency_plan',
} as const

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const body = await req.json() as {
      workspaceId: string
      mode: keyof typeof ARTIFACT_TYPES
      // audience_segment
      context?: string
      // build_campaign
      budget?: number
      platforms?: string[]
      objective?: string
      // lookalike
      sourceType?: 'customers' | 'top_leads' | 'converters' | 'video_viewers'
      sourceSize?: number
      // abandoned_journey
      funnelStages?: Array<{ name: string; dropoffRate: number; usersLost: number }>
      // copy_variants
      segment?: string
      platform?: 'meta' | 'google' | 'linkedin' | 'tiktok'
      previousMessaging?: string
      // pixel_strategy
      pages?: string[]
    }

    const { workspaceId, mode } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!mode || !(mode in ARTIFACT_TYPES)) {
      return NextResponse.json({ error: 'Valid mode required' }, { status: 400 })
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    // Load brand profile — required for all modes
    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'retargeting_supervisor', 'running')`

    let result: unknown
    let artifactTitle: string
    const artifactType = ARTIFACT_TYPES[mode]

    // ── audience_segment ──────────────────────────────────────────────────────
    if (mode === 'audience_segment') {
      // Load real lead data
      const [totalRes, bySourceRes, byStatusRes, byScoreRes] = await Promise.all([
        sql`SELECT COUNT(*) as total, AVG(score) as avg_score FROM leads_captured WHERE workspace_id = ${workspaceId}`,
        sql`SELECT source, COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} GROUP BY source`,
        sql`SELECT status, COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} GROUP BY status`,
        sql`SELECT
              SUM(CASE WHEN score >= 70 THEN 1 ELSE 0 END) as hot,
              SUM(CASE WHEN score >= 40 AND score < 70 THEN 1 ELSE 0 END) as warm,
              SUM(CASE WHEN score >= 1 AND score < 40 THEN 1 ELSE 0 END) as cold,
              SUM(CASE WHEN score = 0 THEN 1 ELSE 0 END) as new_leads
            FROM leads_captured WHERE workspace_id = ${workspaceId}`,
      ])

      const total = Number(totalRes.rows[0]?.total || 0)
      const avgScore = Math.round(Number(totalRes.rows[0]?.avg_score || 0))

      const bySource: Record<string, number> = {}
      for (const row of bySourceRes.rows) {
        bySource[String(row.source || 'unknown')] = Number(row.cnt)
      }

      const byStatus: Record<string, number> = {}
      for (const row of byStatusRes.rows) {
        byStatus[String(row.status || 'unknown')] = Number(row.cnt)
      }

      const scoreRow = byScoreRes.rows[0] || {}
      const byScoreTier = {
        hot: Number(scoreRow.hot || 0),
        warm: Number(scoreRow.warm || 0),
        cold: Number(scoreRow.cold || 0),
        new: Number(scoreRow.new_leads || 0),
      }

      const leadsData = { total, bySource, byStatus, byScoreTier, avgScore }
      const segments = await segmentAudiences(brand, leadsData)

      result = { segments, leadsData, generatedAt: new Date().toISOString() }
      artifactTitle = `Retargeting Audiences — ${brand.business_name}`
    }

    // ── build_campaign ────────────────────────────────────────────────────────
    else if (mode === 'build_campaign') {
      const budget = body.budget || parseInt(brand.monthly_budget?.replace(/\D/g, '') || '1000')
      const platforms = (body.platforms as Array<'meta' | 'google' | 'linkedin' | 'tiktok'>) ||
        (['meta', 'google'] as Array<'meta' | 'google' | 'linkedin' | 'tiktok'>)

      // Load existing audience segments and performance data
      const [existingSegmentsRes, perfRes] = await Promise.all([
        sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'retargeting_audiences' ORDER BY created_at DESC LIMIT 1`,
        sql`SELECT platform, SUM(impressions) as impr, SUM(clicks) as clk, SUM(conversions) as conv, SUM(spend) as spend, AVG(ctr) as ctr, AVG(cpa) as cpa FROM campaign_performance WHERE workspace_id = ${workspaceId} GROUP BY platform`,
      ])

      const existingContent = existingSegmentsRes.rows[0]?.content_json as Record<string, unknown> | undefined
      const existingSegments = existingContent
        ? ((existingContent.segments as unknown[]) || []) as Parameters<typeof buildRetargetingCampaign>[1]
        : []

      // If no saved segments, generate on the fly
      let segments = existingSegments
      if (!segments.length) {
        const totalRes = await sql`SELECT COUNT(*) as total, AVG(score) as avg_score FROM leads_captured WHERE workspace_id = ${workspaceId}`
        const bySourceRes = await sql`SELECT source, COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} GROUP BY source`
        const byStatusRes = await sql`SELECT status, COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} GROUP BY status`
        const byScoreRes = await sql`SELECT
          SUM(CASE WHEN score >= 70 THEN 1 ELSE 0 END) as hot,
          SUM(CASE WHEN score >= 40 AND score < 70 THEN 1 ELSE 0 END) as warm,
          SUM(CASE WHEN score >= 1 AND score < 40 THEN 1 ELSE 0 END) as cold,
          SUM(CASE WHEN score = 0 THEN 1 ELSE 0 END) as new_leads
        FROM leads_captured WHERE workspace_id = ${workspaceId}`

        const bySource: Record<string, number> = {}
        for (const r of bySourceRes.rows) bySource[String(r.source || 'unknown')] = Number(r.cnt)
        const byStatus: Record<string, number> = {}
        for (const r of byStatusRes.rows) byStatus[String(r.status || 'unknown')] = Number(r.cnt)
        const sr = byScoreRes.rows[0] || {}

        segments = await segmentAudiences(brand, {
          total: Number(totalRes.rows[0]?.total || 0),
          bySource,
          byStatus,
          byScoreTier: { hot: Number(sr.hot || 0), warm: Number(sr.warm || 0), cold: Number(sr.cold || 0), new: Number(sr.new_leads || 0) },
          avgScore: Math.round(Number(totalRes.rows[0]?.avg_score || 0)),
        })
      }

      const campaign = await buildRetargetingCampaign(brand, segments, budget, platforms)

      // Attach performance context if available
      const perfSummary = perfRes.rows.map(r => ({
        platform: r.platform,
        impressions: Number(r.impr),
        clicks: Number(r.clk),
        conversions: Number(r.conv),
        spend: Number(r.spend),
        ctr: Number(r.ctr),
        cpa: Number(r.cpa),
      }))

      result = { campaign, performanceContext: perfSummary, budget, platforms }
      artifactTitle = `Retargeting Campaign — ${brand.business_name}`
    }

    // ── lookalike ─────────────────────────────────────────────────────────────
    else if (mode === 'lookalike') {
      const sourceType = body.sourceType || 'top_leads'
      let sourceSize = body.sourceSize

      if (!sourceSize) {
        // Query real source size
        if (sourceType === 'top_leads') {
          const r = await sql`SELECT COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} AND score >= 70`
          sourceSize = Number(r.rows[0]?.cnt || 0)
        } else if (sourceType === 'customers') {
          const r = await sql`SELECT COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} AND status = 'customer'`
          sourceSize = Number(r.rows[0]?.cnt || 0)
        } else if (sourceType === 'converters') {
          const r = await sql`SELECT COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} AND status IN ('customer', 'qualified', 'proposal')`
          sourceSize = Number(r.rows[0]?.cnt || 0)
        } else {
          const r = await sql`SELECT COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId}`
          sourceSize = Math.round(Number(r.rows[0]?.cnt || 0) * 0.3) // estimate 30% watched video
        }
      }

      const lookalike = await buildLookalikeAudience(brand, sourceType as 'customers' | 'top_leads' | 'converters' | 'video_viewers', sourceSize)
      result = { lookalike, sourceType, sourceSize }
      artifactTitle = `Lookalike Audience (${sourceType}) — ${brand.business_name}`
    }

    // ── abandoned_journey ─────────────────────────────────────────────────────
    else if (mode === 'abandoned_journey') {
      const funnelData = body.funnelStages
      const journey = await analyzeAbandonedJourney(brand, funnelData)
      result = { journey, providedFunnelData: !!funnelData }
      artifactTitle = `Abandoned Journey Map — ${brand.business_name}`
    }

    // ── copy_variants ─────────────────────────────────────────────────────────
    else if (mode === 'copy_variants') {
      if (!body.segment) return NextResponse.json({ error: 'segment required' }, { status: 400 })
      if (!body.platform) return NextResponse.json({ error: 'platform required' }, { status: 400 })

      const copy = await writeRetargetingCopy(
        brand,
        body.segment,
        body.platform,
        body.previousMessaging
      )
      result = { copy, segment: body.segment, platform: body.platform }
      artifactTitle = `Retargeting Copy (${body.segment} × ${body.platform}) — ${brand.business_name}`
    }

    // ── pixel_strategy ────────────────────────────────────────────────────────
    else if (mode === 'pixel_strategy') {
      const platforms = body.platforms || (Array.isArray(brand.channels) ? brand.channels : ['meta', 'google'])
      const pixelPlatforms = platforms.map((p: string) => {
        const map: Record<string, string> = { instagram: 'meta', facebook: 'meta', linkedin: 'linkedin', google: 'google', tiktok: 'tiktok', youtube: 'google' }
        return map[p.toLowerCase()] || p.toLowerCase()
      }).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)

      const strategy = await designPixelStrategy(brand, pixelPlatforms, body.pages)
      result = { strategy, platforms: pixelPlatforms }
      artifactTitle = `Pixel Strategy — ${brand.business_name}`
    }

    // ── frequency_optimize ────────────────────────────────────────────────────
    else if (mode === 'frequency_optimize') {
      // Load real campaign performance data
      const perfRes = await sql`
        SELECT platform, SUM(impressions) as impr, SUM(clicks) as clk, SUM(conversions) as conv,
               SUM(spend) as spend, AVG(ctr) as ctr, AVG(cpa) as cpa
        FROM campaign_performance WHERE workspace_id = ${workspaceId}
        GROUP BY platform
      `

      const performanceData = perfRes.rows.map(r => ({
        platform: String(r.platform),
        impressions: Number(r.impr || 0),
        clicks: Number(r.clk || 0),
        conversions: Number(r.conv || 0),
        spend: Number(r.spend || 0),
        ctr: Number(r.ctr || 0),
        cpa: Number(r.cpa || 0),
      }))

      // Extract or estimate current frequency from context
      let currentFrequency: Record<string, number> = {}
      if (body.context) {
        try { currentFrequency = JSON.parse(body.context) } catch { /* ignore */ }
      }
      if (!Object.keys(currentFrequency).length) {
        // Estimate frequency from performance data: impressions / (spend / avg_cpm)
        for (const d of performanceData) {
          const estimatedCpm = d.platform === 'meta' ? 12 : d.platform === 'google' ? 5 : 18
          const estimatedReach = d.spend / (estimatedCpm / 1000)
          currentFrequency[d.platform] = estimatedReach > 0 ? Math.round(d.impressions / estimatedReach) : 3
        }
      }

      const optimization = await optimizeAdFrequency(brand, currentFrequency, performanceData)
      result = { optimization, currentFrequency, performanceData }
      artifactTitle = `Frequency Optimization Plan — ${brand.business_name}`
    }

    else {
      return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })
    }

    // ── Save artifact + approval ──────────────────────────────────────────────
    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(result)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, ${artifactType}, ${artifactTitle}, ${JSON.stringify(result)})`

    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType,
        artifactTitle,
      })
    }

    return NextResponse.json({ ok: true, artifactId, mode, result })
  } catch (error) {
    if (runId) {
      await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`.catch(() => {})
    }
    console.error('Retargeting supervisor error:', error)
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
      AND a.type IN ('retargeting_audiences', 'retargeting_campaign', 'lookalike_audiences',
                     'abandoned_journey_map', 'retargeting_copy', 'pixel_strategy', 'frequency_plan')
    ORDER BY a.created_at DESC
    LIMIT 50
  `
  return NextResponse.json(result.rows)
}
