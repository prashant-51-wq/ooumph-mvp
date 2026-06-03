/**
 * GET /api/cron/inject-winners
 *
 * Performance materialization worker — runs every 6 hours.
 * Scans the three analytical tables for each workspace and distils the
 * top performers into a single `brand_memory` row classified as
 * `content_type = 'recent_winners'`. That row is then surfaced by
 * `query_brand_memory` inside agent prompts so future content mirrors
 * what actually resonated, closing the learning loop.
 *
 * Sources aggregated per workspace:
 *   post_metrics    — top 3 social posts by (likes + comments + shares + clicks)
 *   leads_captured  — top 3 converting lead sources by COUNT(*) DESC
 *   email_campaigns — top 3 subjects by CTR (click_count / NULLIF(sent_count,0)) DESC
 *
 * Idempotency: UPSERTs into brand_memory on the unique
 *   (workspace_id, content_type = 'recent_winners') key.
 *   Each run overwrites the previous snapshot so the agent always sees
 *   fresh data without accumulating stale duplicates.
 *
 * Empty-state sentinel: if a workspace has zero analytical data in all
 * three sources, the row is still written with a placeholder message so
 * the agent knows the system is healthy but data hasn't flowed yet.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}  OR
 *       x-internal-secret: ${ADMIN_SECRET}
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 300

function authOk(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET || ''
  const adminSecret = process.env.ADMIN_SECRET || ''
  const isDev = process.env.NODE_ENV !== 'production'

  const bearer = req.headers.get('authorization') || ''
  if (cronSecret && bearer === `Bearer ${cronSecret}`) return true

  const internalSecret = req.headers.get('x-internal-secret') || ''
  if (adminSecret && internalSecret === adminSecret) return true

  // Dev bypass only when neither secret is configured AND not in production.
  if (!cronSecret && !adminSecret && isDev) return true

  return false
}

interface WorkspaceRow { id: string }

interface PostMetricsRow {
  artifact_id: string
  platform: string
  title: string | null
  type: string | null
  total_engagement: number
  impressions: number
  clicks: number
  likes: number
  comments: number
  shares: number
}

interface LeadSourceRow {
  source: string | null
  lead_count: number
}

interface EmailCampaignRow {
  id: string
  subject: string | null
  sent_count: number
  click_count: number
  open_count: number
  ctr: number
}

interface WinnersPayload {
  generatedAt: string
  topSocialPosts: {
    artifactId: string
    title: string
    type: string
    platform: string
    engagement: number
    impressions: number
    engagementRate: string
  }[]
  topLeadSources: {
    source: string
    leadCount: number
  }[]
  topEmailSubjects: {
    subject: string
    ctr: string
    openCount: number
    sentCount: number
  }[]
  summary: string
}

function buildWinnersSummary(payload: WinnersPayload): string {
  const lines: string[] = []

  lines.push(`Performance snapshot (${payload.generatedAt.slice(0, 10)}):`)

  if (payload.topSocialPosts.length > 0) {
    lines.push('\nTop social content by engagement:')
    for (const p of payload.topSocialPosts) {
      lines.push(
        `  • [${p.platform}] "${p.title}" — ${p.engagement.toLocaleString()} engagements (${p.engagementRate}% rate, ${p.impressions.toLocaleString()} impressions)`,
      )
    }
  }

  if (payload.topLeadSources.length > 0) {
    lines.push('\nHighest converting lead sources:')
    for (const s of payload.topLeadSources) {
      lines.push(`  • ${s.source}: ${s.leadCount.toLocaleString()} leads`)
    }
  }

  if (payload.topEmailSubjects.length > 0) {
    lines.push('\nTop performing email subjects by click-through rate:')
    for (const e of payload.topEmailSubjects) {
      lines.push(
        `  • "${e.subject}" — ${e.ctr}% CTR (${e.openCount.toLocaleString()} opens from ${e.sentCount.toLocaleString()} sent)`,
      )
    }
  }

  return lines.join('\n')
}

const EMPTY_STATE_CONTENT =
  'No performance signals captured yet. Send campaigns to activate background optimization engine.'

export async function GET(req: NextRequest) {
  if (!authOk(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workspacesRes = await sql`
    SELECT DISTINCT id FROM workspaces ORDER BY id
  `
  const workspaces = workspacesRes.rows as unknown as WorkspaceRow[]

  const results: { workspaceId: string; status: string; signalsFound: number }[] = []

  for (const ws of workspaces) {
    const workspaceId = ws.id

    try {
      // ── 1. Top 3 social posts by engagement (last 90 days) ────────────────
      const postsRes = await sql`
        SELECT
          pm.artifact_id,
          pm.platform,
          a.title,
          a.type,
          SUM(pm.likes + pm.comments + pm.shares + pm.clicks)::int  AS total_engagement,
          SUM(pm.impressions)::int                                    AS impressions,
          SUM(pm.clicks)::int                                         AS clicks,
          SUM(pm.likes)::int                                          AS likes,
          SUM(pm.comments)::int                                       AS comments,
          SUM(pm.shares)::int                                         AS shares
        FROM post_metrics pm
        LEFT JOIN artifacts a ON a.id = pm.artifact_id
        WHERE pm.workspace_id = ${workspaceId}
          AND pm.created_at >= NOW() - INTERVAL '90 days'
        GROUP BY pm.artifact_id, pm.platform, a.title, a.type
        ORDER BY total_engagement DESC
        LIMIT 3
      `
      const topPosts = (postsRes.rows as unknown as PostMetricsRow[]).filter(
        p => Number(p.total_engagement) > 0,
      )

      // ── 2. Top 3 lead sources ──────────────────────────────────────────────
      const sourcesRes = await sql`
        SELECT source, COUNT(*)::int AS lead_count
        FROM leads_captured
        WHERE workspace_id = ${workspaceId}
          AND created_at >= NOW() - INTERVAL '90 days'
          AND source IS NOT NULL AND source <> ''
        GROUP BY source
        ORDER BY lead_count DESC
        LIMIT 3
      `
      const topSources = sourcesRes.rows as unknown as LeadSourceRow[]

      // ── 3. Top 3 email subjects by CTR ────────────────────────────────────
      const emailsRes = await sql`
        SELECT
          id,
          subject,
          sent_count,
          click_count,
          open_count,
          ROUND(
            (click_count::numeric / NULLIF(sent_count, 0)) * 100,
            2
          )::float AS ctr
        FROM email_campaigns
        WHERE workspace_id = ${workspaceId}
          AND status = 'sent'
          AND sent_count > 0
          AND created_at >= NOW() - INTERVAL '90 days'
        ORDER BY ctr DESC NULLS LAST
        LIMIT 3
      `
      const topEmails = (emailsRes.rows as unknown as EmailCampaignRow[]).filter(
        e => Number(e.ctr || 0) > 0,
      )

      const signalsFound = topPosts.length + topSources.length + topEmails.length
      const generatedAt = new Date().toISOString()

      let content: string
      let performanceScore: number
      let metadataJson: WinnersPayload | { empty: true; generatedAt: string }

      if (signalsFound === 0) {
        content = EMPTY_STATE_CONTENT
        performanceScore = 0
        metadataJson = { empty: true, generatedAt }
      } else {
        const payload: WinnersPayload = {
          generatedAt,
          topSocialPosts: topPosts.map(p => ({
            artifactId: p.artifact_id,
            title: p.title || `Post ${p.artifact_id.slice(0, 8)}`,
            type: p.type || 'post',
            platform: p.platform,
            engagement: Number(p.total_engagement),
            impressions: Number(p.impressions),
            engagementRate:
              Number(p.impressions) > 0
                ? ((Number(p.total_engagement) / Number(p.impressions)) * 100).toFixed(2)
                : '0.00',
          })),
          topLeadSources: topSources.map(s => ({
            source: s.source || 'unknown',
            leadCount: Number(s.lead_count),
          })),
          topEmailSubjects: topEmails.map(e => ({
            subject: e.subject || '(no subject)',
            ctr: Number(e.ctr || 0).toFixed(2),
            openCount: Number(e.open_count || 0),
            sentCount: Number(e.sent_count || 0),
          })),
          summary: '',
        }
        payload.summary = buildWinnersSummary(payload)
        content = payload.summary
        performanceScore = Math.min(
          100,
          Math.round(
            (topPosts.length > 0 ? 33 : 0) +
            (topSources.length > 0 ? 33 : 0) +
            (topEmails.length > 0 ? 34 : 0),
          ),
        )
        metadataJson = payload
      }

      // ── 4. Idempotent UPSERT — one recent_winners row per workspace ────────
      // Uses a SELECT + conditional INSERT/UPDATE to work across Postgres and
      // SQLite (UPSERT ON CONFLICT syntax differs between dialects).
      const existingRes = await sql`
        SELECT id FROM brand_memory
        WHERE workspace_id = ${workspaceId}
          AND content_type = 'recent_winners'
        LIMIT 1
      `
      const existingId = (existingRes.rows[0] as { id?: string } | undefined)?.id

      if (existingId) {
        await sql`
          UPDATE brand_memory
          SET content          = ${content},
              performance_score = ${performanceScore},
              metadata_json    = ${JSON.stringify(metadataJson)},
              created_at       = CURRENT_TIMESTAMP
          WHERE id = ${existingId}
        `
      } else {
        await sql`
          INSERT INTO brand_memory
            (id, workspace_id, content, content_type, platform, performance_score, metadata_json, created_at)
          VALUES (
            ${newId()}, ${workspaceId}, ${content},
            'recent_winners', 'all', ${performanceScore},
            ${JSON.stringify(metadataJson)}, CURRENT_TIMESTAMP
          )
        `
      }

      results.push({ workspaceId, status: signalsFound === 0 ? 'sentinel' : 'updated', signalsFound })
    } catch (err) {
      console.error(`[inject-winners] workspace ${workspaceId} failed:`, err)
      results.push({ workspaceId, status: 'error', signalsFound: 0 })
    }
  }

  const processed = results.filter(r => r.status !== 'error').length
  const errored = results.filter(r => r.status === 'error').length

  return NextResponse.json({
    ok: true,
    processedWorkspaces: processed,
    erroredWorkspaces: errored,
    results,
    generatedAt: new Date().toISOString(),
  })
}
