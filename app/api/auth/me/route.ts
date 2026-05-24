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

    const result = await sql`SELECT id, email, name FROM users WHERE id = ${session.userId} LIMIT 1`
    const user = result.rows[0] as { id: string; email: string; name: string } | undefined
    if (!user) return NextResponse.json({ user: null })

    const wsResult = await sql`SELECT id, name FROM workspaces WHERE user_id = ${user.id} ORDER BY created_at ASC LIMIT 1`
    const workspace = wsResult.rows[0] as { id?: string; name?: string } | undefined

    return NextResponse.json({ user: { ...user, workspaceId: workspace?.id || null, workspaceName: workspace?.name || null } })
  } catch (error) {
    console.error('Auth me error:', error)
    return NextResponse.json({ user: null })
  }
}
