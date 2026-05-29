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

  // Sprint 11D: fail-closed signature verification.
  //
  // Previous logic had a dangerous fallback: when `signature` was missing
  // OR `webhookSecret` was unset, the code accepted ANY JSON body as a
  // Stripe event. In production with STRIPE_WEBHOOK_SECRET configured but
  // an attacker simply omitting the stripe-signature header, that meant
  // they could fake checkout.session.completed events and activate paid
  // subscriptions, fake commissions, or flip Connect-account statuses.
  //
  // Correct rules:
  //   - If STRIPE_WEBHOOK_SECRET is set (production / staging):
  //     require BOTH a signature header AND successful verification.
  //     Reject everything else with 400.
  //   - If STRIPE_WEBHOOK_SECRET is unset (local dev only):
  //     skip verification and parse JSON — never run on a deployed
  //     environment without the secret set.
  let event: import('stripe').Stripe.Event
  if (webhookSecret) {
    if (!signature) {
      console.error('Stripe webhook rejected: STRIPE_WEBHOOK_SECRET set but stripe-signature header missing')
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
    }
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error('Stripe webhook signature verification failed:', err)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }
  } else {
    // Dev-only path. We log loudly so a missing-secret deployment is
    // obvious in the logs even if no one's actively watching.
    if (process.env.NODE_ENV === 'production') {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is unset in production — webhook is INSECURE. Set the env var immediately.')
    }
    try {
      event = JSON.parse(body) as import('stripe').Stripe.Event
    } catch (err) {
      return NextResponse.json({ error: `Invalid JSON: ${String(err)}` }, { status: 400 })
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const internalSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET || ''

  // Sprint 18E (P0): Stripe event idempotency. Stripe retries webhooks
  // aggressively (on 5xx, timeout, network jitter) and may also replay
  // historic events from the dashboard. Without dedup we'd double-credit
  // commissions, activate the same subscription twice, or re-flip Connect
  // status repeatedly. We insert event.id into a dedicated table with a
  // UNIQUE constraint; the INSERT itself is the lock. If it conflicts we
  // return 200 (success) so Stripe stops retrying — the original request
  // already processed this event.
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT,
        processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `
  } catch (err) {
    // Non-fatal on create. The INSERT below will surface real errors.
    console.error('[stripe-webhook] ensure idempotency table failed:', err)
  }

  try {
    await sql`
      INSERT INTO stripe_webhook_events (event_id, event_type)
      VALUES (${event.id}, ${event.type})
    `
  } catch {
    // PRIMARY KEY collision → already processed. Return 200 so Stripe
    // doesn't retry. We do NOT re-run the handler logic.
    console.log(`[stripe-webhook] duplicate event ${event.id} (${event.type}) — skipped`)
    return NextResponse.json({ received: true, duplicate: true })
  }

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
          headers: {
            'Content-Type': 'application/json',
            ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
          },
          body: JSON.stringify({
            workspaceId,
            planId,
            stripeCustomerId: String(session.customer || ''),
            stripeSubscriptionId: String(session.subscription),
            status: 'active',
            currentPeriodStart: new Date(((sub as unknown as Record<string, unknown>).current_period_start as number) * 1000).toISOString(),
            currentPeriodEnd: new Date(((sub as unknown as Record<string, unknown>).current_period_end as number) * 1000).toISOString(),
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
          headers: {
            'Content-Type': 'application/json',
            ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
          },
          body: JSON.stringify({
            workspaceId,
            planId,
            stripeCustomerId: String(sub.customer || ''),
            stripeSubscriptionId: sub.id,
            status: sub.status,
            currentPeriodStart: new Date(((sub as unknown as Record<string, unknown>).current_period_start as number) * 1000).toISOString(),
            currentPeriodEnd: new Date(((sub as unknown as Record<string, unknown>).current_period_end as number) * 1000).toISOString(),
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
          // Idempotency: skip if this payment_intent was already recorded
          const existing = await sql`SELECT id FROM commission_ledger WHERE stripe_payment_intent_id = ${pi.id} LIMIT 1`
          if (!existing.rows[0]) {
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
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook handler error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
