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
 * Why a new cron instead of bolting onto /api/cron/campaign-sync?
 *   - campaign-sync iterates ad campaigns. Follower stats are per workspace+
 *     platform, not per campaign. Different cardinality + different cadence.
 *   - 4×/day vs 1×/day — followers can spike on a viral post and trend
 *     dashboards become useless if we only see daily snapshots.
 *
 * Resilience: every platform's fetch is wrapped in try/catch so one
 * provider's outage doesn't block the others. Unknown / unimplemented
 * platforms log a warning and skip rather than blow up the cron.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { decryptSecret } from '@/lib/secrets'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

export const runtime = 'nodejs'
export const maxDuration = 60

const FOLLOWERS_SENTINEL_ARTIFACT_ID = '__followers__'

interface OAuthRow {
  workspace_id: string
  platform: string
  encrypted_access_token: string | null
  account_id: string | null
}

interface PerPlatformResult {
  workspaceId: string
  platform: string
  status: 'synced' | 'skipped' | 'failed'
  totalFollowers?: number | null
  followersDelta?: number | null
  error?: string
}

/**
 * LinkedIn follower count — best-effort.
 *
 * For org pages we'd call /v2/organizationalEntityFollowerStatistics or
 * /v2/networkSizes/urn:li:organization:{id}. For personal profiles
 * /v2/networkSizes/urn:li:person:{id} works with r_1st_connections_size.
 *
 * In practice many Marketing API tokens are missing the right scope, so we
 * try in priority order and return null if none succeeds — the caller will
 * persist nulls and log a warning rather than failing the whole sync.
 */
async function fetchLinkedInFollowerCount(
  accessToken: string,
  accountId: string | null,
): Promise<number | null> {
  if (!accountId) return null
  const urn = accountId.startsWith('urn:li:')
    ? accountId
    : `urn:li:organization:${accountId}`

  // Try org-level follower stats first (returns lifetime cumulative).
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

async function syncOne(row: OAuthRow): Promise<PerPlatformResult> {
  const accessToken = row.encrypted_access_token
    ? (decryptSecret(row.encrypted_access_token) || '')
    : ''
  if (!accessToken) {
    return { workspaceId: row.workspace_id, platform: row.platform, status: 'skipped', error: 'no access token' }
  }

  let total: number | null = null
  try {
    if (row.platform === 'linkedin') {
      total = await fetchLinkedInFollowerCount(accessToken, row.account_id)
    } else {
      // Twitter, Meta page likes, Instagram followers can be added here.
      // We deliberately skip rather than fake values.
      return { workspaceId: row.workspace_id, platform: row.platform, status: 'skipped', error: 'platform not implemented' }
    }
  } catch (err) {
    return { workspaceId: row.workspace_id, platform: row.platform, status: 'failed', error: String(err) }
  }

  if (total === null) {
    console.warn(`[follower-sync] ${row.platform} follower count unavailable for workspace ${row.workspace_id}`)
    // Persist a null-followers row so the dashboard can show "last attempted"
    // but don't compute a delta against a null.
    await sql`
      INSERT INTO post_metrics (
        id, workspace_id, artifact_id, platform,
        total_followers, followers_delta, last_synced_at, created_at
      ) VALUES (
        ${newId()}, ${row.workspace_id}, ${FOLLOWERS_SENTINEL_ARTIFACT_ID}, ${row.platform},
        NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `
    return { workspaceId: row.workspace_id, platform: row.platform, status: 'synced', totalFollowers: null, followersDelta: null }
  }

  // Look up the previous total_followers to compute the delta.
  const prevRes = await sql`
    SELECT total_followers FROM post_metrics
    WHERE workspace_id = ${row.workspace_id}
      AND platform = ${row.platform}
      AND artifact_id = ${FOLLOWERS_SENTINEL_ARTIFACT_ID}
      AND total_followers IS NOT NULL
    ORDER BY last_synced_at DESC
    LIMIT 1
  `
  const prev = prevRes.rows[0] as { total_followers?: number | null } | undefined
  const prevTotal = typeof prev?.total_followers === 'number' ? prev.total_followers : 0
  const delta = total - prevTotal

  await sql`
    INSERT INTO post_metrics (
      id, workspace_id, artifact_id, platform,
      total_followers, followers_delta, last_synced_at, created_at
    ) VALUES (
      ${newId()}, ${row.workspace_id}, ${FOLLOWERS_SENTINEL_ARTIFACT_ID}, ${row.platform},
      ${total}, ${delta}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
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
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

    return NextResponse.json({
      syncedAt: new Date().toISOString(),
      total: results.length,
      succeeded: results.filter(r => r.status === 'synced').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length,
      results,
    })
  } catch (error) {
    console.error('[follower-sync] cron error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
