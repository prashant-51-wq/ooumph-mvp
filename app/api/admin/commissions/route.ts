/**
 * GET /api/admin/commissions — commission ledger with filters
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
