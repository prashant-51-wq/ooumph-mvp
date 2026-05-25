/**
 * POST /api/billing/subscribe
 * Creates a Stripe Checkout session for upgrading to a paid plan.
 * On success, Stripe redirects to /dashboard/billing?success=1
 * The stripe webhook activates the subscription in the DB.
 *
 * Body: { workspaceId, planSlug, email, name }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, planSlug, email, name } = await req.json() as {
      workspaceId: string
      planSlug: string
      email?: string
      name?: string
    }

    if (!workspaceId || !planSlug) {
      return NextResponse.json({ error: 'workspaceId and planSlug required' }, { status: 400 })
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      return NextResponse.json({ error: 'Stripe not configured. Add STRIPE_SECRET_KEY to environment variables.' }, { status: 503 })
    }

    // Load plan
    const planResult = await sql`SELECT * FROM plans WHERE slug = ${planSlug} AND is_active = 1 LIMIT 1`
    const plan = planResult.rows[0]
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

    if (!plan.stripe_price_id) {
      return NextResponse.json({
        error: `Stripe price not configured for ${String(plan.name)} plan. Go to /admin → Plans and add the Stripe Price ID.`,
        requiresSetup: true,
      }, { status: 503 })
    }

    const { default: Stripe } = await import('stripe')
    const stripe = new Stripe(stripeKey)

    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    // Get or create Stripe customer
    let stripeCustomerId: string | undefined
    const subResult = await sql`SELECT stripe_customer_id FROM subscriptions WHERE workspace_id = ${workspaceId} LIMIT 1`
    stripeCustomerId = subResult.rows[0]?.stripe_customer_id ? String(subResult.rows[0].stripe_customer_id) : undefined

    if (!stripeCustomerId && email) {
      const customer = await stripe.customers.create({ email, name: name || undefined, metadata: { workspace_id: workspaceId } })
      stripeCustomerId = customer.id
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: email }),
      line_items: [{ price: String(plan.stripe_price_id), quantity: 1 }],
      success_url: `${appUrl}/dashboard/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard/billing?canceled=1`,
      metadata: { workspace_id: workspaceId, plan_id: String(plan.id), plan_slug: planSlug },
      subscription_data: { metadata: { workspace_id: workspaceId, plan_id: String(plan.id) } },
    })

    return NextResponse.json({ ok: true, url: session.url, sessionId: session.id })
  } catch (error) {
    console.error('Stripe subscribe error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// GET: current subscription for a workspace
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json(null)

  const result = await sql`
    SELECT s.*, p.name as plan_name, p.slug as plan_slug, p.price_monthly,
           p.commission_rate, p.max_sub_accounts, p.max_ai_runs_monthly, p.features
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.workspace_id = ${workspaceId}
    LIMIT 1
  `
  // If no subscription, return free plan info
  if (!result.rows[0]) {
    const freePlan = await sql`SELECT * FROM plans WHERE slug = 'free' LIMIT 1`
    return NextResponse.json({
      plan_name: 'Free',
      plan_slug: 'free',
      price_monthly: 0,
      commission_rate: 0,
      max_sub_accounts: 0,
      max_ai_runs_monthly: 100,
      status: 'active',
      features: freePlan.rows[0]?.features || '[]',
    })
  }
  return NextResponse.json(result.rows[0])
}

// Internal: upsert subscription record (called by webhook)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      planId: string
      stripeCustomerId?: string
      stripeSubscriptionId?: string
      status?: string
      currentPeriodStart?: string
      currentPeriodEnd?: string
      cancelAtPeriodEnd?: boolean
      secret: string
    }
    if (body.secret !== process.env.ADMIN_SECRET && body.secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const now = new Date().toISOString()
    const existing = await sql`SELECT id FROM subscriptions WHERE workspace_id = ${body.workspaceId} LIMIT 1`
    if (existing.rows[0]) {
      await sql`
        UPDATE subscriptions SET
          plan_id = ${body.planId},
          stripe_customer_id = COALESCE(${body.stripeCustomerId || null}, stripe_customer_id),
          stripe_subscription_id = COALESCE(${body.stripeSubscriptionId || null}, stripe_subscription_id),
          status = COALESCE(${body.status || null}, status),
          current_period_start = COALESCE(${body.currentPeriodStart || null}, current_period_start),
          current_period_end = COALESCE(${body.currentPeriodEnd || null}, current_period_end),
          cancel_at_period_end = COALESCE(${body.cancelAtPeriodEnd !== undefined ? (body.cancelAtPeriodEnd ? 1 : 0) : null}, cancel_at_period_end),
          updated_at = ${now}
        WHERE workspace_id = ${body.workspaceId}
      `
    } else {
      await sql`
        INSERT INTO subscriptions (id, workspace_id, plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, created_at, updated_at)
        VALUES (${newId()}, ${body.workspaceId}, ${body.planId}, ${body.stripeCustomerId || null}, ${body.stripeSubscriptionId || null}, ${body.status || 'active'}, ${body.currentPeriodStart || null}, ${body.currentPeriodEnd || null}, ${now}, ${now})
      `
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
