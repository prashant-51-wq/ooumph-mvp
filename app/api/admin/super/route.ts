/**
 * /api/admin/super
 *
 * Platform-owner dashboard data. REQUIRES super admin authentication.
 *
 * Auth: users.is_admin = 1 OR email in SUPER_ADMIN_EMAILS env var
 *       OR x-admin-secret header matching ADMIN_SECRET
 *
 * Sections:
 *   ?section=overview      → platform-wide MRR, signups, churn
 *   ?section=agencies      → list of all workspaces (with vendor profiles + subscriptions)
 *   ?section=commissions   → affiliate / vendor commission ledger
 *   ?section=platform      → platform settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertSuperAdmin, getSessionUserId } from '@/lib/guards'

interface WorkspaceRow {
  id: string
  name: string
  industry: string | null
  owner_email: string
  status: string
  created_at: string
}

interface SubscriptionRow {
  workspace_id: string
  plan_id: string
  status: string
  current_period_end: string | null
}

interface PlanRow {
  id: string
  name: string
  slug: string
  price_monthly: number
}

async function getOverview() {
  const workspacesRes = await sql`SELECT id, name, industry, owner_email, status, created_at FROM workspaces ORDER BY created_at DESC`
  const workspaces = workspacesRes.rows as unknown as WorkspaceRow[]

  const subsRes = await sql`SELECT workspace_id, plan_id, status, current_period_end FROM subscriptions`
  const subs = subsRes.rows as unknown as SubscriptionRow[]

  const plansRes = await sql`SELECT id, name, slug, price_monthly FROM plans`
  const plans = plansRes.rows as unknown as PlanRow[]

  const planById = new Map(plans.map(p => [p.id, p]))
  const subByWs = new Map(subs.map(s => [s.workspace_id, s]))

  // MRR = sum of active subscriptions × plan price
  const activeMrrCents = subs.reduce((sum, s) => {
    if (s.status !== 'active' && s.status !== 'trialing') return sum
    const plan = planById.get(s.plan_id)
    return sum + (plan?.price_monthly || 0)
  }, 0)
  const activeMrr = activeMrrCents / 100

  const totalAgencies = workspaces.length
  const activeSubscriptions = subs.filter(s => s.status === 'active').length
  const trialSubscriptions = subs.filter(s => s.status === 'trialing').length
  const churnedCount = subs.filter(s => s.status === 'canceled' || s.status === 'cancelled').length
  const churnRate = totalAgencies > 0 ? parseFloat(((churnedCount / totalAgencies) * 100).toFixed(1)) : 0
  const avgRevenuePerAgency = activeSubscriptions > 0 ? Math.round(activeMrr / activeSubscriptions) : 0

  // Platform revenue: 20% take rate by default (could be from platform_settings)
  const platformRevenue = Math.round(activeMrr * 0.2)

  // Recent signups: 5 most recent workspaces
  const recentSignups = workspaces.slice(0, 5).map(w => {
    const sub = subByWs.get(w.id)
    const plan = sub ? planById.get(sub.plan_id) : undefined
    return {
      id: w.id,
      name: w.name,
      ownerEmail: w.owner_email,
      plan: plan?.name || 'Free',
      mrr: plan ? plan.price_monthly / 100 : 0,
      joinDate: w.created_at,
      status: sub?.status === 'active' ? 'Active' : sub?.status === 'trialing' ? 'Trial' : 'Free',
    }
  })

  // Revenue by month: aggregate from commission_ledger
  // Last 6 months
  const ledgerRes = await sql`
    SELECT gross_amount, created_at
    FROM commission_ledger
    WHERE created_at >= ${new Date(Date.now() - 180 * 86400000).toISOString()}
    ORDER BY created_at ASC
  `
  const ledger = ledgerRes.rows as Array<{ gross_amount: number; created_at: string }>
  const monthBuckets = new Map<string, number>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    monthBuckets.set(d.toLocaleString('default', { month: 'short' }), 0)
  }
  for (const entry of ledger) {
    const month = new Date(entry.created_at).toLocaleString('default', { month: 'short' })
    monthBuckets.set(month, (monthBuckets.get(month) || 0) + entry.gross_amount / 100)
  }
  const revenueByMonth = Array.from(monthBuckets.entries()).map(([month, value]) => ({ month, value: Math.round(value) }))

  return {
    totalAgencies,
    activeMrr: Math.round(activeMrr),
    platformRevenue,
    activeSubscriptions,
    trialSubscriptions,
    churnRate,
    avgRevenuePerAgency,
    recentSignups,
    revenueByMonth,
  }
}

async function getAgencies() {
  const workspacesRes = await sql`SELECT id, name, industry, owner_email, status, created_at FROM workspaces ORDER BY created_at DESC`
  const workspaces = workspacesRes.rows as unknown as WorkspaceRow[]

  const subsRes = await sql`SELECT workspace_id, plan_id, status FROM subscriptions`
  const subs = subsRes.rows as unknown as SubscriptionRow[]

  const plansRes = await sql`SELECT id, name, price_monthly FROM plans`
  const plans = plansRes.rows as unknown as PlanRow[]

  const membersRes = await sql`SELECT workspace_id, COUNT(*) as count FROM workspace_members WHERE status = 'active' GROUP BY workspace_id`
  const members = membersRes.rows as Array<{ workspace_id: string; count: number }>

  const planById = new Map(plans.map(p => [p.id, p]))
  const subByWs = new Map(subs.map(s => [s.workspace_id, s]))
  const memberCountByWs = new Map(members.map(m => [m.workspace_id, Number(m.count)]))

  return workspaces.map(w => {
    const sub = subByWs.get(w.id)
    const plan = sub ? planById.get(sub.plan_id) : undefined
    const planName = (plan?.name || 'Free') as 'Free' | 'Starter' | 'Pro' | 'Agency' | 'Enterprise'
    const planSeatLimits: Record<string, number> = { Free: 1, Starter: 2, Pro: 5, Agency: 10, Enterprise: 50 }
    return {
      id: w.id,
      name: w.name,
      ownerEmail: w.owner_email,
      plan: planName,
      mrr: plan ? plan.price_monthly / 100 : 0,
      seatsUsed: memberCountByWs.get(w.id) || 1,
      seatsTotal: planSeatLimits[planName] || 1,
      status: sub?.status === 'active' ? 'Active' : sub?.status === 'trialing' ? 'Trial' : (w.status === 'suspended' ? 'Suspended' : 'Active'),
      joinDate: w.created_at,
    }
  })
}

async function getCommissions() {
  const ledgerRes = await sql`
    SELECT vendor_workspace_id, SUM(gross_amount) as gross, SUM(commission_amount) as commission, SUM(net_amount) as net
    FROM commission_ledger
    GROUP BY vendor_workspace_id
  `
  const ledger = ledgerRes.rows as Array<{
    vendor_workspace_id: string
    gross: number
    commission: number
    net: number
  }>

  const vendorIds = ledger.map(l => l.vendor_workspace_id)
  let vendors: Array<{ workspace_id: string; white_label_name: string | null }> = []
  if (vendorIds.length > 0) {
    // SQLite doesn't support array params nicely; fetch all and filter
    const vendorsRes = await sql`SELECT workspace_id, white_label_name FROM vendor_profiles`
    vendors = vendorsRes.rows as Array<{ workspace_id: string; white_label_name: string | null }>
  }
  const workspacesRes = await sql`SELECT id, name, owner_email FROM workspaces`
  const workspaces = workspacesRes.rows as Array<{ id: string; name: string; owner_email: string }>

  const wsById = new Map(workspaces.map(w => [w.id, w]))
  const vendorByWs = new Map(vendors.map(v => [v.workspace_id, v]))

  const clientCountsRes = await sql`SELECT vendor_workspace_id, COUNT(*) as count FROM client_accounts GROUP BY vendor_workspace_id`
  const clientCounts = new Map(
    (clientCountsRes.rows as Array<{ vendor_workspace_id: string; count: number }>).map(r => [r.vendor_workspace_id, Number(r.count)])
  )

  // Sprint 7D: real payout tracking via commission_payouts. balance =
  // commission earned MINUS payouts recorded. paidOut is the SUM of
  // amount_cents per vendor.
  const payoutsRes = await sql`
    SELECT vendor_workspace_id, COALESCE(SUM(amount_cents)::int, 0) as paid_cents
    FROM commission_payouts GROUP BY vendor_workspace_id
  `
  const paidByVendor = new Map(
    (payoutsRes.rows as Array<{ vendor_workspace_id: string; paid_cents: number }>)
      .map(r => [r.vendor_workspace_id, Number(r.paid_cents)])
  )

  const affiliates = ledger.map(l => {
    const ws = wsById.get(l.vendor_workspace_id)
    const vendor = vendorByWs.get(l.vendor_workspace_id)
    const earnedCents = Number(l.commission || 0)
    const paidCents = paidByVendor.get(l.vendor_workspace_id) || 0
    const balanceCents = Math.max(0, earnedCents - paidCents)
    return {
      id: l.vendor_workspace_id,
      name: vendor?.white_label_name || ws?.name || 'Unknown',
      email: ws?.owner_email || '',
      referredAgencies: clientCounts.get(l.vendor_workspace_id) || 0,
      totalReferralMrr: Math.round(l.gross / 100),
      commissionRate: l.gross > 0 ? Math.round((l.commission / l.gross) * 100) : 0,
      earnedThisMonth: Math.round(earnedCents / 100),
      paidOut: Math.round(paidCents / 100),
      balance: Math.round(balanceCents / 100),
    }
  })

  const totalOwed = affiliates.reduce((s, a) => s + a.balance, 0)
  const paidThisMonth = affiliates.reduce((s, a) => s + a.earnedThisMonth, 0)
  const top = affiliates.reduce<typeof affiliates[number] | null>((t, a) => (!t || a.balance > t.balance ? a : t), null)

  return {
    affiliates,
    totalOwed,
    paidThisMonth,
    topAffiliateName: top?.name ?? '',
  }
}

async function getPlatformSettings() {
  const result = await sql`SELECT key, value FROM platform_settings`
  const rows = result.rows as Array<{ key: string; value: string }>
  const settings: Record<string, string> = {}
  for (const row of rows) {
    settings[row.key] = row.value
  }
  return settings
}

export async function GET(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied

  const section = req.nextUrl.searchParams.get('section')

  try {
    switch (section) {
      case 'overview':
        return NextResponse.json(await getOverview())
      case 'agencies':
        return NextResponse.json(await getAgencies())
      case 'commissions':
        return NextResponse.json(await getCommissions())
      case 'platform':
        return NextResponse.json(await getPlatformSettings())
      default:
        return NextResponse.json(
          { error: 'Invalid section. Use: overview | agencies | commissions | platform' },
          { status: 400 }
        )
    }
  } catch (err) {
    console.error('[/api/admin/super]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/super
 * Update platform settings (admin only).
 */
export async function POST(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied

  try {
    const body = await req.json()
    const action = body.action as string

    if (action === 'update_setting') {
      const { key, value } = body as { key: string; value: string }
      if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })
      // UPSERT pattern that works in both SQLite and Postgres
      const existing = await sql`SELECT key FROM platform_settings WHERE key = ${key} LIMIT 1`
      if ((existing.rows[0] as { key?: string } | undefined)?.key) {
        await sql`UPDATE platform_settings SET value = ${value}, updated_at = ${new Date().toISOString()} WHERE key = ${key}`
      } else {
        await sql`INSERT INTO platform_settings (key, value) VALUES (${key}, ${value})`
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'suspend_workspace') {
      const { workspaceId } = body as { workspaceId: string }
      await sql`UPDATE workspaces SET status = 'suspended' WHERE id = ${workspaceId}`
      return NextResponse.json({ ok: true })
    }

    if (action === 'unsuspend_workspace') {
      const { workspaceId } = body as { workspaceId: string }
      await sql`UPDATE workspaces SET status = 'active' WHERE id = ${workspaceId}`
      return NextResponse.json({ ok: true })
    }

    // Sprint 7D: manual payout recording. Records the payout in
    // commission_payouts which getCommissions() subtracts from earned
    // commission to compute the balance. Stripe Connect transfers
    // will land later — payment_method='manual' makes the manual
    // origin auditable.
    //
    // Body: { action: 'mark_paid', vendorWorkspaceId, amountCents?, notes? }
    // If amountCents is omitted, we settle the FULL outstanding balance
    // (the common case for the UI button).
    if (action === 'mark_paid') {
      const {
        vendorWorkspaceId,
        amountCents: requestedAmount,
        notes,
      } = body as { vendorWorkspaceId?: string; amountCents?: number; notes?: string }

      if (!vendorWorkspaceId) {
        return NextResponse.json({ error: 'vendorWorkspaceId required' }, { status: 400 })
      }

      // Compute current balance the same way getCommissions does, so we
      // don't accidentally pay more than is owed.
      const ledgerRes = await sql`
        SELECT COALESCE(SUM(commission_amount)::int, 0) as earned_cents
        FROM commission_ledger WHERE vendor_workspace_id = ${vendorWorkspaceId}
      `
      const earnedCents = Number((ledgerRes.rows[0] as { earned_cents?: number } | undefined)?.earned_cents ?? 0)
      const paidRes = await sql`
        SELECT COALESCE(SUM(amount_cents)::int, 0) as paid_cents
        FROM commission_payouts WHERE vendor_workspace_id = ${vendorWorkspaceId}
      `
      const paidCents = Number((paidRes.rows[0] as { paid_cents?: number } | undefined)?.paid_cents ?? 0)
      const balanceCents = Math.max(0, earnedCents - paidCents)

      if (balanceCents === 0) {
        return NextResponse.json({ error: 'No outstanding balance to pay out.' }, { status: 400 })
      }

      const amountToPay = requestedAmount !== undefined
        ? Math.min(Math.max(0, Math.floor(requestedAmount)), balanceCents)
        : balanceCents
      if (amountToPay <= 0) {
        return NextResponse.json({ error: 'amountCents must be > 0' }, { status: 400 })
      }

      const paidByUserId = getSessionUserId(req)
      await sql`
        INSERT INTO commission_payouts (id, vendor_workspace_id, amount_cents, notes, paid_by_user_id, payment_method)
        VALUES (${newId()}, ${vendorWorkspaceId}, ${amountToPay}, ${notes ?? null}, ${paidByUserId ?? null}, 'manual')
      `
      return NextResponse.json({
        ok: true,
        amountPaidCents: amountToPay,
        newBalanceCents: balanceCents - amountToPay,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[/api/admin/super POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
