/**
 * GET /api/admin/commissions — commission ledger with filters
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertSuperAdmin } from '@/lib/guards'

export async function GET(req: NextRequest) {
  // Sprint 18T: accept BOTH x-admin-secret (CI/cron) AND session-cookie
  // super-admin via assertSuperAdmin. Replaces the header-only requireAdmin
  // so the browser-side Revenue page can authenticate via its session cookie.
  const denied = await assertSuperAdmin(req)
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const vendorWorkspaceId = searchParams.get('vendorWorkspaceId')
  const limit = parseInt(searchParams.get('limit') || '100')

  try {
    const result = vendorWorkspaceId
      ? await sql`
          SELECT cl.*, w.name as vendor_name, w.owner_email as vendor_email
          FROM commission_ledger cl
          LEFT JOIN workspaces w ON w.id = cl.vendor_workspace_id
          WHERE cl.vendor_workspace_id = ${vendorWorkspaceId}
          ORDER BY cl.created_at DESC LIMIT ${limit}
        `
      : await sql`
          SELECT cl.*, w.name as vendor_name, w.owner_email as vendor_email
          FROM commission_ledger cl
          LEFT JOIN workspaces w ON w.id = cl.vendor_workspace_id
          ORDER BY cl.created_at DESC LIMIT ${limit}
        `

    // Summary stats
    const summary = await sql`
      SELECT
        SUM(gross_amount) as total_gmv,
        SUM(commission_amount) as total_commission,
        SUM(net_amount) as total_net_to_vendors,
        COUNT(*) as total_transactions,
        AVG(commission_rate) as avg_commission_rate
      FROM commission_ledger
      ${vendorWorkspaceId ? sql`WHERE vendor_workspace_id = ${vendorWorkspaceId}` : sql``}
    `

    return NextResponse.json({
      entries: result.rows,
      summary: summary.rows[0],
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
