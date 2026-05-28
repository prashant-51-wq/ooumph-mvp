/**
 * POST /api/billing/portal
 * Creates a Stripe Customer Portal session so users can manage
 * their subscription, update payment method, download invoices.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json() as { workspaceId: string }
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    // Sprint 10A: ownership before minting a portal URL that lets the
    // caller manage another tenant's subscription / payment methods.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

    const subResult = await sql`SELECT stripe_customer_id FROM subscriptions WHERE workspace_id = ${workspaceId} LIMIT 1`
    const customerId = subResult.rows[0]?.stripe_customer_id ? String(subResult.rows[0].stripe_customer_id) : null
    if (!customerId) return NextResponse.json({ error: 'No active subscription found' }, { status: 404 })

    const { default: Stripe } = await import('stripe')
    const stripe = new Stripe(stripeKey)
    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/dashboard/billing`,
    })

    return NextResponse.json({ ok: true, url: session.url })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
