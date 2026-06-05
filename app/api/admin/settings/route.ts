/**
 * /api/admin/settings
 *   GET   — current platform settings + env presence
 *   PATCH — update feature_flags / maintenance_mode (stored in platform_settings key/value table)
 * Gated by assertSuperAdmin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertSuperAdmin } from '@/lib/guards'
import { recordAdminAction } from '@/lib/adminAudit'

const KNOWN_ENV_VARS = [
  'DATABASE_URL', 'POSTGRES_URL', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'ADMIN_SECRET', 'CRON_SECRET',
  'SUPER_ADMIN_EMAILS', 'NEXT_PUBLIC_APP_URL', 'COOKIE_SECRET',
  'RESEND_API_KEY', 'POSTMARK_API_KEY',
]

async function getSetting(key: string): Promise<string | null> {
  try {
    const r = await sql`SELECT value FROM platform_settings WHERE key = ${key} LIMIT 1`
    return (r.rows[0] as { value?: string } | undefined)?.value ?? null
  } catch { return null }
}

async function setSetting(key: string, value: string): Promise<void> {
  // Upsert that works on both PG and SQLite without unique-violation. Delete-then-insert is safe with a PK.
  await sql`DELETE FROM platform_settings WHERE key = ${key}`
  await sql`INSERT INTO platform_settings (key, value) VALUES (${key}, ${value})`
}

export async function GET(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied
  try {
    const [maintRaw, flagsRaw] = await Promise.all([
      getSetting('maintenance_mode'),
      getSetting('feature_flags'),
    ])
    let featureFlags: Record<string, boolean> = {}
    if (flagsRaw) {
      try { featureFlags = JSON.parse(flagsRaw) as Record<string, boolean> } catch { /* default empty */ }
    }
    const envStatus = KNOWN_ENV_VARS.map(key => ({
      key,
      set: !!(process.env[key] && process.env[key]!.length > 0),
    }))
    return NextResponse.json({
      maintenanceMode: maintRaw === '1' || maintRaw === 'true',
      featureFlags,
      envStatus,
    })
  } catch (err) {
    console.error('[admin/settings GET] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json() as { maintenanceMode?: boolean; featureFlags?: Record<string, boolean> }
    const updated: Record<string, unknown> = {}

    if (typeof body.maintenanceMode === 'boolean') {
      await setSetting('maintenance_mode', body.maintenanceMode ? '1' : '0')
      updated.maintenanceMode = body.maintenanceMode
    }
    if (body.featureFlags && typeof body.featureFlags === 'object') {
      // Merge with existing flags so partial updates work.
      const cur = await getSetting('feature_flags')
      let curObj: Record<string, boolean> = {}
      if (cur) {
        try { curObj = JSON.parse(cur) as Record<string, boolean> } catch { /* default empty */ }
      }
      const next = { ...curObj, ...body.featureFlags }
      await setSetting('feature_flags', JSON.stringify(next))
      updated.featureFlags = next
    }

    await recordAdminAction(req, {
      action: 'platform_settings.update',
      resourceType: 'platform_settings',
      details: updated,
    })

    return NextResponse.json({ ok: true, updated })
  } catch (err) {
    console.error('[admin/settings PATCH] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
