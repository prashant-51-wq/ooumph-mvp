import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ user: null })

    const session = verifyToken(token)
    if (!session) return NextResponse.json({ user: null })

    const result = await sql`SELECT id, email, name, is_admin FROM users WHERE id = ${session.userId} LIMIT 1`
    const user = result.rows[0] as { id: string; email: string; name: string; is_admin?: number | string | boolean } | undefined
    if (!user) return NextResponse.json({ user: null })

    // Sprint 16B (audit P0 #3): also return onboarding_completed_at so the
    // dashboard layout can redirect users with no flag set to /onboarding.
    const wsResult = await sql`
      SELECT id, name, onboarding_completed_at FROM workspaces
      WHERE user_id = ${user.id} ORDER BY created_at ASC LIMIT 1
    `
    const workspace = wsResult.rows[0] as {
      id?: string
      name?: string
      onboarding_completed_at?: string | null
    } | undefined

    // Sprint 18N (user-reported: stuck on wizard forever): auto-heal
    // workspaces whose owner already filled the brand profile but
    // never got the onboarding_completed_at timestamp written
    // (pre-Sprint-18N cache-bust bug, or any future PATCH failure).
    // If the brand_profiles row has a non-empty business_name, treat
    // onboarding as complete and backfill the timestamp once so the
    // hook caches the right value on next read.
    let healedOnboardingTs: string | null = workspace?.onboarding_completed_at || null
    if (workspace?.id && !healedOnboardingTs) {
      try {
        const bp = await sql`
          SELECT business_name FROM brand_profiles
          WHERE workspace_id = ${workspace.id} LIMIT 1
        `
        const businessName = (bp.rows[0] as { business_name?: string } | undefined)?.business_name
        if (businessName && businessName.trim().length > 0) {
          const nowIso = new Date().toISOString()
          await sql`
            UPDATE workspaces SET onboarding_completed_at = ${nowIso}
            WHERE id = ${workspace.id} AND onboarding_completed_at IS NULL
          `
          healedOnboardingTs = nowIso
          console.log(`[auth/me] auto-healed onboarding for workspace ${workspace.id}`)
        }
      } catch (err) {
        console.error('[auth/me] onboarding auto-heal failed (non-fatal):', err)
      }
    }

    // Compute isAdmin: column flag OR env allowlist
    const adminEmails = (process.env.SUPER_ADMIN_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
    // Sprint 18R: coercion-tolerant — Neon may return INTEGER as number or string.
    const isAdmin = Number(user.is_admin) === 1 || user.is_admin === true
      || (user.email && adminEmails.includes(user.email.toLowerCase()))

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: !!isAdmin,
        workspaceId: workspace?.id || null,
        workspaceName: workspace?.name || null,
        onboardingCompletedAt: healedOnboardingTs,
      },
    })
  } catch (error) {
    console.error('Auth me error:', error)
    return NextResponse.json({ user: null })
  }
}
