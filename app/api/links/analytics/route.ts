/**
 * GET /api/links/analytics?workspaceId=…[&days=7][&channel=linkedin]
 *
 * Powers the dashboard's "Total Clicks" stat card + the 7-day mini line
 * chart. Returns:
 *
 *   {
 *     totalClicks: 1240,
 *     dailySeries: [
 *       { date: '2026-05-21', clicks: 142 },
 *       { date: '2026-05-22', clicks: 198 },
 *       …  // exactly `days` entries, oldest first, gaps zero-filled
 *     ],
 *     topLinks: [
 *       { slug: 'a7Z3xQ', original_url: '…', channel: 'linkedin',
 *         click_count: 412 },
 *       …  // top 5 by click_count
 *     ],
 *     byChannel: { linkedin: 720, twitter: 420, wordpress: 100 }
 *   }
 *
 * The endpoint aggregates in JS (not SQL) for dialect portability — both
 * SQLite and Postgres just return raw rows, JS bucketises by date.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface ClickRow {
  slug: string
  channel: string | null
  clicked_at: string
}

interface TopLinkRow {
  slug: string
  original_url: string
  channel: string | null
  click_count: number
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const days = Math.max(1, Math.min(90, Number(searchParams.get('days') || '7')))
  const channelFilter = searchParams.get('channel')

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const sinceIso = since.toISOString()

  // 1. Fetch raw click rows within window (capped at 10k for safety).
  const clicksRes = channelFilter
    ? await sql`
        SELECT slug, channel, clicked_at FROM link_clicks
        WHERE workspace_id = ${workspaceId}
          AND clicked_at >= ${sinceIso}
          AND channel = ${channelFilter}
        ORDER BY clicked_at ASC LIMIT 10000
      `
    : await sql`
        SELECT slug, channel, clicked_at FROM link_clicks
        WHERE workspace_id = ${workspaceId}
          AND clicked_at >= ${sinceIso}
        ORDER BY clicked_at ASC LIMIT 10000
      `
  const clicks = clicksRes.rows as unknown as ClickRow[]

  // 2. Total click count (use denormalised counter for accuracy — it's not
  // capped by the 10k window so this stays correct for huge volumes).
  const totalsRes = channelFilter
    ? await sql`
        SELECT COALESCE(SUM(click_count), 0) AS total
        FROM tracked_links
        WHERE workspace_id = ${workspaceId} AND channel = ${channelFilter}
      `
    : await sql`
        SELECT COALESCE(SUM(click_count), 0) AS total
        FROM tracked_links
        WHERE workspace_id = ${workspaceId}
      `
  const totalClicks = Number((totalsRes.rows[0] as { total?: number | string } | undefined)?.total || 0)

  // 3. Bucket the windowed clicks by date (UTC, YYYY-MM-DD).
  const buckets = new Map<string, number>()
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    buckets.set(key, 0)
  }
  for (const click of clicks) {
    const key = String(click.clicked_at).slice(0, 10)
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) || 0) + 1)
    }
  }
  const dailySeries = Array.from(buckets.entries()).map(([date, count]) => ({
    date, clicks: count,
  }))

  // 4. Top links by all-time click_count (small, fast — denormalised counter).
  const topRes = channelFilter
    ? await sql`
        SELECT slug, original_url, channel, click_count
        FROM tracked_links
        WHERE workspace_id = ${workspaceId} AND channel = ${channelFilter}
          AND click_count > 0
        ORDER BY click_count DESC LIMIT 5
      `
    : await sql`
        SELECT slug, original_url, channel, click_count
        FROM tracked_links
        WHERE workspace_id = ${workspaceId} AND click_count > 0
        ORDER BY click_count DESC LIMIT 5
      `
  const topLinks = topRes.rows as unknown as TopLinkRow[]

  // 5. Channel breakdown from the windowed clicks.
  const byChannel: Record<string, number> = {}
  for (const c of clicks) {
    const ch = c.channel || 'unknown'
    byChannel[ch] = (byChannel[ch] || 0) + 1
  }

  return NextResponse.json({
    totalClicks,
    windowDays: days,
    dailySeries,
    topLinks,
    byChannel,
  })
}
