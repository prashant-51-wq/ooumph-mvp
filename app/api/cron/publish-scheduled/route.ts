/**
 * Cron: /api/cron/publish-scheduled
 *
 * Runs every minute (Vercel cron). Drains the publishing queue:
 *
 *   1. SELECT rows from scheduled_content WHERE status='pending'
 *        AND scheduled_at <= NOW() LIMIT 50
 *   2. For each row:
 *      a. Run assertArtifactApproved() — if the row has artifact_id,
 *         the underlying artifact MUST be human-approved.
 *      b. Resolve OAuth token from oauth_tokens (AES-decrypted).
 *      c. Pipe content_body through shortenAndTrackUrls() so every
 *         outbound URL becomes /api/l/:slug analytics redirector.
 *      d. Hand the transformed body to the per-platform dispatcher
 *         (LinkedIn text URN, X/Twitter v2, WordPress REST).
 *      e. On success: insert published_content row, flip status='published'.
 *      f. On error: bump retry_count. After 3 strikes flip status='failed'.
 *
 * Idempotency: we flip the row to status='publishing' BEFORE dispatch so
 * a re-entrant cron tick can't double-publish. The dispatcher result
 * always re-flips to 'published' or 'pending' (for retry).
 *
 * Auth: requires Bearer ${CRON_SECRET}. Vercel cron supplies this.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertArtifactApproved } from '@/lib/guards'
import { decryptSecret } from '@/lib/secrets'
import { shortenAndTrackUrls } from '@/lib/link-tracker'
import { buildAgentActiveCache } from '@/lib/agents'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_RETRY_COUNT = 3
const BATCH_LIMIT = 50

// ─── Per-platform dispatchers ───────────────────────────────────────────────

interface DispatchInput {
  accessToken: string
  accountId: string | null
  body: string
  workspaceId: string
}

interface DispatchResult {
  ok: boolean
  nativePostId?: string
  permalink?: string
  error?: string
}

async function dispatchLinkedIn({ accessToken, accountId, body }: DispatchInput): Promise<DispatchResult> {
  if (!accountId) return { ok: false, error: 'Missing LinkedIn person URN in oauth_tokens.account_id' }
  const personUrn = accountId.startsWith('urn:') ? accountId : `urn:li:person:${accountId}`
  try {
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: body },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { ok: false, error: `LinkedIn ${res.status}: ${errText.slice(0, 240)}` }
    }
    const data = await res.json() as { id?: string }
    return {
      ok: true,
      nativePostId: data.id || '',
      permalink: data.id ? `https://www.linkedin.com/feed/update/${data.id}/` : 'https://www.linkedin.com/feed/',
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function dispatchTwitter({ accessToken, body }: DispatchInput): Promise<DispatchResult> {
  try {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: body.slice(0, 280) }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { ok: false, error: `X/Twitter ${res.status}: ${errText.slice(0, 240)}` }
    }
    const data = await res.json() as { data?: { id?: string } }
    const tweetId = data.data?.id || ''
    return {
      ok: true,
      nativePostId: tweetId,
      permalink: tweetId ? `https://x.com/i/status/${tweetId}` : 'https://x.com/',
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function dispatchWordPress({ accessToken, accountId, body }: DispatchInput): Promise<DispatchResult> {
  // accountId is the site URL (e.g. https://example.com or example.wordpress.com)
  if (!accountId) return { ok: false, error: 'Missing WordPress site URL in oauth_tokens.account_id' }
  const siteBase = accountId.replace(/\/+$/, '')
  // For self-hosted: /wp-json/wp/v2/posts. For WordPress.com: REST v1.1 differs,
  // but most users connect via the WP REST plugin or Jetpack — we use v2 here.
  const url = `${siteBase}/wp-json/wp/v2/posts`
  try {
    // Lean WordPress payload: first line becomes the title, rest is content.
    const lines = body.split('\n')
    const title = (lines[0] || 'New Post').slice(0, 200)
    const content = lines.slice(1).join('\n').trim() || body
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, content, status: 'publish' }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { ok: false, error: `WordPress ${res.status}: ${errText.slice(0, 240)}` }
    }
    const data = await res.json() as { id?: number; link?: string }
    return {
      ok: true,
      nativePostId: data.id ? String(data.id) : '',
      permalink: data.link || siteBase,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function dispatcherFor(channel: string) {
  const k = channel.toLowerCase()
  if (k === 'linkedin') return dispatchLinkedIn
  if (k === 'twitter' || k === 'x') return dispatchTwitter
  if (k === 'wordpress' || k === 'blog') return dispatchWordPress
  return null
}

// ─── Cron entrypoint ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Vercel cron passes Authorization: Bearer ${CRON_SECRET}. Also allow
  // x-internal-secret for manual triggering with ADMIN_SECRET.
  const cronSecret = process.env.CRON_SECRET || ''
  const adminSecret = process.env.ADMIN_SECRET || ''
  const auth = req.headers.get('authorization') || ''
  const internal = req.headers.get('x-internal-secret') || ''
  const cronOk = cronSecret && auth === `Bearer ${cronSecret}`
  const adminOk = adminSecret && (internal === adminSecret || auth === `Bearer ${adminSecret}`)
  if (!cronOk && !adminOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date()
  const nowIso = startedAt.toISOString()

  // Pull due rows. Worker locks each by flipping status='publishing' before
  // dispatch — this guards against double-publishing if two ticks overlap.
  const dueRes = await sql`
    SELECT id, workspace_id, artifact_id, channel, content_body,
           media_urls, retry_count, scheduled_at
    FROM scheduled_content
    WHERE status = 'pending'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= ${nowIso}
    ORDER BY scheduled_at ASC
    LIMIT ${BATCH_LIMIT}
  `
  const items = dueRes.rows as unknown as Array<{
    id: string
    workspace_id: string
    artifact_id: string | null
    channel: string | null
    content_body: string | null
    media_urls: string | null
    retry_count: number | null
    scheduled_at: string
  }>

  const results: Array<{ id: string; status: string; error?: string; nativePostId?: string }> = []

  // 🚨 PR Circuit Breaker — per-workspace cache so we don't query workspaces
  // once per item. Map<workspaceId, true=clear / false=in-crisis>.
  const breakerCache = new Map<string, boolean>()
  const isWorkspaceClear = async (workspaceId: string): Promise<boolean> => {
    if (breakerCache.has(workspaceId)) return breakerCache.get(workspaceId)!
    const r = await sql`SELECT crisis_status FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const status = String((r.rows[0] as { crisis_status?: string } | undefined)?.crisis_status || 'clear').toLowerCase()
    const clear = status === 'clear'
    breakerCache.set(workspaceId, clear)
    return clear
  }

  // 🛑 Sprint 2 Commit 2 — Agent lifecycle gate. Reads agents.status for the
  // 'social-agent' row (the publishing worker per the canonical slug list
  // in lib/agents.ts → DEFAULT_AGENTS). When an operator pauses social-agent
  // from /dashboard/agents, this cache returns false on the next tick and
  // we skip every scheduled item for that workspace.
  //
  // Failure semantics: an unseeded registry row returns active (fail open),
  // matching the seedDefaultAgents idempotency story. So a workspace that
  // existed before Sprint 2 still publishes — only operators who've
  // explicitly paused get the skip.
  //
  // Items skipped here stay in 'pending' (we don't flip to failed). They'll
  // be re-evaluated on the next cron tick — so resuming the agent picks up
  // backlog work automatically without manual requeue.
  const socialAgentActive = buildAgentActiveCache('social-agent')

  for (const item of items) {
    const itemId = item.id
    const workspaceId = item.workspace_id
    const channel = (item.channel || '').toLowerCase()
    const body = item.content_body || ''
    const retryCount = Number(item.retry_count || 0)

    try {
      // ── 0. PR Circuit Breaker — skip every workspace in crisis ──────────
      // Per-workspace cached read; items stay in 'pending' so they'll be
      // picked up on the next cron tick once the crisis clears.
      if (!(await isWorkspaceClear(workspaceId))) {
        results.push({ id: itemId, status: 'skipped_crisis' })
        continue
      }

      // ── 0.5. Agent lifecycle gate — skip workspaces with social-agent paused ──
      // Operator paused the publishing worker from /dashboard/agents. Leave
      // the row in 'pending' so it'll publish automatically when they
      // resume. No retry counter bump — pausing is not a failure.
      if (!(await socialAgentActive(workspaceId))) {
        results.push({ id: itemId, status: 'skipped_agent_paused' })
        continue
      }

      // ── 1. Lock the row (status → 'publishing') ─────────────────────────
      // If a concurrent worker already grabbed this row, our UPDATE will
      // affect zero rows and we'll skip it on the next read.
      await sql`
        UPDATE scheduled_content
        SET status = 'publishing', updated_at = ${new Date().toISOString()}
        WHERE id = ${itemId} AND status = 'pending'
      `

      // ── 2. Safety gate: artifact must be approved ───────────────────────
      if (item.artifact_id) {
        const gate = await assertArtifactApproved(workspaceId, item.artifact_id)
        if (gate) {
          // 403 from gate — leave permanently failed; don't auto-retry an
          // unapproved artifact.
          const now = new Date().toISOString()
          await sql`
            UPDATE scheduled_content
            SET status = 'failed', error_message = 'Artifact not approved', updated_at = ${now}
            WHERE id = ${itemId}
          `
          // Sprint 15B (P0 #7): producer-side notification.
          try {
            await sql`
              INSERT INTO notifications (id, workspace_id, type, title, body, link, severity, created_at)
              VALUES (
                ${newId()}, ${workspaceId}, 'publish_failed',
                ${'Publish blocked — artifact not approved'},
                ${'Open the approval queue and approve before the cron will publish.'},
                '/dashboard/approvals',
                'warning',
                ${now}
              )
            `
          } catch { /* non-fatal */ }
          results.push({ id: itemId, status: 'failed', error: 'artifact_not_approved' })
          continue
        }
      }

      // ── 3. Resolve OAuth token from oauth_tokens (BYOK) ─────────────────
      if (!channel) {
        await markFailed(itemId, retryCount, 'No channel set', workspaceId, null)
        results.push({ id: itemId, status: 'failed', error: 'no_channel' })
        continue
      }
      const tokRes = await sql`
        SELECT encrypted_access_token, account_id, expires_at, status
        FROM oauth_tokens
        WHERE workspace_id = ${workspaceId} AND platform = ${channel}
        LIMIT 1
      `
      const tok = tokRes.rows[0] as {
        encrypted_access_token?: string
        account_id?: string | null
        expires_at?: string | null
        status?: string
      } | undefined

      if (!tok?.encrypted_access_token || tok.status !== 'active') {
        await markFailed(itemId, retryCount, `No active ${channel} connection`, workspaceId, channel)
        results.push({ id: itemId, status: 'failed', error: 'no_oauth_token' })
        continue
      }

      const accessToken = decryptSecret(tok.encrypted_access_token)
      if (!accessToken) {
        await markFailed(itemId, retryCount, 'Token decrypt failed', workspaceId, channel)
        results.push({ id: itemId, status: 'failed', error: 'decrypt_failed' })
        continue
      }

      // ── 4. URL shortening pass — every external link becomes tracked ────
      const { transformedBody, shortenedCount } = await shortenAndTrackUrls(
        body, workspaceId, itemId, channel,
      )

      // ── 5. Per-platform dispatch ────────────────────────────────────────
      const dispatcher = dispatcherFor(channel)
      if (!dispatcher) {
        await markFailed(itemId, retryCount, `Channel '${channel}' not supported`, workspaceId, channel)
        results.push({ id: itemId, status: 'failed', error: 'unsupported_channel' })
        continue
      }

      const dispatch = await dispatcher({
        accessToken,
        accountId: tok.account_id || null,
        body: transformedBody,
        workspaceId,
      })

      if (dispatch.ok) {
        // ── 6a. Success → write published_content + mark row done ─────────
        const publishedId = newId()
        const publishedAt = new Date().toISOString()
        await sql`
          INSERT INTO published_content (
            id, workspace_id, artifact_id, scheduled_content_id,
            channel, platform, native_post_id, post_id, permalink, post_url,
            published_at, metadata_json
          ) VALUES (
            ${publishedId}, ${workspaceId}, ${item.artifact_id || null}, ${itemId},
            ${channel}, ${channel}, ${dispatch.nativePostId || null}, ${dispatch.nativePostId || null},
            ${dispatch.permalink || null}, ${dispatch.permalink || null},
            ${publishedAt}, ${JSON.stringify({ shortenedUrls: shortenedCount })}
          )
        `
        await sql`
          UPDATE scheduled_content
          SET status = 'published', error_message = NULL, updated_at = ${publishedAt}
          WHERE id = ${itemId}
        `
        results.push({
          id: itemId, status: 'published', nativePostId: dispatch.nativePostId,
        })
      } else {
        // ── 6b. Failure → bump retry counter; mark failed at 3 strikes ────
        await markFailed(itemId, retryCount, dispatch.error || 'Unknown dispatch error', workspaceId, channel)
        results.push({ id: itemId, status: 'retry', error: dispatch.error })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[publish-scheduled] item ${itemId} threw:`, err)
      try {
        await markFailed(itemId, retryCount, msg, workspaceId, channel)
      } catch { /* best-effort */ }
      results.push({ id: itemId, status: 'failed', error: msg })
    }
  }

  return NextResponse.json({
    processedAt: nowIso,
    durationMs: Date.now() - startedAt.getTime(),
    processed: results.length,
    results,
  })
}

/**
 * Centralised failure handler. Increments retry_count and either flips back
 * to 'pending' for another shot, or to 'failed' once we've burned 3 strikes.
 *
 * Sprint 15B (P0 #7): on terminal failure, produce a notification row so the
 * user sees the failure even if they aren't watching /calendar. workspaceId
 * and channel are optional only because two early call sites don't have them
 * yet — both still flow through here so the notification path stays single.
 */
async function markFailed(
  itemId: string,
  currentRetries: number,
  errMsg: string,
  workspaceId?: string,
  channel?: string | null,
): Promise<void> {
  const nextRetries = currentRetries + 1
  const finalStatus = nextRetries >= MAX_RETRY_COUNT ? 'failed' : 'pending'
  const now = new Date().toISOString()
  await sql`
    UPDATE scheduled_content SET
      status        = ${finalStatus},
      retry_count   = ${nextRetries},
      error_message = ${errMsg.slice(0, 500)},
      updated_at    = ${now}
    WHERE id = ${itemId}
  `
  if (finalStatus === 'failed' && workspaceId) {
    try {
      await sql`
        INSERT INTO notifications (id, workspace_id, type, title, body, link, severity, created_at)
        VALUES (
          ${newId()}, ${workspaceId}, 'publish_failed',
          ${'Publish failed' + (channel ? ` on ${channel}` : '')},
          ${errMsg.slice(0, 240)},
          '/dashboard/calendar',
          'error',
          ${now}
        )
      `
    } catch (err) {
      console.error('[publish-scheduled] notification insert failed:', err)
    }
  }
}
