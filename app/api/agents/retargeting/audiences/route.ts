/**
 * Retargeting Worker: Audience Segmentation Engine
 * POST { workspaceId, includeLeadData?: boolean }
 * GET  ?workspaceId=xxx
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { sendApprovalRequestEmail } from '@/lib/email'
import type { BrandProfile } from '@/types'
import { segmentAudiences } from '@/lib/agents/retargeting'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      includeLeadData?: boolean
    }
    const { workspaceId, includeLeadData = true } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // ── Deep lead data aggregation ──────────────────────────────────────────
    const [totalRes, bySourceRes, byStatusRes, byScoreRes, topSourcesRes, publishedRes, perfRes] = await Promise.all([
      sql`SELECT COUNT(*) as total, AVG(score) as avg_score, MAX(score) as max_score FROM leads_captured WHERE workspace_id = ${workspaceId}`,
      sql`SELECT source, COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} GROUP BY source ORDER BY cnt DESC`,
      sql`SELECT status, COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} GROUP BY status ORDER BY cnt DESC`,
      sql`SELECT
            SUM(CASE WHEN score >= 70 THEN 1 ELSE 0 END) as hot,
            SUM(CASE WHEN score >= 40 AND score < 70 THEN 1 ELSE 0 END) as warm,
            SUM(CASE WHEN score >= 1 AND score < 40 THEN 1 ELSE 0 END) as cold,
            SUM(CASE WHEN score = 0 THEN 1 ELSE 0 END) as new_leads
          FROM leads_captured WHERE workspace_id = ${workspaceId}`,
      sql`SELECT source, COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} AND created_at >= datetime('now', '-30 days') GROUP BY source ORDER BY cnt DESC LIMIT 5`,
      sql`SELECT DISTINCT platform FROM published_content WHERE workspace_id = ${workspaceId}`,
      sql`SELECT platform, AVG(ctr) as avg_ctr, AVG(cpa) as avg_cpa, SUM(conversions) as total_conv FROM campaign_performance WHERE workspace_id = ${workspaceId} GROUP BY platform`,
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

    const sr = byScoreRes.rows[0] || {}
    const byScoreTier = {
      hot: Number(sr.hot || 0),
      warm: Number(sr.warm || 0),
      cold: Number(sr.cold || 0),
      new: Number(sr.new_leads || 0),
    }

    const recentSources = topSourcesRes.rows.reduce((acc: Record<string, number>, r) => {
      acc[String(r.source || 'unknown')] = Number(r.cnt)
      return acc
    }, {})

    const publishedPlatforms = publishedRes.rows.map(r => String(r.platform))
    const platformPerformance = perfRes.rows.map(r => ({
      platform: String(r.platform),
      avgCtr: Number(r.avg_ctr || 0),
      avgCpa: Number(r.avg_cpa || 0),
      totalConversions: Number(r.total_conv || 0),
    }))

    const leadsData = { total, bySource, byStatus, byScoreTier, avgScore }

    // ── Generate segments ─────────────────────────────────────────────────────
    const segments = await segmentAudiences(brand, leadsData)

    // ── Build per-platform implementation instructions ────────────────────────
    const platformInstructions: Record<string, string[]> = {}
    const activePlatforms = publishedPlatforms.length
      ? publishedPlatforms
      : (Array.isArray(brand.channels) ? brand.channels : ['meta', 'google'])

    for (const p of activePlatforms) {
      const normalizedPlatform = p.toLowerCase().replace(/facebook|instagram/, 'meta')
      if (!platformInstructions[normalizedPlatform]) {
        platformInstructions[normalizedPlatform] = segments
          .filter(s => s.platforms.map((pl: string) => pl.toLowerCase()).includes(normalizedPlatform))
          .map(s => `${s.name}: ${s.messagingAngle} (${s.size}) — ${s.retargetingGoal}`)
      }
    }

    const result = {
      segments,
      leadsData,
      recentSources,
      publishedPlatforms,
      platformPerformance,
      platformInstructions,
      totalSegments: segments.length,
      prioritySegments: segments.filter((s: { urgency: string }) => s.urgency === 'high').map((s: { name: string }) => s.name),
      generatedAt: new Date().toISOString(),
    }

    // ── Save artifact ─────────────────────────────────────────────────────────
    const runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'retargeting_audiences', 'completed')`

    const artifactId = newId()
    const title = `Retargeting Audiences — ${brand.business_name}`
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'retargeting_audiences', ${title}, ${JSON.stringify(result)})`

    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'retargeting_audiences',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ ok: true, artifactId, ...result })
  } catch (error) {
    console.error('Audience segmentation error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'retargeting_audiences'
    ORDER BY a.created_at DESC
    LIMIT 10
  `
  return NextResponse.json(result.rows)
}
