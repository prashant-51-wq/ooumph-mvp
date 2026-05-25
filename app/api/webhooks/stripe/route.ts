/**
 * POST /api/webhooks/stripe
 * Handles all Stripe webhook events:
 *   checkout.session.completed     → activate subscription
 *   customer.subscription.updated  → update plan/status
 *   customer.subscription.deleted  → cancel subscription
 *   account.updated                → update Connect status
 *   payment_intent.succeeded       → record commission (Connect charges)
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const { default: Stripe } = await import('stripe')
  const stripe = new Stripe(stripeKey)

  const body = await req.text()
  const signature = req.headers.get('stripe-signature') || ''

  let event: import('stripe').Stripe.Event
  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } else {
      // Dev mode: parse without verification
      event = JSON.parse(body) as import('stripe').Stripe.Event
    }
  } catch (err) {
    console.error('Stripe webhook signature failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const internalSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET || ''

  try {
    // ── checkout.session.completed ───────────────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as import('stripe').Stripe.Checkout.Session
      const workspaceId = session.metadata?.workspace_id
      const planId = session.metadata?.plan_id

      if (workspaceId && planId && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(String(session.subscription)) as import('stripe').Stripe.Subscription
        await fetch(`${appUrl}/api/billing/subscribe`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            planId,
            stripeCustomerId: String(session.customer || ''),
            stripeSubscriptionId: String(session.subscription),
            status: 'active',
            currentPeriodStart: new Date((sub.current_period_start as number) * 1000).toISOString(),
            currentPeriodEnd: new Date((sub.current_period_end as number) * 1000).toISOString(),
            secret: internalSecret,
          }),
        })
      }
    }

    // ── customer.subscription.updated ────────────────────────────────────────
    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as import('stripe').Stripe.Subscription
      const workspaceId = sub.metadata?.workspace_id
      const planId = sub.metadata?.plan_id

      if (workspaceId && planId) {
        await fetch(`${appUrl}/api/billing/subscribe`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            planId,
            stripeCustomerId: String(sub.customer || ''),
            stripeSubscriptionId: sub.id,
            status: sub.status,
            currentPeriodStart: new Date((sub.current_period_start as number) * 1000).toISOString(),
            currentPeriodEnd: new Date((sub.current_period_end as number) * 1000).toISOString(),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            secret: internalSecret,
          }),
        })
      }
    }

    // ── customer.subscription.deleted ────────────────────────────────────────
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as import('stripe').Stripe.Subscription
      const workspaceId = sub.metadata?.workspace_id
      if (workspaceId) {
        // Downgrade to free plan
        const freePlan = await sql`SELECT id FROM plans WHERE slug = 'free' LIMIT 1`
        if (freePlan.rows[0]) {
          await sql`UPDATE subscriptions SET status = 'canceled', plan_id = ${String(freePlan.rows[0].id)}, updated_at = ${new Date().toISOString()} WHERE workspace_id = ${workspaceId}`
        } else {
          await sql`UPDATE subscriptions SET status = 'canceled', updated_at = ${new Date().toISOString()} WHERE workspace_id = ${workspaceId}`
        }
      }
    }

    // ── account.updated (Stripe Connect) ─────────────────────────────────────
    if (event.type === 'account.updated') {
      const account = event.data.object as import('stripe').Stripe.Account
      const isActive = account.charges_enabled && account.payouts_enabled
      await sql`
        UPDATE vendor_profiles
        SET stripe_connect_status = ${isActive ? 'active' : 'pending'},
            updated_at = ${new Date().toISOString()}
        WHERE stripe_connect_account_id = ${account.id}
      `.catch(() => { /* non-fatal */ })
    }

    // ── payment_intent.succeeded (Connect — commission recording) ─────────────
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as import('stripe').Stripe.PaymentIntent
      // Only process if this is a Connect charge (has application_fee_amount or transfer_data)
      if (pi.application_fee_amount && pi.transfer_data?.destination) {
        const vendorAccountId = String(pi.transfer_data.destination)
        const vendorResult = await sql`SELECT workspace_id FROM vendor_profiles WHERE stripe_connect_account_id = ${vendorAccountId} LIMIT 1`
        const vendorWorkspaceId = vendorResult.rows[0]?.workspace_id ? String(vendorResult.rows[0].workspace_id) : null

        if (vendorWorkspaceId) {
          const grossAmount = pi.amount
          const commissionAmount = pi.application_fee_amount
          const netAmount = grossAmount - commissionAmount
          const commissionRate = commissionAmount / grossAmount

          await sql`
            INSERT INTO commission_ledger (id, vendor_workspace_id, gross_amount, commission_rate, commission_amount, net_amount, stripe_payment_intent_id, description, created_at)
            VALUES (${newId()}, ${vendorWorkspaceId}, ${grossAmount}, ${commissionRate}, ${commissionAmount}, ${netAmount}, ${pi.id}, ${pi.description || 'Client payment'}, ${new Date().toISOString()})
          `
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook handler error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
