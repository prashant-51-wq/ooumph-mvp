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
    const user = result.rows[0] as { id: string; email: string; name: string; is_admin?: number } | undefined
    if (!user) return NextResponse.json({ user: null })

    const wsResult = await sql`SELECT id, name FROM workspaces WHERE user_id = ${user.id} ORDER BY created_at ASC LIMIT 1`
    const workspace = wsResult.rows[0] as { id?: string; name?: string } | undefined

    // Compute isAdmin: column flag OR env allowlist
    const adminEmails = (process.env.SUPER_ADMIN_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
    const isAdmin = user.is_admin === 1 || (user.email && adminEmails.includes(user.email.toLowerCase()))

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: !!isAdmin,
        workspaceId: workspace?.id || null,
        workspaceName: workspace?.name || null,
      },
    })
  } catch (error) {
    console.error('Auth me error:', error)
    return NextResponse.json({ user: null })
  }
}
