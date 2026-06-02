/**
 * Cron: /api/cron/auto-approve
 *
 * Sprint 6H — completes the autonomy story alongside daily-brief.
 *
 * The /dashboard/approvals page already supports auto-approve, but it
 * only runs CLIENT-SIDE — meaning approvals only fire while the user has
 * the page open. If the operator goes to bed at 9pm with 3 drafts in the
 * queue and a 24h auto-approve set, those drafts only approve when they
 * next open the dashboard. That defeats the "AI agency that works for
 * you 24/7" promise.
 *
 * This cron runs the same auto-approve logic server-side, hourly. For
 * each workspace it reads workspaces.extra_settings JSON for:
 *   - auto_approve_delay:    'off' | '24h' | '48h' | '72h'
 *   - auto_approve_min_score: number (0-100, default 80)
 *
 * Approves pending approvals that are:
 *   - Older than the delay threshold
 *   - Have brand_voice_score >= min_score (so off-voice content never
 *     auto-approves regardless of how long it sits)
 *
 * Calls /api/approvals PATCH per approval so all the existing side
 * effects fire (publish-on-approve, strategy decomposition,
 * confirmation emails). The PATCH endpoint doesn't enforce ownership,
 * so no special auth needed — but we still respect per-workspace
 * agent pause: if the 'cmo' agent is paused, that workspace is skipped.
 *
 * Schedule: 0 * * * * (top of every hour) — matched to /dashboard/approvals
 * client-side cadence (1 minute polling) so the operator's perceived
 * experience is "queue clears within an hour" rather than "next login".
 *
 * Auth: bearer ${CRON_SECRET}. Falls open in dev.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { isAgentActive } from '@/lib/agents'

export const runtime = 'nodejs'
export const maxDuration = 300

const DELAY_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '48h': 48 * 60 * 60 * 1000,
  '72h': 72 * 60 * 60 * 1000,
}
const DEFAULT_MIN_SCORE = 80
const PER_WORKSPACE_LIMIT = 20  // cap how many approvals we fire per workspace per tick

interface WorkspaceRow {
  id: string
  extra_settings: string | null
}
interface ApprovalRow {
  id: string
  brand_voice_score: number | null
  created_at: string
}
interface ResultRow {
  workspaceId: string
  status: 'approved' | 'skipped_off' | 'skipped_paused' | 'skipped_no_settings' | 'failed'
  approvedCount?: number
  error?: string
  partialError?: string
}

function authCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || ''
  if (!secret) {
    // Sprint 18Z (audit pass #8 P1 #7): in production a missing
    // CRON_SECRET previously fell open (returned true) and silently
    // auto-approved every workspace's queue. Now fail-closed in prod
    // to match the AUTH_SECRET boot-fail policy from Sprint 18A.
    if (process.env.NODE_ENV === 'production') return false
    return true  // dev mode — convenience only
  }
  return req.headers.get('authorization') === `Bearer ${secret}`
}

function parseSettings(raw: string | null): { delay: string; minScore: number } {
  if (!raw) return { delay: 'off', minScore: DEFAULT_MIN_SCORE }
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const delay = typeof obj.auto_approve_delay === 'string' ? obj.auto_approve_delay : 'off'
    const minScore = typeof obj.auto_approve_min_score === 'number'
      ? obj.auto_approve_min_score
      : DEFAULT_MIN_SCORE
    return { delay, minScore }
  } catch {
    return { delay: 'off', minScore: DEFAULT_MIN_SCORE }
  }
}

export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }

async function run(req: NextRequest) {
  if (!authCron(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

  // All workspaces with extra_settings (skip the rest — they haven't
  // configured auto-approve so there's nothing to do).
  const wsRes = await sql`
    SELECT id, extra_settings FROM workspaces
    WHERE COALESCE(status, 'active') = 'active'
      AND extra_settings IS NOT NULL
      AND extra_settings <> '{}'
    ORDER BY created_at ASC LIMIT 500
  `
  const workspaces = wsRes.rows as unknown as WorkspaceRow[]

  const results: ResultRow[] = []
  const now = Date.now()

  for (const ws of workspaces) {
    const { delay, minScore } = parseSettings(ws.extra_settings)
    if (delay === 'off' || !DELAY_MS[delay]) {
      results.push({ workspaceId: ws.id, status: 'skipped_off' })
      continue
    }

    // Respect agent pause — if the operator paused 'cmo', they don't want
    // ANY autonomous action including auto-approve.
    let cmoActive: boolean
    try {
      cmoActive = await isAgentActive(ws.id, 'cmo')
    } catch {
      cmoActive = true   // fail-open on agent-table issues; better to act
    }
    if (!cmoActive) {
      results.push({ workspaceId: ws.id, status: 'skipped_paused' })
      continue
    }

    const threshold = DELAY_MS[delay]
    const cutoffISO = new Date(now - threshold).toISOString()

    // Find pending approvals older than the cutoff with a passing brand
    // voice score. The brand_voice_score column is populated by the
    // approvals page after Claude scores each item — items still nullable
    // are skipped (we don't auto-approve unscored content).
    const candidatesRes = await sql`
      SELECT id, brand_voice_score, created_at
      FROM approvals
      WHERE workspace_id = ${ws.id}
        AND status = 'pending'
        AND created_at <= ${cutoffISO}
        AND brand_voice_score IS NOT NULL
        AND brand_voice_score >= ${minScore}
      ORDER BY created_at ASC LIMIT ${PER_WORKSPACE_LIMIT}
    `
    const candidates = candidatesRes.rows as unknown as ApprovalRow[]
    if (candidates.length === 0) {
      results.push({ workspaceId: ws.id, status: 'approved', approvedCount: 0 })
      continue
    }

    let approvedCount = 0
    let lastError: string | undefined
    for (const c of candidates) {
      try {
        // Call /api/approvals PATCH internally so all the side effects
        // (publish-on-approve, strategy decomposition, confirmation email)
        // fire exactly as they do on the UI path. Use a stable note string
        // so audit can distinguish cron vs human approvals.
        const res = await fetch(`${baseUrl}/api/approvals`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.CRON_SECRET ? { 'x-internal-secret': process.env.CRON_SECRET } : {}),
          },
          body: JSON.stringify({
            approvalId: c.id,
            action: 'approve',
            notes: `Auto-approved by server cron — voice score ${c.brand_voice_score ?? 'n/a'}, threshold ${delay} elapsed.`,
            workspaceId: ws.id,
          }),
        })
        if (!res.ok) {
          lastError = `approval ${c.id.slice(0, 8)}: HTTP ${res.status}`
          continue
        }
        approvedCount++
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }

    if (approvedCount > 0) {
      // Sprint 18L (audit #6 P1): if SOME succeeded but a `lastError`
      // also fired, the previous logic reported pure 'approved' status
      // and silently lost the partial failure. Fan it out to the bell
      // through notifyAgentRunFailed so operators see the diagnostic.
      if (lastError) {
        try {
          const { notifyAgentRunFailed } = await import('@/lib/notifications')
          await notifyAgentRunFailed(
            ws.id,
            'auto-approve cron',
            `Approved ${approvedCount} item${approvedCount === 1 ? '' : 's'}, but at least one failed — ${lastError}`,
          )
        } catch { /* notification miss is non-fatal */ }
      }
      results.push({ workspaceId: ws.id, status: 'approved', approvedCount, partialError: lastError })
    } else if (lastError) {
      try {
        const { notifyAgentRunFailed } = await import('@/lib/notifications')
        await notifyAgentRunFailed(ws.id, 'auto-approve cron', lastError)
      } catch { /* */ }
      results.push({ workspaceId: ws.id, status: 'failed', error: lastError })
    } else {
      results.push({ workspaceId: ws.id, status: 'approved', approvedCount: 0 })
    }
  }

  return NextResponse.json({
    ok: true,
    workspacesScanned: workspaces.length,
    results,
    timestamp: new Date().toISOString(),
  })
}
