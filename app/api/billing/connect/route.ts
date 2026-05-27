/**
 * Stripe Connect — lets vendors connect their Stripe account
 * so client payments flow through the platform with auto commission deduction.
 *
 * POST /api/billing/connect   { workspaceId } → returns onboarding URL
 * GET  /api/billing/connect?workspaceId=  → returns Connect status
 * PUT  /api/billing/connect   { workspaceId, accountId } → save connected account
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json() as { workspaceId: string }
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

    // Check vendor is on Agency plan
    const subResult = await sql`
      SELECT s.*, p.slug as plan_slug, p.max_sub_accounts
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.workspace_id = ${workspaceId} LIMIT 1
    `
    const sub = subResult.rows[0]
    const planSlug = String(sub?.plan_slug || 'free')
    if (!['agency', 'agency_scale'].includes(planSlug)) {
      return NextResponse.json({
        error: 'Stripe Connect is only available on Agency plans. Upgrade to Agency or Agency Scale to collect client payments through the platform.',
        requiresUpgrade: true,
      }, { status: 403 })
    }

    const { default: Stripe } = await import('stripe')
    const stripe = new Stripe(stripeKey)
    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    // Check if already has a Connect account
    const vendorResult = await sql`SELECT stripe_connect_account_id FROM vendor_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    let accountId = vendorResult.rows[0]?.stripe_connect_account_id
      ? String(vendorResult.rows[0].stripe_connect_account_id) : null

    if (!accountId) {
      // Get workspace owner email for pre-filling
      const wsResult = await sql`SELECT owner_email, name FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
      const ws = wsResult.rows[0]

      const account = await stripe.accounts.create({
        type: 'express',
        ...(ws?.owner_email ? { email: String(ws.owner_email) } : {}),
        metadata: { workspace_id: workspaceId },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      })
      accountId = account.id

      // Save the account ID
      const existing = await sql`SELECT id FROM vendor_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
      if (existing.rows[0]) {
        await sql`UPDATE vendor_profiles SET stripe_connect_account_id = ${accountId}, stripe_connect_status = 'pending', updated_at = ${new Date().toISOString()} WHERE workspace_id = ${workspaceId}`
      } else {
        await sql`INSERT INTO vendor_profiles (id, workspace_id, stripe_connect_account_id, stripe_connect_status, created_at, updated_at) VALUES (${newId()}, ${workspaceId}, ${accountId}, 'pending', ${new Date().toISOString()}, ${new Date().toISOString()})`
      }
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      // Sprint 1E: /dashboard/agency was hidden (100% mock data). The Stripe
      // Connect onboarding flow returns here after the user completes / refreshes
      // Stripe-hosted onboarding. Until a real vendor-payouts surface exists, send
      // them to /dashboard/billing which is the closest real billing-related page.
      refresh_url: `${appUrl}/dashboard/billing?connect=refresh`,
      return_url: `${appUrl}/dashboard/billing?connect=success`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ ok: true, url: accountLink.url, accountId })
  } catch (error) {
    console.error('Stripe Connect error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json(null)

  const result = await sql`SELECT * FROM vendor_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
  const profile = result.rows[0]
  if (!profile) return NextResponse.json({ status: 'not_connected', connected: false })

  // Check actual account status with Stripe if we have an account ID
  const stripeKey = process.env.STRIPE_SECRET_KEY
  const accountId = profile.stripe_connect_account_id ? String(profile.stripe_connect_account_id) : null

  if (stripeKey && accountId) {
    try {
      const { default: Stripe } = await import('stripe')
      const stripe = new Stripe(stripeKey)
      const account = await stripe.accounts.retrieve(accountId)
      const isActive = account.charges_enabled && account.payouts_enabled

      if (isActive && profile.stripe_connect_status !== 'active') {
        await sql`UPDATE vendor_profiles SET stripe_connect_status = 'active', updated_at = ${new Date().toISOString()} WHERE workspace_id = ${workspaceId}`
      }

      return NextResponse.json({
        status: isActive ? 'active' : 'pending',
        connected: isActive,
        accountId,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
      })
    } catch { /* stripe error — return DB state */ }
  }

  return NextResponse.json({
    status: String(profile.stripe_connect_status || 'not_connected'),
    connected: profile.stripe_connect_status === 'active',
    accountId,
  })
}
