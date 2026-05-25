/**
 * GET    /api/vendor/clients   — list vendor's client accounts
 * POST   /api/vendor/clients   — create a new client account
 * PATCH  /api/vendor/clients   — update client (name, email, price, status)
 * DELETE /api/vendor/clients   — remove a client account
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

function getWorkspaceId(req: NextRequest): string | null {
  return req.headers.get('x-workspace-id') || new URL(req.url).searchParams.get('workspaceId')
}

export async function GET(req: NextRequest) {
  const workspaceId = getWorkspaceId(req)
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') // active | trial | suspended | all

  try {
    const result = status && status !== 'all'
      ? await sql`
          SELECT ca.*, w.owner_email as client_workspace_email
          FROM client_accounts ca
          LEFT JOIN workspaces w ON w.id = ca.client_workspace_id
          WHERE ca.vendor_workspace_id = ${workspaceId} AND ca.status = ${status}
          ORDER BY ca.created_at DESC
        `
      : await sql`
          SELECT ca.*, w.owner_email as client_workspace_email
          FROM client_accounts ca
          LEFT JOIN workspaces w ON w.id = ca.client_workspace_id
          WHERE ca.vendor_workspace_id = ${workspaceId}
          ORDER BY ca.created_at DESC
        `

    // Revenue summary for this vendor's clients
    const revenue = await sql`
      SELECT
        SUM(gross_amount) as total_gmv,
        SUM(commission_amount) as total_commission_paid,
        SUM(net_amount) as total_earned,
        COUNT(*) as total_transactions
      FROM commission_ledger
      WHERE vendor_workspace_id = ${workspaceId}
    `

    return NextResponse.json({
      clients: result.rows,
      revenue: revenue.rows[0],
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const workspaceId = getWorkspaceId(req)
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

  try {
    const body = await req.json() as {
      clientName: string
      clientEmail: string
      priceMonthly?: number
      trialDays?: number
    }
    const { clientName, clientEmail, priceMonthly = 0, trialDays = 14 } = body

    if (!clientName || !clientEmail) {
      return NextResponse.json({ error: 'clientName and clientEmail required' }, { status: 400 })
    }

    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()
    const id = newId()

    await sql`
      INSERT INTO client_accounts (id, vendor_workspace_id, client_name, client_email, price_monthly, status, trial_ends_at, created_at, updated_at)
      VALUES (${id}, ${workspaceId}, ${clientName}, ${clientEmail}, ${priceMonthly}, 'trial', ${trialEndsAt}, ${now}, ${now})
    `

    const created = await sql`SELECT * FROM client_accounts WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ ok: true, client: created.rows[0] }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const workspaceId = getWorkspaceId(req)
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

  try {
    const body = await req.json() as {
      clientId: string
      clientName?: string
      clientEmail?: string
      priceMonthly?: number
      status?: string
      stripeCustomerId?: string
      stripeSubscriptionId?: string
    }
    const { clientId, clientName, clientEmail, priceMonthly, status, stripeCustomerId, stripeSubscriptionId } = body

    if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

    // Verify this client belongs to the requesting vendor
    const existing = await sql`
      SELECT id FROM client_accounts WHERE id = ${clientId} AND vendor_workspace_id = ${workspaceId} LIMIT 1
    `
    if (!existing.rows[0]) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const now = new Date().toISOString()
    await sql`
      UPDATE client_accounts SET
        client_name = COALESCE(${clientName ?? null}, client_name),
        client_email = COALESCE(${clientEmail ?? null}, client_email),
        price_monthly = COALESCE(${priceMonthly !== undefined ? priceMonthly : null}, price_monthly),
        status = COALESCE(${status ?? null}, status),
        stripe_customer_id = COALESCE(${stripeCustomerId ?? null}, stripe_customer_id),
        stripe_subscription_id = COALESCE(${stripeSubscriptionId ?? null}, stripe_subscription_id),
        updated_at = ${now}
      WHERE id = ${clientId} AND vendor_workspace_id = ${workspaceId}
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const workspaceId = getWorkspaceId(req)
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  try {
    // Verify ownership
    const existing = await sql`
      SELECT id FROM client_accounts WHERE id = ${clientId} AND vendor_workspace_id = ${workspaceId} LIMIT 1
    `
    if (!existing.rows[0]) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    // Soft-delete: set status to 'removed' to preserve commission history
    await sql`
      UPDATE client_accounts SET status = 'removed', updated_at = ${new Date().toISOString()}
      WHERE id = ${clientId} AND vendor_workspace_id = ${workspaceId}
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
