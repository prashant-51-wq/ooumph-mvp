/**
 * lib/adminAudit.ts
 * Tiny helper for recording super-admin actions into `admin_audit_log`.
 * Fire-and-forget — must never throw and must never block the caller.
 *
 * Usage:
 *   await recordAdminAction(req, {
 *     action: 'user.toggle_admin',
 *     resourceType: 'user',
 *     resourceId: targetUserId,
 *     details: { newValue: 1 },
 *   })
 */
import type { NextRequest } from 'next/server'
import { sql } from '@/lib/db'
import { getSessionUserId } from '@/lib/guards'

export interface AdminActionInput {
  action: string
  resourceType?: string | null
  resourceId?: string | null
  details?: Record<string, unknown> | null
}

function genId() {
  return `aal_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export async function recordAdminAction(
  req: NextRequest,
  input: AdminActionInput,
): Promise<void> {
  try {
    const actorId = getSessionUserId(req) || 'admin-secret'
    let actorEmail: string | null = null
    if (actorId !== 'admin-secret') {
      try {
        const u = await sql`SELECT email FROM users WHERE id = ${actorId} LIMIT 1`
        actorEmail = (u.rows[0] as { email?: string } | undefined)?.email || null
      } catch { /* non-fatal */ }
    }
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null

    await sql`
      INSERT INTO admin_audit_log (id, actor_id, actor_email, action, resource_type, resource_id, details_json, ip_address)
      VALUES (
        ${genId()},
        ${actorId},
        ${actorEmail},
        ${input.action},
        ${input.resourceType ?? null},
        ${input.resourceId ?? null},
        ${input.details ? JSON.stringify(input.details) : null},
        ${ip}
      )
    `
  } catch (err) {
    // Audit failure must never break the caller.
    console.error('[adminAudit] failed to record action:', err)
  }
}
