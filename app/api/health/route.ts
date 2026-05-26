/**
 * /api/health
 *
 * Comprehensive system health check. Returns the status of every critical
 * subsystem so a user can see at a glance what's actually working.
 *
 * Pass ?workspaceId=xxx to also test workspace-scoped resources.
 * Pass ?live=1 to also test live external AI providers (slower, costs cents).
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { resolveProviderKey } from '@/lib/secrets'

interface CheckResult {
  name: string
  status: 'ok' | 'warn' | 'fail' | 'skip'
  message: string
  latencyMs?: number
  category: 'db' | 'ai' | 'integrations' | 'security' | 'data'
}

async function timeIt<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now()
  const result = await fn()
  return { result, ms: Date.now() - start }
}

async function check(name: string, category: CheckResult['category'], fn: () => Promise<{ status: CheckResult['status']; message: string }>): Promise<CheckResult> {
  try {
    const { result, ms } = await timeIt(async () => await fn())
    return { name, category, ...result, latencyMs: ms }
  } catch (err) {
    return {
      name,
      category,
      status: 'fail',
      message: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  const live = req.nextUrl.searchParams.get('live') === '1'

  const checks: CheckResult[] = []

  // ─── Database ────────────────────────────────────────────────────────────
  checks.push(await check('Database connection', 'db', async () => {
    const r = await sql`SELECT 1 as one`
    const row = r.rows[0] as { one?: number } | undefined
    if (row?.one === 1) return { status: 'ok', message: process.env.POSTGRES_URL ? 'Neon Postgres reachable' : 'SQLite ready' }
    return { status: 'fail', message: 'Unexpected query result' }
  }))

  checks.push(await check('Workspaces table', 'db', async () => {
    const r = await sql`SELECT COUNT(*) as count FROM workspaces`
    const row = r.rows[0] as { count?: number | string } | undefined
    const count = Number(row?.count || 0)
    return { status: 'ok', message: `${count} workspace${count !== 1 ? 's' : ''} in DB` }
  }))

  checks.push(await check('Brand profiles table', 'db', async () => {
    const r = await sql`SELECT COUNT(*) as count FROM brand_profiles`
    return { status: 'ok', message: `${Number((r.rows[0] as { count?: number } | undefined)?.count || 0)} profiles` }
  }))

  checks.push(await check('Workspace secrets (BYOK)', 'db', async () => {
    const r = await sql`SELECT COUNT(*) as count FROM workspace_secrets`
    const count = Number((r.rows[0] as { count?: number } | undefined)?.count || 0)
    return { status: 'ok', message: `${count} encrypted key${count !== 1 ? 's' : ''} stored` }
  }))

  checks.push(await check('Artifacts table', 'db', async () => {
    const r = await sql`SELECT COUNT(*) as count FROM artifacts`
    return { status: 'ok', message: `${Number((r.rows[0] as { count?: number } | undefined)?.count || 0)} artifacts` }
  }))

  checks.push(await check('Notifications table', 'db', async () => {
    const r = await sql`SELECT COUNT(*) as count FROM notifications`
    return { status: 'ok', message: `${Number((r.rows[0] as { count?: number } | undefined)?.count || 0)} notifications` }
  }))

  checks.push(await check('A/B tests table', 'db', async () => {
    const r = await sql`SELECT COUNT(*) as count FROM ab_tests`
    return { status: 'ok', message: `${Number((r.rows[0] as { count?: number } | undefined)?.count || 0)} A/B tests` }
  }))

  checks.push(await check('Workflows table', 'db', async () => {
    const r = await sql`SELECT COUNT(*) as count FROM workflows`
    return { status: 'ok', message: `${Number((r.rows[0] as { count?: number } | undefined)?.count || 0)} workflows` }
  }))

  // ─── AI Providers (key presence — shared keys from env or workspace) ─────
  const providers = [
    { slug: 'anthropic', envName: 'ANTHROPIC_API_KEY', label: 'Anthropic (Claude)' },
    { slug: 'openai', envName: 'OPENAI_API_KEY', label: 'OpenAI (GPT-4o, DALL-E)' },
    { slug: 'elevenlabs', envName: 'ELEVENLABS_API_KEY', label: 'ElevenLabs (voice)' },
    { slug: 'runway', envName: 'RUNWAY_API_KEY', label: 'Runway (video)' },
    { slug: 'replicate', envName: 'REPLICATE_API_TOKEN', label: 'Replicate' },
    { slug: 'stability', envName: 'STABILITY_API_KEY', label: 'Stability AI' },
    { slug: 'resend', envName: 'RESEND_API_KEY', label: 'Resend (transactional email)' },
  ]
  for (const p of providers) {
    checks.push(await check(p.label, 'ai', async () => {
      // Workspace BYOK first
      if (workspaceId) {
        const wsKey = await resolveProviderKey(workspaceId, p.slug as 'openai' | 'anthropic' | 'elevenlabs' | 'stability' | 'replicate' | 'runway' | 'resend' | 'gemini' | 'kling')
        if (wsKey) return { status: 'ok', message: 'Key configured (BYOK)' }
      }
      // Env fallback
      const envKey = process.env[p.envName]
      if (envKey && envKey.length > 8) return { status: 'ok', message: 'Key configured (env)' }
      return { status: 'warn', message: 'No key configured — provider will not work' }
    }))
  }

  // ─── Optional: Live AI provider ping ─────────────────────────────────────
  if (live) {
    checks.push(await check('Anthropic live ping', 'ai', async () => {
      const key = workspaceId ? await resolveProviderKey(workspaceId, 'anthropic') : process.env.ANTHROPIC_API_KEY
      if (!key) return { status: 'skip', message: 'No key configured' }
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-3-5-haiku-20241022', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      })
      if (r.status === 200) return { status: 'ok', message: 'Anthropic API responded' }
      return { status: 'fail', message: `Anthropic returned ${r.status}` }
    }))

    checks.push(await check('OpenAI live ping', 'ai', async () => {
      const key = workspaceId ? await resolveProviderKey(workspaceId, 'openai') : process.env.OPENAI_API_KEY
      if (!key) return { status: 'skip', message: 'No key configured' }
      const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } })
      if (r.ok) return { status: 'ok', message: 'OpenAI API responded' }
      return { status: 'fail', message: `OpenAI returned ${r.status}` }
    }))
  }

  // ─── Security ────────────────────────────────────────────────────────────
  checks.push(await check('AUTH_SECRET', 'security', async () => {
    const secret = process.env.AUTH_SECRET
    if (!secret) return { status: 'fail', message: 'Not set — sessions insecure' }
    if (secret === 'ooumph-dev-secret-change-in-production') {
      return { status: 'warn', message: 'Using dev default — change in production' }
    }
    if (secret.length < 32) return { status: 'warn', message: 'Short key — recommended ≥32 chars' }
    return { status: 'ok', message: 'Configured' }
  }))

  checks.push(await check('ADMIN_SECRET', 'security', async () => {
    const v = process.env.ADMIN_SECRET
    if (!v) return { status: 'warn', message: 'Not set — internal cron/admin bypass disabled' }
    return { status: 'ok', message: 'Configured' }
  }))

  checks.push(await check('SUPER_ADMIN_EMAILS', 'security', async () => {
    const emails = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)
    const adminUserRes = await sql`SELECT COUNT(*) as count FROM users WHERE is_admin = 1`
    const adminUsers = Number((adminUserRes.rows[0] as { count?: number } | undefined)?.count || 0)
    const total = emails.length + adminUsers
    if (total === 0) return { status: 'warn', message: 'No super admins — Super Admin dashboard is locked to everyone' }
    return { status: 'ok', message: `${total} super admin${total !== 1 ? 's' : ''} (${emails.length} via env, ${adminUsers} via DB)` }
  }))

  // ─── Workspace-scoped data (only if workspaceId provided) ────────────────
  if (workspaceId) {
    checks.push(await check('Your workspace exists', 'data', async () => {
      const r = await sql`SELECT id, name, created_at FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
      const row = r.rows[0] as { id?: string; name?: string; created_at?: string } | undefined
      if (!row?.id) return { status: 'fail', message: 'Workspace not found' }
      return { status: 'ok', message: `${row.name} (created ${row.created_at?.slice(0, 10)})` }
    }))

    checks.push(await check('Brand profile saved', 'data', async () => {
      const r = await sql`SELECT business_name, tone FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
      const row = r.rows[0] as { business_name?: string; tone?: string } | undefined
      if (!row?.business_name) return { status: 'warn', message: 'No brand profile — finish onboarding' }
      return { status: 'ok', message: `${row.business_name}${row.tone ? ` · ${String(row.tone).slice(0, 40)}` : ''}` }
    }))

    checks.push(await check('Workspace contacts (CRM)', 'data', async () => {
      const r = await sql`SELECT COUNT(*) as count FROM leads_captured WHERE workspace_id = ${workspaceId}`
      return { status: 'ok', message: `${Number((r.rows[0] as { count?: number } | undefined)?.count || 0)} contacts` }
    }))

    checks.push(await check('Workspace artifacts', 'data', async () => {
      const r = await sql`SELECT COUNT(*) as count, type FROM artifacts WHERE workspace_id = ${workspaceId} GROUP BY type`
      const rows = r.rows as Array<{ count: number; type: string }>
      if (rows.length === 0) return { status: 'warn', message: 'No artifacts yet — run an agent to create one' }
      const summary = rows.map(r => `${r.type}: ${r.count}`).join(', ')
      return { status: 'ok', message: summary }
    }))

    checks.push(await check('Pending approvals', 'data', async () => {
      const r = await sql`SELECT COUNT(*) as count FROM approvals WHERE workspace_id = ${workspaceId} AND status = 'pending'`
      return { status: 'ok', message: `${Number((r.rows[0] as { count?: number } | undefined)?.count || 0)} pending` }
    }))

    checks.push(await check('Agent runs this week', 'data', async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
      const r = await sql`SELECT COUNT(*) as count, SUM(cost_estimate) as cost FROM agent_runs WHERE workspace_id = ${workspaceId} AND created_at >= ${weekAgo}`
      const row = r.rows[0] as { count?: number; cost?: number } | undefined
      const runs = Number(row?.count || 0)
      const cost = Number(row?.cost || 0).toFixed(4)
      return { status: 'ok', message: `${runs} runs · $${cost} spent` }
    }))

    checks.push(await check('Workspace BYOK keys', 'data', async () => {
      const r = await sql`SELECT provider FROM workspace_secrets WHERE workspace_id = ${workspaceId}`
      const rows = r.rows as Array<{ provider: string }>
      if (rows.length === 0) return { status: 'warn', message: 'No BYOK keys — using shared keys' }
      return { status: 'ok', message: rows.map(r => r.provider).join(', ') }
    }))
  }

  const totals = {
    ok: checks.filter(c => c.status === 'ok').length,
    warn: checks.filter(c => c.status === 'warn').length,
    fail: checks.filter(c => c.status === 'fail').length,
    skip: checks.filter(c => c.status === 'skip').length,
  }

  const overall: 'ok' | 'warn' | 'fail' =
    totals.fail > 0 ? 'fail' : totals.warn > 0 ? 'warn' : 'ok'

  return NextResponse.json({
    overall,
    totals,
    checks,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    deploymentTarget: process.env.VERCEL_ENV || 'local',
  })
}
