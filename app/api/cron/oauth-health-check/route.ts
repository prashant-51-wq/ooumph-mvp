/**
 * /api/cron/oauth-health-check — Sprint 16D (audit P1 #12)
 *
 * Producer for `notifyOAuthExpiring`. The audit found the helper existed in
 * lib/notifications.ts since Sprint 15B but had zero callers — the bell
 * never lit up for soon-to-expire OAuth tokens, leading to silent publish
 * failures the user couldn't anticipate.
 *
 * Sweep:
 *   - Pull oauth_tokens rows with status='active' AND expires_at set.
 *   - For each token: if expires_at is within 5 days, fire a warning;
 *     within 2 days, fire an error.
 *   - Dedup: a notification of type='oauth_expiring' for the same
 *     workspace+platform within the last 18 hours suppresses re-fire.
 *
 * Runs every 6 hours via vercel.json. Costs nothing when no integrations
 * exist (returns immediately).
 *
 * Auth: CRON_SECRET / Vercel Cron header.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { notifyOAuthExpiring } from '@/lib/notifications'

export const runtime = 'nodejs'
export const maxDuration = 300

function isCronAuthorized(req: NextRequest): boolean {
  // Sprint 18Z: UA-only auth removed — User-Agent is client-spoofable.
  // Rely on Vercel Cron's automatic Authorization: Bearer ${CRON_SECRET}.
  const cronSecret = process.env.CRON_SECRET || ''
  const adminSecret = process.env.ADMIN_SECRET || ''
  const auth = req.headers.get('authorization') || ''
  const x = req.headers.get('x-internal-secret') || ''
  if (cronSecret && (auth === `Bearer ${cronSecret}` || x === cronSecret)) return true
  if (adminSecret && (auth === `Bearer ${adminSecret}` || x === adminSecret)) return true
  return false
}

interface TokenRow {
  workspace_id: string
  platform: string
  expires_at: string
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return handleSweep()
}
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return handleSweep()
}

async function handleSweep() {
  // Look ahead 5 days. Tokens beyond that horizon are healthy.
  const now = Date.now()
  const horizonIso = new Date(now + 5 * 24 * 3600_000).toISOString()

  let rows: TokenRow[] = []
  try {
    const res = await sql`
      SELECT workspace_id, platform, expires_at
      FROM oauth_tokens
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ${horizonIso}
      ORDER BY expires_at ASC LIMIT 200
    `
    rows = (res.rows || []) as unknown as TokenRow[]
  } catch (err) {
    // oauth_tokens may not exist on a fresh install.
    console.error('[oauth-health-check] oauth_tokens query failed:', err)
    return NextResponse.json({ ok: true, checked: 0, notified: 0, skipped: 'no_table' })
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, notified: 0 })
  }

  // Pull recent oauth_expiring notifications for dedup (last 18h window).
  const dedupSince = new Date(now - 18 * 3600_000).toISOString()
  const notifRes = await sql`
    SELECT workspace_id, title FROM notifications
    WHERE type = 'oauth_expiring' AND created_at >= ${dedupSince}
  `
  const seen = new Set<string>()
  for (const n of notifRes.rows as { workspace_id?: string; title?: string }[]) {
    // Title shape: "<Platform> token expires in N day(s)" — we key on
    // workspace+platform-substring to suppress reruns.
    const m = (n.title || '').match(/^(\S+) token/i)
    if (m && n.workspace_id) seen.add(`${n.workspace_id}|${m[1].toLowerCase()}`)
  }

  let notified = 0
  for (const t of rows) {
    const key = `${t.workspace_id}|${t.platform.toLowerCase()}`
    if (seen.has(key)) continue
    const exp = new Date(t.expires_at).getTime()
    if (Number.isNaN(exp)) continue
    const daysLeft = Math.max(0, Math.ceil((exp - now) / 86400_000))
    await notifyOAuthExpiring(t.workspace_id, t.platform, daysLeft)
    notified++
  }
  return NextResponse.json({ ok: true, checked: rows.length, notified })
}
