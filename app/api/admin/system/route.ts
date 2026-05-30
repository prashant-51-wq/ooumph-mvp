/**
 * GET /api/admin/system
 * System health — cron schedules (from vercel.json), DB row counts, recent errors, env var presence.
 * Gated by assertSuperAdmin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertSuperAdmin } from '@/lib/guards'
import { readFileSync } from 'fs'
import path from 'path'

interface VercelCron { path: string; schedule: string }

const CRITICAL_ENV_VARS = [
  'DATABASE_URL', 'POSTGRES_URL', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'ADMIN_SECRET', 'CRON_SECRET',
  'SUPER_ADMIN_EMAILS', 'NEXT_PUBLIC_APP_URL', 'COOKIE_SECRET',
  'RESEND_API_KEY', 'POSTMARK_API_KEY', 'AWS_ACCESS_KEY_ID',
]

function n(v: unknown): number { return Number(v ?? 0) || 0 }

async function safeCount(query: () => Promise<{ rows: Array<{ c?: number | string }> }>): Promise<number | null> {
  try {
    const r = await query()
    return n(r.rows[0]?.c)
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied

  try {
    // Cron schedules from vercel.json
    let crons: VercelCron[] = []
    try {
      const raw = readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8')
      const parsed = JSON.parse(raw) as { crons?: VercelCron[] }
      crons = parsed.crons || []
    } catch (err) {
      console.error('[admin/system] failed to read vercel.json:', err)
    }

    // DB row counts
    const counts = {
      users: await safeCount(() => sql`SELECT COUNT(*)::int as c FROM users`),
      workspaces: await safeCount(() => sql`SELECT COUNT(*)::int as c FROM workspaces`),
      artifacts: await safeCount(() => sql`SELECT COUNT(*)::int as c FROM artifacts`),
      approvals: await safeCount(() => sql`SELECT COUNT(*)::int as c FROM approvals`),
      agent_runs: await safeCount(() => sql`SELECT COUNT(*)::int as c FROM agent_runs`),
      notifications: await safeCount(() => sql`SELECT COUNT(*)::int as c FROM notifications`),
      subscriptions: await safeCount(() => sql`SELECT COUNT(*)::int as c FROM subscriptions`),
      publish_log: await safeCount(() => sql`SELECT COUNT(*)::int as c FROM publish_log`),
    }

    // Recent errors — try system_performance_audits first, fall back to agent_runs failures
    let recentErrors: Array<{ source: string; message: string; created_at: string; workspace_id?: string }> = []
    try {
      const perf = await sql`
        SELECT operation_name as source, error_captured as message, created_at, workspace_id
        FROM system_performance_audits
        WHERE status != 'ok' AND error_captured IS NOT NULL
        ORDER BY created_at DESC LIMIT 25
      `
      recentErrors = perf.rows as typeof recentErrors
    } catch { /* table might not exist on some envs */ }

    if (recentErrors.length < 25) {
      try {
        const need = 25 - recentErrors.length
        const fails = await sql`
          SELECT agent_name as source, error_message as message, created_at, workspace_id
          FROM agent_runs WHERE status = 'failed' AND error_message IS NOT NULL
          ORDER BY created_at DESC LIMIT ${need}
        `
        recentErrors = recentErrors.concat(fails.rows as typeof recentErrors)
      } catch { /* skip */ }
    }

    // Env var presence (key only, never value)
    const envStatus = CRITICAL_ENV_VARS.map(key => ({
      key,
      set: !!(process.env[key] && process.env[key]!.length > 0),
    }))

    return NextResponse.json({
      crons,
      counts,
      recentErrors,
      envStatus,
      uptime: process.uptime ? Math.round(process.uptime()) : null,
      nodeVersion: process.version,
    })
  } catch (err) {
    console.error('[admin/system] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
