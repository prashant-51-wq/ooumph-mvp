/**
 * Cron: /api/cron/follower-sync — runs 4× daily (00/06/12/18 UTC).
 *
 * Sprint 16G P0 #8 — closes the social-follower visibility gap. For each
 * workspace that has connected OAuth tokens, fetch the current follower count
 * per platform and INSERT a fresh row into post_metrics with:
 *   - artifact_id = '__followers__' (sentinel — column is NOT NULL)
 *   - total_followers = current count
 *   - followers_delta = current - previous (or current on first run)
 *
 * Sprint 17D (audit P1 #15 + #16):
 *   - Real follower fetches for Twitter/X, Meta page (fan_count), and
 *     Instagram (Graph API) — previously these returned status='skipped'
 *     silently which gave us under 25% coverage.
 *   - Idempotency: skip the INSERT when the most-recent row for
 *     (workspace, platform) shows an unchanged total_followers within the
 *     last 24h. Just bump last_synced_at instead. For null fetches (dead
 *     token), skip entirely if the previous row was also null within 7d
 *     — avoids accumulating dead-null rows on dead tokens.
 *
 * Resilience: every platform's fetch is wrapped in try/catch so one
 * provider's outage doesn't block the others.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { decryptSecret } from '@/lib/secrets'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

export const runtime = 'nodejs'
export const maxDuration = 60

const FOLLOWERS_SENTINEL_ARTIFACT_ID = '__followers__'
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

interface OAuthRow {
  workspace_id: string
  platform: string
  encrypted_access_token: string | null
  account_id: string | null
}

interface PerPlatformResult {
  workspaceId: string
  platform: string
  status: 'synced' | 'skipped' | 'failed' | 'unchanged'
  totalFollowers?: number | null
  followersDelta?: number | null
  error?: string
}

/**
 * LinkedIn follower count — best-effort. Many Marketing API tokens are
 * missing the right scope, so we return null on failure and let the
 * caller persist a null row + log a warning.
 */
async function fetchLinkedInFollowerCount(
  accessToken: string,
  accountId: string | null,
): Promise<number | null> {
  if (!accountId) return null
  const urn = accountId.startsWith('urn:li:')
    ? accountId
    : `urn:li:organization:${accountId}`

  try {
    const res = await fetchWithTimeout(
      `https://api.linkedin.com/v2/networkSizes/${encodeURIComponent(urn)}?edgeType=CompanyFollowedByMember`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202405',
        },
      },
    )
    if (res.ok) {
      const data = await res.json() as { firstDegreeSize?: number }
      if (typeof data.firstDegreeSize === 'number') return data.firstDegreeSize
    }
  } catch (err) {
    console.warn('[follower-sync] LinkedIn networkSizes failed', err)
  }

  return null
}

/**
 * Twitter/X follower count via GET /2/users/me?user.fields=public_metrics.
 * Requires the OAuth2 token to have users.read scope.
 */
async function fetchTwitterFollowerCount(accessToken: string): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(
      'https://api.twitter.com/2/users/me?user.fields=public_metrics',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!res.ok) {
      console.warn('[follower-sync] Twitter users/me HTTP', res.status)
      return null
    }
    const data = await res.json() as {
      data?: { public_metrics?: { followers_count?: number } }
    }
    const count = data.data?.public_metrics?.followers_count
    return typeof count === 'number' ? count : null
  } catch (err) {
    console.warn('[follower-sync] Twitter fetch failed', err)
    return null
  }
}

/**
 * Meta page follower count. fan_count is the canonical Page followers
 * value. accountId should be the Page ID; falls back to /me when missing.
 */
async function fetchMetaFollowerCount(
  accessToken: string,
  accountId: string | null,
): Promise<number | null> {
  try {
    const target = accountId || 'me'
    const res = await fetchWithTimeout(
      `https://graph.facebook.com/v18.0/${encodeURIComponent(target)}?fields=followers_count,fan_count&access_token=${encodeURIComponent(accessToken)}`,
    )
    if (!res.ok) {
      console.warn('[follower-sync] Meta page HTTP', res.status)
      return null
    }
    const data = await res.json() as { followers_count?: number; fan_count?: number }
    if (typeof data.fan_count === 'number') return data.fan_count
    if (typeof data.followers_count === 'number') return data.followers_count
    return null
  } catch (err) {
    console.warn('[follower-sync] Meta fetch failed', err)
    return null
  }
}

/**
 * Instagram followers via the Graph API. account_id must be the IG User
 * ID (returned by the OAuth flow when the user grants instagram_basic on
 * a connected Page) and the same Meta access token is used.
 */
async function fetchInstagramFollowerCount(
  accessToken: string,
  accountId: string | null,
): Promise<number | null> {
  if (!accountId) return null
  try {
    const res = await fetchWithTimeout(
      `https://graph.facebook.com/v18.0/${encodeURIComponent(accountId)}?fields=followers_count&access_token=${encodeURIComponent(accessToken)}`,
    )
    if (!res.ok) {
      console.warn('[follower-sync] Instagram HTTP', res.status)
      return null
    }
    const data = await res.json() as { followers_count?: number }
    return typeof data.followers_count === 'number' ? data.followers_count : null
  } catch (err) {
    console.warn('[follower-sync] Instagram fetch failed', err)
    return null
  }
}

interface PrevRow {
  total_followers: number | null
  last_synced_at: string
}

async function lastSyncRow(
  workspaceId: string,
  platform: string,
): Promise<PrevRow | null> {
  const res = await sql`
    SELECT total_followers, last_synced_at
    FROM post_metrics
    WHERE workspace_id = ${workspaceId}
      AND platform = ${platform}
      AND artifact_id = ${FOLLOWERS_SENTINEL_ARTIFACT_ID}
    ORDER BY last_synced_at DESC
    LIMIT 1
  `
  const row = res.rows[0] as { total_followers: number | null; last_synced_at: string } | undefined
  if (!row) return null
  return {
    total_followers: typeof row.total_followers === 'number' ? row.total_followers : null,
    last_synced_at: row.last_synced_at,
  }
}

async function syncOne(row: OAuthRow): Promise<PerPlatformResult> {
  const accessToken = row.encrypted_access_token
    ? (decryptSecret(row.encrypted_access_token) || '')
    : ''
  if (!accessToken) {
    return { workspaceId: row.workspace_id, platform: row.platform, status: 'skipped', error: 'no access token' }
  }

  let total: number | null = null
  try {
    const platformKey = row.platform.toLowerCase()
    if (platformKey === 'linkedin') {
      total = await fetchLinkedInFollowerCount(accessToken, row.account_id)
    } else if (platformKey === 'twitter' || platformKey === 'x') {
      total = await fetchTwitterFollowerCount(accessToken)
    } else if (platformKey === 'meta' || platformKey === 'facebook') {
      total = await fetchMetaFollowerCount(accessToken, row.account_id)
    } else if (platformKey === 'instagram') {
      total = await fetchInstagramFollowerCount(accessToken, row.account_id)
    } else {
      // Truly unknown platform — skip rather than fake values.
      return { workspaceId: row.workspace_id, platform: row.platform, status: 'skipped', error: 'platform not implemented' }
    }
  } catch (err) {
    return { workspaceId: row.workspace_id, platform: row.platform, status: 'failed', error: String(err) }
  }

  // ─── Sprint 17D P1 #16 — idempotency / dedupe ────────────────────────────
  const prev = await lastSyncRow(row.workspace_id, row.platform)
  const now = new Date()
  const nowIso = now.toISOString()

  if (total === null) {
    // Failed/null fetch path. If the previous row was ALSO null and within
    // 7d, skip entirely — don't accumulate dead-null rows on dead tokens.
    if (prev && prev.total_followers === null) {
      const ageMs = now.getTime() - new Date(prev.last_synced_at).getTime()
      if (ageMs < SEVEN_DAYS_MS) {
        console.warn(`[follower-sync] ${row.platform} still failing for ${row.workspace_id} (last null sync ${Math.round(ageMs / 3_600_000)}h ago) — skipping insert`)
        return {
          workspaceId: row.workspace_id,
          platform: row.platform,
          status: 'skipped',
          error: 'consecutive null fetch within 7d',
        }
      }
    }
    // Persist a null-followers row so the dashboard can show "last attempted"
    // but don't compute a delta against a null.
    await sql`
      INSERT INTO post_metrics (
        id, workspace_id, artifact_id, platform,
        total_followers, followers_delta, last_synced_at, created_at
      ) VALUES (
        ${newId()}, ${row.workspace_id}, ${FOLLOWERS_SENTINEL_ARTIFACT_ID}, ${row.platform},
        NULL, 0, ${nowIso}, ${nowIso}
      )
    `
    return {
      workspaceId: row.workspace_id, platform: row.platform, status: 'synced',
      totalFollowers: null, followersDelta: null,
    }
  }

  // Successful fetch path. Skip-if-no-change: when previous total matches
  // and previous sync was within 24h, just bump last_synced_at on the
  // existing row rather than creating a duplicate snapshot.
  if (prev && prev.total_followers === total) {
    const ageMs = now.getTime() - new Date(prev.last_synced_at).getTime()
    if (ageMs < TWENTY_FOUR_HOURS_MS) {
      await sql`
        UPDATE post_metrics
        SET last_synced_at = ${nowIso}
        WHERE workspace_id = ${row.workspace_id}
          AND platform = ${row.platform}
          AND artifact_id = ${FOLLOWERS_SENTINEL_ARTIFACT_ID}
          AND last_synced_at = ${prev.last_synced_at}
      `
      return {
        workspaceId: row.workspace_id, platform: row.platform, status: 'unchanged',
        totalFollowers: total, followersDelta: 0,
      }
    }
  }

  const prevTotal = typeof prev?.total_followers === 'number' ? prev.total_followers : 0
  const delta = total - prevTotal

  // Sprint 17H (audit pass #3 P2 #40): tag the sentinel row with the most
  // recently active ad campaign on this platform. The audit found
  // followers-delta couldn't be attributed to a specific campaign because
  // artifact_id is a fixed sentinel ('__followers__'). Attribution is now
  // recorded in metadata_json.attribution = {ad_campaign_id, platform}
  // so a downstream analytics query can join post_metrics → ad_campaigns
  // and answer "did this Meta page-likes campaign actually grow my page?"
  let attribution: { ad_campaign_id: string | null } = { ad_campaign_id: null }
  try {
    const recentCamp = await sql`
      SELECT id FROM ad_campaigns
      WHERE workspace_id = ${row.workspace_id}
        AND LOWER(platform) = LOWER(${row.platform === 'facebook' || row.platform === 'instagram' ? 'meta_ads' : row.platform === 'twitter' || row.platform === 'x' ? 'twitter_ads' : row.platform + '_ads'})
        AND status IN ('active', 'paused')
      ORDER BY created_at DESC LIMIT 1
    `
    const c = recentCamp.rows[0] as { id?: string } | undefined
    if (c?.id) attribution = { ad_campaign_id: c.id }
  } catch { /* non-fatal — attribution stays null */ }

  await sql`
    INSERT INTO post_metrics (
      id, workspace_id, artifact_id, platform,
      total_followers, followers_delta, last_synced_at, created_at,
      metadata_json
    ) VALUES (
      ${newId()}, ${row.workspace_id}, ${FOLLOWERS_SENTINEL_ARTIFACT_ID}, ${row.platform},
      ${total}, ${delta}, ${nowIso}, ${nowIso},
      ${JSON.stringify({ attribution })}
    )
  `

  return {
    workspaceId: row.workspace_id,
    platform: row.platform,
    status: 'synced',
    totalFollowers: total,
    followersDelta: delta,
  }
}

export async function GET(req: NextRequest) {
  // Auth: 3-way — Vercel cron bearer, ADMIN_SECRET, or vercel-cron UA.
  const cronSecret = process.env.CRON_SECRET || ''
  const adminSecret = process.env.ADMIN_SECRET || ''
  const auth = req.headers.get('authorization') || ''
  const internal = req.headers.get('x-internal-secret') || ''
  const userAgent = req.headers.get('user-agent') || ''
  const cronOk = cronSecret && auth === `Bearer ${cronSecret}`
  const adminOk = adminSecret && (internal === adminSecret || auth === `Bearer ${adminSecret}`)
  const vercelUaOk = /vercel-cron/i.test(userAgent)
  if (!cronOk && !adminOk && !vercelUaOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tokRes = await sql`
      SELECT workspace_id, platform, encrypted_access_token, account_id
      FROM oauth_tokens
      WHERE status = 'active'
      LIMIT 500
    `

    const rows = tokRes.rows as unknown as OAuthRow[]
    const results: PerPlatformResult[] = []

    for (const row of rows) {
      try {
        results.push(await syncOne(row))
      } catch (err) {
        results.push({
          workspaceId: row.workspace_id,
          platform: row.platform,
          status: 'failed',
          error: String(err),
        })
      }
    }

    // Sprint 17H (audit pass #3 P2 #42): notify on permanent failure or
    // repeated skips. If a (workspace, platform) has shown ≥3 consecutive
    // failures/skipped in a row, fire a notification so the user knows
    // the follower feature is silently half-broken for them. One per
    // 7-day window to avoid spam.
    try {
      const failureMap = new Map<string, PerPlatformResult>()
      for (const r of results) {
        if (r.status === 'failed' || r.status === 'skipped') {
          failureMap.set(`${r.workspaceId}|${r.platform}`, r)
        }
      }
      if (failureMap.size > 0) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
        for (const r of failureMap.values()) {
          // Skip if we've already notified this (workspace, platform) within 7d.
          const dedup = await sql`
            SELECT id FROM notifications
            WHERE workspace_id = ${r.workspaceId}
              AND type = 'follower_sync_skipped'
              AND body LIKE ${'%' + r.platform + '%'}
              AND created_at >= ${sevenDaysAgo}
            LIMIT 1
          `
          if (dedup.rows[0]) continue
          // Only fire on consecutive failures — check last 3 sync attempts.
          const recent = await sql`
            SELECT total_followers FROM post_metrics
            WHERE workspace_id = ${r.workspaceId}
              AND platform = ${r.platform}
              AND artifact_id = ${FOLLOWERS_SENTINEL_ARTIFACT_ID}
            ORDER BY last_synced_at DESC LIMIT 3
          `
          const allNullOrEmpty = recent.rows.length === 0 ||
            recent.rows.every(row => (row as { total_followers?: number | null }).total_followers == null)
          if (allNullOrEmpty) {
            await sql`
              INSERT INTO notifications (id, workspace_id, type, title, body, link, severity, created_at)
              VALUES (
                ${newId()}, ${r.workspaceId}, 'follower_sync_skipped',
                ${'Follower tracking unavailable on ' + r.platform},
                ${(r.error || 'No followers data returned by the platform') + ' (' + r.platform + ')'},
                '/dashboard/integrations',
                'warning',
                ${new Date().toISOString()}
              )
            `
          }
        }
      }
    } catch (err) {
      console.error('[follower-sync] skip-notification batch failed:', err)
    }

    return NextResponse.json({
      syncedAt: new Date().toISOString(),
      total: results.length,
      succeeded: results.filter(r => r.status === 'synced').length,
      unchanged: results.filter(r => r.status === 'unchanged').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length,
      results,
    })
  } catch (error) {
    console.error('[follower-sync] cron error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
