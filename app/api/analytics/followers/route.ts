/**
 * /api/analytics/followers — Sprint 17D (audit P1 #14)
 *
 * Surfaces the follower trendline captured by /api/cron/follower-sync
 * (which writes to post_metrics rows tagged with the sentinel
 * artifact_id = '__followers__'). Until this endpoint shipped, the cron
 * was capturing data that NO chart consumed — invisible to the user.
 *
 * Source of truth: post_metrics WHERE artifact_id='__followers__'.
 * Grouped by date (last_synced_at::date) + platform so the dashboard
 * can render one line per connected social platform.
 *
 * GET ?workspaceId=…&days=30
 *
 * Response:
 *   {
 *     workspaceId, days, generatedAt,
 *     platforms: string[],                 // platforms that have ANY data in window
 *     series: Array<{
 *       date: string,                      // YYYY-MM-DD (UTC)
 *       platform: string,
 *       total_followers: number | null,    // null on failed fetches
 *       delta: number,                     // followers_delta — same row
 *     }>,
 *     summary: Array<{
 *       platform: string,
 *       current: number | null,            // most recent total_followers
 *       periodStart: number | null,        // total_followers at oldest row in window
 *       delta: number | null,              // current - periodStart
 *       percentChange: number | null,      // delta / periodStart × 100
 *       lastSyncedAt: string | null,
 *     }>,
 *     hasData: boolean,
 *   }
 *
 * Honesty contract: when no rows exist for the workspace we return
 * { hasData: false, platforms: [], series: [], summary: [] } and the
 * UI renders an honest empty state — never zeros pretending to be a flatline.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export const runtime = 'nodejs'

const FOLLOWERS_SENTINEL_ARTIFACT_ID = '__followers__'

interface MetricRow {
  date: string
  platform: string
  total_followers: number | null
  delta: number
  last_synced_at: string
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspaceId')
  const daysRaw = Number(url.searchParams.get('days') || '30')
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? Math.floor(daysRaw) : 30

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  }

  try {
    // One row per (date, platform) — pick the LAST synced point in the day
    // to represent that day's snapshot. last_synced_at column is the
    // cron-write timestamp from /api/cron/follower-sync.
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const res = await sql`
      SELECT
        TO_CHAR(last_synced_at::date, 'YYYY-MM-DD') AS date,
        platform,
        total_followers,
        followers_delta AS delta,
        last_synced_at
      FROM post_metrics
      WHERE workspace_id = ${workspaceId}
        AND artifact_id = ${FOLLOWERS_SENTINEL_ARTIFACT_ID}
        AND last_synced_at >= ${sinceIso}
      ORDER BY last_synced_at ASC
    `

    const rawRows = res.rows as unknown as Array<{
      date: string
      platform: string
      total_followers: number | null
      delta: number | null
      last_synced_at: string
    }>

    // Collapse to one row per (date, platform) — keep the LAST one of the day.
    const byKey = new Map<string, MetricRow>()
    for (const r of rawRows) {
      const key = `${r.date}::${r.platform}`
      byKey.set(key, {
        date: r.date,
        platform: r.platform,
        total_followers: typeof r.total_followers === 'number' ? r.total_followers : null,
        delta: Number(r.delta || 0),
        last_synced_at: r.last_synced_at,
      })
    }
    const series = Array.from(byKey.values()).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.platform.localeCompare(b.platform),
    )

    const platforms = Array.from(new Set(series.map(s => s.platform))).sort()

    // Build per-platform summary: current, period-start, delta, %.
    const summary = platforms.map(p => {
      const rowsForPlatform = series
        .filter(s => s.platform === p && s.total_followers !== null)
      if (rowsForPlatform.length === 0) {
        return {
          platform: p,
          current: null as number | null,
          periodStart: null as number | null,
          delta: null as number | null,
          percentChange: null as number | null,
          lastSyncedAt: series.filter(s => s.platform === p).slice(-1)[0]?.last_synced_at || null,
        }
      }
      const first = rowsForPlatform[0].total_followers as number
      const last = rowsForPlatform[rowsForPlatform.length - 1]
      const current = last.total_followers as number
      const delta = current - first
      const percent = first > 0 ? Number(((delta / first) * 100).toFixed(2)) : null
      return {
        platform: p,
        current,
        periodStart: first,
        delta,
        percentChange: percent,
        lastSyncedAt: last.last_synced_at,
      }
    })

    return NextResponse.json({
      workspaceId,
      days,
      generatedAt: new Date().toISOString(),
      platforms,
      series,
      summary,
      hasData: series.length > 0,
    })
  } catch (err) {
    console.error('[analytics/followers] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
