/**
 * Sprint 15B (P0 #7) — Producer-side notification helpers.
 *
 * The audit found that `notifications` rows were only DERIVED at read-time
 * in /api/notifications (approvals, agent_runs, recent activity). That meant
 * three classes of events never reached the bell:
 *
 *   - Publish failures (terminal after 3 retries)
 *   - New lead captured (any inbound channel)
 *   - Lead replied to a nurture sequence
 *   - OAuth token expiry (deferred to future sprint)
 *
 * These helpers wrap the INSERT so call sites don't repeat boilerplate. All
 * helpers are non-throwing — a notification miss must never break the actual
 * business action that triggered it.
 */
import { sql, newId } from '@/lib/db'

async function safeInsert(
  workspaceId: string,
  type: string,
  title: string,
  body: string | null,
  link: string | null,
  severity: 'info' | 'success' | 'warning' | 'error',
): Promise<void> {
  try {
    await sql`
      INSERT INTO notifications (id, workspace_id, type, title, body, link, severity, created_at)
      VALUES (
        ${newId()}, ${workspaceId}, ${type},
        ${title.slice(0, 200)},
        ${body ? body.slice(0, 500) : null},
        ${link},
        ${severity},
        ${new Date().toISOString()}
      )
    `
  } catch (err) {
    // Non-fatal — the business action must not be aborted because the
    // notification table happens to be unavailable.
    console.error(`[notifications] insert failed (type=${type}):`, err)
  }
}

export function notifyLeadCaptured(
  workspaceId: string,
  leadId: string,
  identity: string,
  source: string,
): Promise<void> {
  return safeInsert(
    workspaceId,
    'lead_captured',
    `New lead: ${identity}`,
    `Captured from ${source}.`,
    `/dashboard/leads-crm?lead=${leadId}`,
    'success',
  )
}

export function notifyPublishFailed(
  workspaceId: string,
  channel: string | null,
  errMsg: string,
): Promise<void> {
  return safeInsert(
    workspaceId,
    'publish_failed',
    `Publish failed${channel ? ` on ${channel}` : ''}`,
    errMsg,
    '/dashboard/calendar',
    'error',
  )
}

/**
 * Sprint 17D (audit P1 #17) — companion to notifyPublishFailed.
 * Producer-side success notification fired after the publish cron
 * confirms a post went live. Links to the native permalink when one
 * is available (so the user can hop directly to LinkedIn / X / etc.),
 * otherwise back to /dashboard/calendar.
 */
export function notifyPublishSuccess(
  workspaceId: string,
  channel: string | null,
  permalink: string | null,
): Promise<void> {
  return safeInsert(
    workspaceId,
    'post_published',
    `Post published${channel ? ` on ${channel}` : ''}`,
    permalink ? `Live at ${permalink}` : 'Live now.',
    permalink || '/dashboard/calendar',
    'success',
  )
}

export function notifyNurtureReplyReceived(
  workspaceId: string,
  leadEmail: string,
  cancelledSteps: number,
): Promise<void> {
  return safeInsert(
    workspaceId,
    'nurture_reply',
    `${leadEmail} replied`,
    `Cancelled ${cancelledSteps} pending sequence step${cancelledSteps === 1 ? '' : 's'}.`,
    '/dashboard/inbox',
    'info',
  )
}

export function notifyOAuthExpiring(
  workspaceId: string,
  platform: string,
  daysLeft: number,
): Promise<void> {
  return safeInsert(
    workspaceId,
    'oauth_expiring',
    `${platform} token expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    'Reconnect to keep auto-publish working.',
    '/dashboard/integrations',
    daysLeft <= 2 ? 'error' : 'warning',
  )
}
