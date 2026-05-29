import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql, newId } from '@/lib/db'
import { sendApprovalConfirmationEmail } from '@/lib/email'
import { assertWorkspaceOwnership } from '@/lib/guards'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([])
  // Sprint 8A: ownership check — approvals contain artifact content.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Sprint 18F (audit pass #5 P1): paginate. Pre-fix the route returned
  // every approval ever, joined to its artifact — a workspace with months
  // of activity could ship megabytes per page render. Default 50, max 200,
  // optional `cursor` = the created_at ISO of the last row from the prior
  // page (returns rows strictly older).
  const limitRaw = parseInt(searchParams.get('limit') || '50', 10)
  const limit = Math.max(1, Math.min(200, isNaN(limitRaw) ? 50 : limitRaw))
  const cursor = searchParams.get('cursor') // ISO timestamp
  const statusFilter = searchParams.get('status') // optional: pending|approved|rejected

  const result = cursor
    ? (statusFilter
        ? await sql`
            SELECT
              ap.*, a.type as artifact_type, a.title as artifact_title,
              a.content_json, a.status as artifact_status,
              a.created_at as artifact_created_at, a.lp_slug
            FROM approvals ap
            JOIN artifacts a ON a.id = ap.artifact_id
            WHERE ap.workspace_id = ${workspaceId}
              AND ap.status = ${statusFilter}
              AND ap.created_at < ${cursor}
            ORDER BY ap.created_at DESC
            LIMIT ${limit}
          `
        : await sql`
            SELECT
              ap.*, a.type as artifact_type, a.title as artifact_title,
              a.content_json, a.status as artifact_status,
              a.created_at as artifact_created_at, a.lp_slug
            FROM approvals ap
            JOIN artifacts a ON a.id = ap.artifact_id
            WHERE ap.workspace_id = ${workspaceId}
              AND ap.created_at < ${cursor}
            ORDER BY ap.created_at DESC
            LIMIT ${limit}
          `)
    : (statusFilter
        ? await sql`
            SELECT
              ap.*, a.type as artifact_type, a.title as artifact_title,
              a.content_json, a.status as artifact_status,
              a.created_at as artifact_created_at, a.lp_slug
            FROM approvals ap
            JOIN artifacts a ON a.id = ap.artifact_id
            WHERE ap.workspace_id = ${workspaceId}
              AND ap.status = ${statusFilter}
            ORDER BY ap.created_at DESC
            LIMIT ${limit}
          `
        : await sql`
            SELECT
              ap.*, a.type as artifact_type, a.title as artifact_title,
              a.content_json, a.status as artifact_status,
              a.created_at as artifact_created_at, a.lp_slug
            FROM approvals ap
            JOIN artifacts a ON a.id = ap.artifact_id
            WHERE ap.workspace_id = ${workspaceId}
            ORDER BY ap.created_at DESC
            LIMIT ${limit}
          `)
  // Parse content_json strings into objects for the UI
  const rows = result.rows.map((r) => {
    const row = r as Record<string, unknown>
    if (typeof row.content_json === 'string') {
      try { row.content_json = JSON.parse(row.content_json as string) } catch { /* keep raw */ }
    }
    return row
  })
  // Back-compat: if no pagination params were requested, return a plain
  // array (the original shape). If paginated, return {rows, nextCursor}.
  if (!cursor && !searchParams.has('limit') && !statusFilter) {
    return NextResponse.json(rows)
  }
  const last = rows[rows.length - 1] as { created_at?: string } | undefined
  const nextCursor = rows.length === limit && last?.created_at ? last.created_at : null
  return NextResponse.json({ rows, nextCursor })
}

export async function PATCH(req: NextRequest) {
  try {
    const { approvalId, action, notes, workspaceId } = await req.json()
    if (!approvalId || !action || !workspaceId) {
      return NextResponse.json({ error: 'approvalId, action, workspaceId required' }, { status: 400 })
    }
    // Sprint 8A: ownership before approve/reject — controls publish gate.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Defense in depth: confirm the approval row actually belongs to this
    // workspace (so a stolen approvalId from another tenant can't be
    // approved by spoofing your own workspaceId).
    const ownerRes = await sql`SELECT workspace_id FROM approvals WHERE id = ${approvalId} LIMIT 1`
    const ownerRow = ownerRes.rows[0] as { workspace_id?: string } | undefined
    if (!ownerRow?.workspace_id) return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    if (ownerRow.workspace_id !== workspaceId) {
      return NextResponse.json({ error: 'Approval does not belong to this workspace' }, { status: 403 })
    }

    const status = action === 'approve' ? 'approved' : 'rejected'

    // Sprint 16J (audit P1 #17): persist who/when on the approval row +
    // append an event to approval_events for full audit trail. Previously
    // the PATCH overwrote status+notes in place with no actor record,
    // making compliance / "who approved this?" questions unanswerable.
    const now = new Date().toISOString()
    let actorId: string | null = null
    let actorEmail: string | null = null
    try {
      const { getSessionUserId } = await import('@/lib/guards')
      actorId = getSessionUserId(req)
      if (actorId) {
        const userRes = await sql`SELECT email FROM users WHERE id = ${actorId} LIMIT 1`
        actorEmail = (userRes.rows[0] as { email?: string } | undefined)?.email || null
      }
    } catch { /* non-fatal */ }

    await sql`
      UPDATE approvals
      SET status = ${status}, notes = ${notes || null},
          approved_by = ${actorEmail || actorId},
          approved_at = ${now},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${approvalId}
    `

    const artifactResult = await sql`
      SELECT a.id, a.type, a.title FROM artifacts a
      JOIN approvals ap ON ap.artifact_id = a.id
      WHERE ap.id = ${approvalId}
    `
    const artifact = artifactResult.rows[0]

    // Append the audit event. Non-fatal — a missing approval_events table
    // (legacy install pre-Sprint-16A migration) doesn't break the approval.
    try {
      await sql`
        INSERT INTO approval_events (id, workspace_id, approval_id, artifact_id, actor_id, actor_email, action, notes, created_at)
        VALUES (
          ${newId()}, ${workspaceId}, ${approvalId}, ${(artifact?.id as string) || null},
          ${actorId}, ${actorEmail},
          ${action}, ${notes || null},
          ${now}
        )
      `
    } catch (err) {
      console.error('[approvals] approval_events insert failed (non-fatal):', err)
    }

    await sql`UPDATE artifacts SET status = ${status} WHERE id = ${artifact?.id}`

    if (action === 'reject' && notes && artifact?.id) {
      await sql`
        INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note)
        VALUES (${newId()}, ${workspaceId}, 'approval_rejection', ${artifact.id}, ${notes})
      `
    }

    // Send confirmation email to the workspace approval address
    const brandResult = await sql`SELECT approval_email, business_name FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0]
    if (brand?.approval_email && artifact?.type) {
      await sendApprovalConfirmationEmail({
        to: brand.approval_email as string,
        businessName: brand.business_name as string,
        artifactType: artifact.type as string,
        action,
        notes,
      })
    }

    // ── Strategy approved → trigger CMO decomposition into project_tasks ─────
    //
    // When the user approves a strategy artifact, the CMO breaks it down into
    // concrete sub-agent tasks (social posts, emails, ads, etc.) and dispatches
    // each one. We fire this in `after()` so the approval response stays fast
    // and the user sees the modal close immediately. Vercel keeps the function
    // alive until the decomposition completes; if it fails we log + move on,
    // the approval is committed regardless.
    if (action === 'approve' && artifact?.id && artifact?.type === 'strategy') {
      after(async () => {
        try {
          // Idempotency check — skip if tasks already exist for this strategy.
          const existing = await sql`
            SELECT COUNT(*) as count FROM project_tasks
            WHERE workspace_id = ${workspaceId} AND parent_artifact_id = ${artifact.id as string}
          `
          const existingCount = Number((existing.rows[0] as { count?: number } | undefined)?.count || 0)
          if (existingCount > 0) {
            console.log(`[approvals] strategy ${artifact.id} already has ${existingCount} project_tasks — skipping decomposition`)
            return
          }

          const res = await fetch(`${BASE_URL}/api/agents/decompose-strategy`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.ADMIN_SECRET ? { 'x-internal-secret': process.env.ADMIN_SECRET } : {}),
            },
            body: JSON.stringify({
              workspaceId,
              artifactId: artifact.id,
            }),
          })
          if (!res.ok) {
            const txt = await res.text().catch(() => '')
            console.error(`[approvals] decompose-strategy returned ${res.status}: ${txt.slice(0, 200)}`)
          } else {
            const data = await res.json().catch(() => ({}))
            console.log(`[approvals] decomposed strategy ${artifact.id} into ${data.taskCount || 0} tasks`)
          }
        } catch (err) {
          console.error('[approvals after()] strategy decomposition failed:', err)
        }
      })
    }

    // ── Auto-publish if a creative_request specified publish_platforms ─────────
    if (action === 'approve' && artifact?.id) {
      const creativeReqResult = await sql`
        SELECT id, publish_platforms FROM creative_requests
        WHERE artifact_id = ${artifact.id} AND publish_platforms IS NOT NULL
        LIMIT 1
      `
      const creativeReq = creativeReqResult.rows[0]
      if (creativeReq?.publish_platforms) {
        const platforms = JSON.parse(creativeReq.publish_platforms as string) as string[]
        // Fire-and-forget publish to each platform (HITL gate was the approval itself)
        Promise.allSettled(
          platforms.map(platform =>
            fetch(`${BASE_URL}/api/publish`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspaceId, artifactId: artifact.id, platform }),
            }).then(async r => {
              const data = await r.json() as { ok?: boolean; error?: string; postUrl?: string }
              if (!data.ok) console.error(`Auto-publish to ${platform} failed:`, data.error)
              else console.log(`Auto-published to ${platform}:`, data.postUrl)
            })
          )
        ).catch(e => console.error('Auto-publish batch error:', e))
      }
    }

    // ── Sprint 16C (audit P0 #1): approval → scheduled_content fan-out ────────
    //
    // The Sprint 15B closure shipped a single-row handoff that only handled
    // single-post artifact types (linkedin_post, twitter_post, etc.). The
    // actual content_calendar artifact emitted by /api/agents/content is ONE
    // row containing 30 calendar entries — which fell through the type set
    // and never reached scheduled_content. The audit pass #2 flagged this
    // as the headline regression: J1 + J2 happy paths still failed.
    //
    // This rewrite handles BOTH shapes:
    //   - content_calendar / 30-day-calendar artifacts → fan-out into N rows
    //   - single-post artifacts → one row (preserved behaviour)
    //
    // Dedupe: existing scheduled_content rows for this artifact_id are not
    // re-inserted. We use (artifact_id, channel, scheduled_at) as the
    // logical key per entry; on regen+approve the next run's identical
    // entries are skipped, while genuinely new entries land.
    const SINGLE_POST_TYPES = new Set([
      'social_post', 'linkedin_post', 'twitter_post', 'instagram_post',
      'facebook_post', 'post', 'caption', 'thread', 'reel_script',
    ])
    const CALENDAR_TYPES = new Set([
      'content_calendar', '30_day_calendar', 'weekly_content', 'content_plan',
    ])
    const isSinglePost = artifact && SINGLE_POST_TYPES.has(artifact.type as string)
    const isCalendar = artifact && CALENDAR_TYPES.has(artifact.type as string)
    if (action === 'approve' && artifact?.id && (isSinglePost || isCalendar)) {
      after(async () => {
        try {
          const artFull = await sql`
            SELECT content_json FROM artifacts WHERE id = ${artifact.id as string} LIMIT 1
          `
          const row = artFull.rows[0] as { content_json?: string | Record<string, unknown> | unknown[] } | undefined
          let content: unknown = {}
          if (typeof row?.content_json === 'string') {
            try { content = JSON.parse(row.content_json) } catch { /* ignore */ }
          } else if (row?.content_json) {
            content = row.content_json
          }

          // Channel inference helper — shared between single-post and calendar.
          const inferChannel = (t: string): string | null => {
            const x = (t || '').toLowerCase()
            if (x.includes('linkedin')) return 'linkedin'
            if (x.includes('twitter') || x.includes('x_')) return 'twitter'
            if (x.includes('instagram') || x.includes('reel')) return 'instagram'
            if (x.includes('facebook')) return 'facebook'
            if (x.includes('youtube')) return 'youtube'
            return null
          }

          // Calendar entries can live under several keys depending on which
          // generator produced the artifact. We try each in order.
          const extractEntries = (c: unknown): Record<string, unknown>[] => {
            if (Array.isArray(c)) return c as Record<string, unknown>[]
            if (c && typeof c === 'object') {
              const obj = c as Record<string, unknown>
              for (const k of ['posts', 'entries', 'days', 'calendar', 'items', 'schedule']) {
                if (Array.isArray(obj[k])) return obj[k] as Record<string, unknown>[]
              }
            }
            return []
          }

          // ---- CALENDAR PATH (30+ rows fan-out) ----
          if (isCalendar) {
            const entries = extractEntries(content)
            if (entries.length === 0) {
              console.log(`[approvals] calendar ${artifact.id} has no entries — skip`)
              return
            }
            // Pull existing rows for this artifact so re-approval doesn't dup.
            const existing = await sql`
              SELECT channel, scheduled_at FROM scheduled_content
              WHERE artifact_id = ${artifact.id as string}
            `
            const seen = new Set(
              (existing.rows as { channel?: string; scheduled_at?: string }[])
                .map(r => `${r.channel || ''}|${r.scheduled_at || ''}`)
            )
            // Sprint 18G (audit pass #5 P1 #11): workspace timezone.
            // Previously every calendar entry landed at "approval_time + N*24h"
            // computed in server-local UTC, so a Pacific-time workspace got
            // its "9am morning post" published at 2am their time. Now we
            // read the workspace timezone from calendar_availability (which
            // is already the timezone source-of-truth for the booking
            // system) and anchor day N to 9am local in that TZ.
            let workspaceTz = 'UTC'
            try {
              const tzRow = await sql`
                SELECT timezone FROM calendar_availability
                WHERE workspace_id = ${workspaceId} LIMIT 1
              `
              const tz = (tzRow.rows[0] as { timezone?: string } | undefined)?.timezone
              if (tz && typeof tz === 'string') workspaceTz = tz
            } catch { /* table may not exist on legacy installs */ }
            // Compute the UTC ms offset for "9am tomorrow in workspaceTz".
            // The round-trip-through-locale trick gives us a current
            // offset accurate to within a DST boundary, which is plenty.
            const computeBaseTime = (): number => {
              try {
                const now = new Date()
                const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' })
                const tzStr = now.toLocaleString('en-US', { timeZone: workspaceTz })
                const tzOffsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime()
                // Midnight today in workspaceTz, expressed as UTC ms:
                const midnightLocalUtcMs = Math.floor((Date.now() + tzOffsetMs) / 86_400_000) * 86_400_000 - tzOffsetMs
                const nineAmTodayUtcMs = midnightLocalUtcMs + 9 * 3600_000
                // If we're already past 9am local, start tomorrow.
                return nineAmTodayUtcMs > Date.now() + 30 * 60_000
                  ? nineAmTodayUtcMs
                  : nineAmTodayUtcMs + 24 * 3600_000
              } catch {
                return Date.now() + 30 * 60_000
              }
            }
            const baseTime = computeBaseTime()
            let inserted = 0
            const queuedChannels = new Set<string>()
            for (let i = 0; i < entries.length; i++) {
              const e = entries[i]
              const body =
                (e.body as string) || (e.content as string) || (e.text as string) ||
                (e.caption as string) || (e.copy as string) || (e.hook as string) || (e.topic as string) || ''
              if (!body.trim()) continue
              const channel =
                (e.channel as string) || (e.platform as string) ||
                inferChannel((e.postType as string) || (e.format as string) || '') ||
                'linkedin'
              // Schedule: explicit `scheduled_at` > computed (day N at 9am
              // local +30min for the first entry). Day field may be a number
              // (1..30) or a relative string.
              let scheduledAt: string
              if (e.scheduled_at && typeof e.scheduled_at === 'string') {
                scheduledAt = e.scheduled_at
              } else {
                const dayN = typeof e.day === 'number' ? Math.max(0, e.day - 1) : i
                const ts = baseTime + dayN * 24 * 3600 * 1000
                scheduledAt = new Date(ts).toISOString()
              }
              const key = `${channel.toLowerCase()}|${scheduledAt}`
              if (seen.has(key)) continue
              const mediaUrls = Array.isArray(e.media_urls) ? e.media_urls : []
              const now = new Date().toISOString()
              await sql`
                INSERT INTO scheduled_content (
                  id, workspace_id, artifact_id,
                  channel, platform,
                  content_body, content,
                  scheduled_at, scheduled_for,
                  media_urls, status, retry_count,
                  created_at, updated_at
                ) VALUES (
                  ${newId()}, ${workspaceId}, ${artifact.id as string},
                  ${channel.toLowerCase()}, ${channel.toLowerCase()},
                  ${body}, ${body},
                  ${scheduledAt}, ${scheduledAt},
                  ${JSON.stringify(mediaUrls)}, 'pending', 0,
                  ${now}, ${now}
                )
              `
              seen.add(key)
              queuedChannels.add(channel.toLowerCase())
              inserted++
            }
            console.log(`[approvals] calendar ${artifact.id} fanned out to ${inserted} scheduled rows across [${[...queuedChannels].join(', ')}]`)
            if (inserted > 0) {
              await sql`
                INSERT INTO notifications (id, workspace_id, type, title, body, link, severity, created_at)
                VALUES (
                  ${newId()}, ${workspaceId}, 'calendar_queued',
                  ${inserted + ' posts queued from your content calendar'},
                  ${'Spans ' + queuedChannels.size + ' channel' + (queuedChannels.size === 1 ? '' : 's') + ' — open the calendar to retime or cancel any of them.'},
                  '/dashboard/calendar',
                  'success',
                  ${new Date().toISOString()}
                )
              `
            }
            return
          }

          // ---- SINGLE POST PATH (preserved Sprint 15B behaviour) ----
          const c = (content || {}) as Record<string, unknown>
          const existing = await sql`
            SELECT id FROM scheduled_content WHERE artifact_id = ${artifact.id as string} LIMIT 1
          `
          if (existing.rows[0]) {
            console.log(`[approvals] artifact ${artifact.id} already queued — skip auto-schedule`)
            return
          }
          const body =
            (c.body as string) || (c.text as string) || (c.caption as string) || (c.copy as string) ||
            (artifact.title as string) || ''
          if (!body.trim()) {
            console.log(`[approvals] artifact ${artifact.id} has empty body — skip auto-schedule`)
            return
          }
          const channel =
            (c.channel as string) || (c.platform as string) ||
            inferChannel(artifact.type as string) || 'linkedin'
          const scheduledAt = (c.scheduled_at as string) || new Date(Date.now() + 30 * 60_000).toISOString()
          const mediaUrls = Array.isArray(c.media_urls) ? c.media_urls : []
          const now = new Date().toISOString()
          await sql`
            INSERT INTO scheduled_content (
              id, workspace_id, artifact_id,
              channel, platform,
              content_body, content,
              scheduled_at, scheduled_for,
              media_urls, status, retry_count,
              created_at, updated_at
            ) VALUES (
              ${newId()}, ${workspaceId}, ${artifact.id as string},
              ${channel.toLowerCase()}, ${channel.toLowerCase()},
              ${body}, ${body},
              ${scheduledAt}, ${scheduledAt},
              ${JSON.stringify(mediaUrls)}, 'pending', 0,
              ${now}, ${now}
            )
          `
          console.log(`[approvals] auto-scheduled artifact ${artifact.id} → ${channel} @ ${scheduledAt}`)
          await sql`
            INSERT INTO notifications (id, workspace_id, type, title, body, link, severity, created_at)
            VALUES (
              ${newId()}, ${workspaceId}, 'post_queued',
              ${'Post queued for ' + channel},
              ${'Will publish in 30 minutes — open the calendar to retime or cancel.'},
              ${'/dashboard/calendar'},
              'info',
              ${now}
            )
          `
        } catch (err) {
          console.error('[approvals after()] auto-schedule failed:', err)
        }
      })
    }

    return NextResponse.json({ success: true, status })
  } catch (error) {
    console.error('Approval error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
