/**
 * /api/analytics/posts — Sprint 6G
 *
 * Per-post engagement analytics. Replaces the previous "Top Recent
 * Content" panel (which sorted by recency only) with true top-by-
 * engagement ranking.
 *
 * Source of truth:
 *   - artifacts        — every piece of content (the thing we ranked)
 *   - publish_log      — when/where it went live (one row per platform)
 *   - post_metrics     — organic engagement (impressions/clicks/likes/
 *                        comments/shares) per artifact, per platform.
 *                        Populated by future platform sync workers.
 *   - campaign_performance — paid engagement (for boosted/promoted posts)
 *                        joined when artifact_id matches campaign_artifact_id.
 *
 * GET ?workspaceId=…&range=7d|30d|90d|12mo&sortBy=engagement|reach|recency&limit=10
 *
 * Response:
 *   {
 *     range, sortBy, limit, generatedAt,
 *     posts: Array<{
 *       artifactId, title, type, createdAt,
 *       publishedPlatforms: string[],
 *       publishedAt: string | null,    // earliest publish time across platforms
 *       impressions, clicks, likes, comments, shares,
 *       engagement,                     // likes + comments + shares
 *       engagementRate,                 // engagement / impressions × 100
 *       hasMetrics: boolean,            // false = no metrics synced yet
 *       paidMetrics: { spend, conversions, revenue } | null,
 *     }>,
 *     totals: { posts: number, withMetrics: number, withoutMetrics: number },
 *   }
 *
 * Honesty contract: if a post has no rows in post_metrics or
 * campaign_performance, we still return it but set hasMetrics=false so
 * the UI can render "Metrics will sync once your platform integrations
 * are connected" — never fabricate zeros as "real" numbers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export const runtime = 'nodejs'

function rangeToDays(range: string | null): number {
  switch (range) {
    case '7d': return 7
    case '30d': return 30
    case '90d': return 90
    case '12mo': return 365
    default: return 30
  }
}

interface ArtifactRow {
  id: string; title: string | null; type: string; created_at: string
}
interface PublishRow {
  artifact_id: string; platform: string; published_at: string
}
interface MetricsRow {
  artifact_id: string; platform: string;
  impressions: number; clicks: number; likes: number;
  comments: number; shares: number;
}
interface PaidRow {
  campaign_artifact_id: string;
  spend: number; conversions: number; revenue: number
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const range = searchParams.get('range')
  const sortBy = (searchParams.get('sortBy') || 'engagement') as 'engagement' | 'reach' | 'recency'
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || '10'), 1), 50)

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  }

  const days = rangeToDays(range)
  const sinceISO = new Date(Date.now() - days * 86400000).toISOString()
  const sinceDate = sinceISO.slice(0, 10)

  try {
    // 1. Artifacts in the window — the universe of posts we'll rank.
    //    Limited to publishable content types so we don't surface raw
    //    documents/uploads. Window matches the analytics range.
    const artifactsRes = await sql`
      SELECT id, title, type, created_at
      FROM artifacts
      WHERE workspace_id = ${workspaceId}
        AND created_at >= ${sinceISO}
        AND type IN ('linkedInPost', 'visual_post', 'tweet', 'instagramPost', 'emailDraft', 'blogPost', 'shortVideo')
      ORDER BY created_at DESC LIMIT 200
    `
    const artifacts = artifactsRes.rows as unknown as ArtifactRow[]
    if (artifacts.length === 0) {
      return NextResponse.json({
        range: range || '30d',
        sortBy,
        limit,
        generatedAt: new Date().toISOString(),
        posts: [],
        totals: { posts: 0, withMetrics: 0, withoutMetrics: 0 },
      })
    }

    const artifactIds = artifacts.map(a => a.id)

    // 2. Publish events for those artifacts — collect platforms + earliest
    //    publish time per artifact.
    const publishRes = await sql`
      SELECT artifact_id, platform, published_at
      FROM publish_log
      WHERE workspace_id = ${workspaceId}
        AND artifact_id = ANY(${artifactIds})
        AND status = 'published'
    `
    const publishes = publishRes.rows as unknown as PublishRow[]
    const publishesByArtifact = new Map<string, PublishRow[]>()
    for (const p of publishes) {
      const arr = publishesByArtifact.get(p.artifact_id) || []
      arr.push(p)
      publishesByArtifact.set(p.artifact_id, arr)
    }

    // 3. Organic engagement metrics — summed across platforms per artifact.
    //    post_metrics rows are populated by platform-specific sync workers
    //    (LinkedIn Insights, Twitter analytics, Meta Insights). On a fresh
    //    workspace this will be empty — we report hasMetrics=false in that
    //    case rather than fabricating zeros.
    const metricsRes = await sql`
      SELECT artifact_id, platform, impressions, clicks, likes, comments, shares
      FROM post_metrics
      WHERE workspace_id = ${workspaceId}
        AND artifact_id = ANY(${artifactIds})
    `
    const metrics = metricsRes.rows as unknown as MetricsRow[]
    const metricsByArtifact = new Map<string, MetricsRow[]>()
    for (const m of metrics) {
      const arr = metricsByArtifact.get(m.artifact_id) || []
      arr.push(m)
      metricsByArtifact.set(m.artifact_id, arr)
    }

    // 4. Paid metrics — for posts that were boosted as a campaign.
    //    campaign_performance.campaign_artifact_id == artifacts.id when the
    //    artifact IS the campaign creative.
    const paidRes = await sql`
      SELECT campaign_artifact_id,
             SUM(spend)::numeric as spend,
             SUM(conversions)::int as conversions,
             SUM(revenue)::numeric as revenue
      FROM campaign_performance
      WHERE workspace_id = ${workspaceId}
        AND campaign_artifact_id = ANY(${artifactIds})
        AND date >= ${sinceDate}
      GROUP BY campaign_artifact_id
    `
    const paidRows = paidRes.rows as unknown as PaidRow[]
    const paidByArtifact = new Map<string, PaidRow>()
    for (const p of paidRows) {
      paidByArtifact.set(p.campaign_artifact_id, p)
    }

    // 5. Assemble per-post records.
    interface Post {
      artifactId: string; title: string; type: string; createdAt: string
      publishedPlatforms: string[]; publishedAt: string | null
      impressions: number; clicks: number; likes: number
      comments: number; shares: number
      engagement: number; engagementRate: number
      hasMetrics: boolean
      paidMetrics: { spend: number; conversions: number; revenue: number } | null
    }
    const posts: Post[] = artifacts.map(a => {
      const ps = publishesByArtifact.get(a.id) || []
      const ms = metricsByArtifact.get(a.id) || []
      const paid = paidByArtifact.get(a.id) || null

      // Sum metrics across all platforms for this artifact.
      const sum = ms.reduce((acc, m) => {
        acc.impressions += Number(m.impressions || 0)
        acc.clicks += Number(m.clicks || 0)
        acc.likes += Number(m.likes || 0)
        acc.comments += Number(m.comments || 0)
        acc.shares += Number(m.shares || 0)
        return acc
      }, { impressions: 0, clicks: 0, likes: 0, comments: 0, shares: 0 })

      const engagement = sum.likes + sum.comments + sum.shares
      const engagementRate = sum.impressions > 0
        ? Number(((engagement / sum.impressions) * 100).toFixed(2))
        : 0

      // Earliest publish time across platforms — that's "when this post
      // went live". If never published, publishedAt is null and platforms
      // is empty (drafts still surface for visibility).
      const publishedAt = ps.length > 0
        ? ps.map(p => p.published_at).sort()[0]
        : null
      const publishedPlatforms = Array.from(new Set(ps.map(p => p.platform)))

      return {
        artifactId: a.id,
        title: a.title || `Untitled (${a.id.slice(0, 8)})`,
        type: a.type,
        createdAt: a.created_at,
        publishedPlatforms,
        publishedAt,
        ...sum,
        engagement,
        engagementRate,
        hasMetrics: ms.length > 0,
        paidMetrics: paid ? {
          spend: Number(paid.spend || 0),
          conversions: Number(paid.conversions || 0),
          revenue: Number(paid.revenue || 0),
        } : null,
      }
    })

    // 6. Sort. Posts with no metrics rank below posts with metrics in
    //    engagement/reach modes — otherwise zero-metric posts would tie
    //    at the top alphabetically.
    posts.sort((a, b) => {
      if (sortBy === 'recency') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
      // engagement | reach: metrics-having posts always rank above no-metrics
      if (a.hasMetrics !== b.hasMetrics) return a.hasMetrics ? -1 : 1
      if (sortBy === 'reach') return b.impressions - a.impressions
      return b.engagement - a.engagement
    })

    const ranked = posts.slice(0, limit)
    const withMetrics = posts.filter(p => p.hasMetrics).length

    return NextResponse.json({
      range: range || '30d',
      sortBy,
      limit,
      generatedAt: new Date().toISOString(),
      posts: ranked,
      totals: {
        posts: posts.length,
        withMetrics,
        withoutMetrics: posts.length - withMetrics,
      },
    })
  } catch (err) {
    console.error('analytics/posts error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
