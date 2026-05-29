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

/**
 * Sprint 18E (P0) — workspace-level notification opt-outs.
 *
 * Notification toggle prefs are persisted in workspaces.extra_settings JSON,
 * shape:
 *   {
 *     notifications: {
 *       inApp: { approvals, agentTasks, campaigns, errors, newLeads, weeklySummary },
 *       email: { ... same keys ... },
 *       frequency: 'realtime' | 'hourly' | 'daily' | 'off',
 *     }
 *   }
 *
 * We check the in-app toggle for the relevant key before inserting. Missing
 * keys default to ENABLED — we never block a notification because of an
 * unset preference, only because the user explicitly toggled it off. The
 * full-off frequency ('off') is also honoured as a master kill switch.
 *
 * Each notify* helper maps to one preference key:
 *   notifyLeadCaptured         → newLeads
 *   notifyPublishSuccess       → campaigns
 *   notifyPublishFailed        → errors
 *   notifyNurtureReplyReceived → campaigns
 *   notifyOAuthExpiring        → errors
 */
type NotifKey = 'approvals' | 'agentTasks' | 'campaigns' | 'errors' | 'newLeads' | 'weeklySummary'

interface NotificationPrefs {
  inApp?: Partial<Record<NotifKey, boolean>>
  email?: Partial<Record<NotifKey, boolean>>
  frequency?: 'realtime' | 'hourly' | 'daily' | 'off'
}

async function isNotificationEnabled(
  workspaceId: string,
  prefKey: NotifKey,
): Promise<boolean> {
  try {
    const res = await sql`
      SELECT extra_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1
    `
    const row = res.rows[0] as { extra_settings?: unknown } | undefined
    if (!row) return true // unknown workspace → don't block
    let parsed: Record<string, unknown> = {}
    const raw = row.extra_settings
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw) as Record<string, unknown> } catch { parsed = {} }
    } else if (raw && typeof raw === 'object') {
      parsed = raw as Record<string, unknown>
    }
    const prefs = (parsed.notifications || {}) as NotificationPrefs
    // Master switch: frequency 'off' silences in-app too.
    if (prefs.frequency === 'off') return false
    const inApp = prefs.inApp
    if (!inApp || typeof inApp !== 'object') return true // unset → default enabled
    const v = inApp[prefKey]
    if (v === undefined) return true // unset specific key → default enabled
    return Boolean(v)
  } catch (err) {
    // Pref lookup failure must not silently drop notifications.
    console.error('[notifications] pref lookup failed (defaulting on):', err)
    return true
  }
}

async function safeInsert(
  workspaceId: string,
  type: string,
  title: string,
  body: string | null,
  link: string | null,
  severity: 'info' | 'success' | 'warning' | 'error',
  prefKey: NotifKey,
): Promise<void> {
  // Sprint 18E (P0): respect workspace opt-out before inserting.
  const enabled = await isNotificationEnabled(workspaceId, prefKey)
  if (!enabled) return
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
    'newLeads',
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
    'errors',
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
    'campaigns',
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
    'campaigns',
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
    'errors',
  )
}

/**
 * Sprint 18H — agent failure + budget alert helpers, completing the set
 * referenced by audit pass #5. notifyAgentRunFailed pairs with the
 * agent_runs.status='failed' cron sweep so the bell explicitly raises
 * a 🔴 instead of relying on the derived /api/notifications join (which
 * caps at 5 and silently drops older failures).
 */
export function notifyAgentRunFailed(
  workspaceId: string,
  agentName: string,
  errMsg: string,
  runId?: string,
): Promise<void> {
  return safeInsert(
    workspaceId,
    'agent_run_failed',
    `${agentName} failed`,
    errMsg.slice(0, 480),
    runId ? `/dashboard/activity?run=${runId}` : '/dashboard/activity',
    'error',
    'agentTasks',
  )
}

/**
 * Sprint 18H — fired by the ad-platform cost watcher when a campaign's
 * spend crosses 80 / 100% of the configured daily / monthly cap. Severity
 * escalates with the percentage.
 */
export function notifyBudgetAlert(
  workspaceId: string,
  campaignName: string,
  percent: number,
  scope: 'daily' | 'monthly' = 'daily',
): Promise<void> {
  const pct = Math.round(percent)
  const sev: 'warning' | 'error' = pct >= 100 ? 'error' : 'warning'
  return safeInsert(
    workspaceId,
    'budget_alert',
    `${campaignName} hit ${pct}% of ${scope} budget`,
    pct >= 100
      ? 'Campaign auto-paused — raise the cap or wait for the next window to resume.'
      : 'Approaching the cap — review pacing before it auto-pauses.',
    '/dashboard/ads',
    sev,
    'errors',
  )
}
