/**
 * GET  /api/admin/workspaces  — list ALL workspaces across the platform
 * POST /api/admin/workspaces  — impersonate a workspace (generate a temp session token)
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

function requireAdmin(req: NextRequest): boolean {
  const secret = req.headers.get('x-admin-secret') || new URL(req.url).searchParams.get('adminSecret')
  return secret === process.env.ADMIN_SECRET
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    const result = search
      ? await sql`
          SELECT w.*, p.name as plan_name, p.slug as plan_slug, s.status as sub_status, s.current_period_end
          FROM workspaces w
          LEFT JOIN subscriptions s ON s.workspace_id = w.id
          LEFT JOIN plans p ON p.id = s.plan_id
          WHERE w.name ILIKE ${'%' + search + '%'} OR w.owner_email ILIKE ${'%' + search + '%'}
          ORDER BY w.created_at DESC LIMIT ${limit}
        `
      : await sql`
          SELECT w.*, p.name as plan_name, p.slug as plan_slug, s.status as sub_status, s.current_period_end
          FROM workspaces w
          LEFT JOIN subscriptions s ON s.workspace_id = w.id
          LEFT JOIN plans p ON p.id = s.plan_id
          ORDER BY w.created_at DESC LIMIT ${limit}
        `
    return NextResponse.json(result.rows)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { workspaceId, action } = await req.json() as { workspaceId: string; action: 'impersonate' | 'delete' }

    if (action === 'impersonate') {
      // Return workspace details that the admin UI can use to set localStorage
      const wsResult = await sql`
        SELECT w.*, p.name as plan_name, p.slug as plan_slug
        FROM workspaces w
        LEFT JOIN subscriptions s ON s.workspace_id = w.id
        LEFT JOIN plans p ON p.id = s.plan_id
        WHERE w.id = ${workspaceId} LIMIT 1
      `
      const ws = wsResult.rows[0]
      if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

      return NextResponse.json({
        ok: true,
        impersonateData: {
          workspaceId: String(ws.id),
          businessName: String(ws.name || ''),
          ownerEmail: String(ws.owner_email || ''),
          planSlug: String(ws.plan_slug || 'free'),
        },
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
