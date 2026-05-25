/**
 * Stripe Payments Worker — Payments Supervisor
 * POST /api/agents/payments/stripe — create payment links, checkout sessions, and query revenue
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import {
  createStripePaymentLink,
  createStripeCheckoutSession,
  getStripePaymentLinks,
  getStripeRevenueStats,
  createStripeSubscription,
  isStripeAvailable,
} from '@/lib/tools/stripe'

interface StripeRequest {
  workspaceId: string
  action: 'create_link' | 'create_checkout' | 'list_links' | 'revenue' | 'create_subscription'
  // create_link / create_checkout / create_subscription
  productName?: string
  amountCents?: number
  currency?: string
  description?: string
  // create_checkout
  successUrl?: string
  cancelUrl?: string
  // create_subscription
  interval?: 'month' | 'year'
  // list_links
  limit?: number
  // revenue
  days?: number
}

async function getSettings(workspaceId: string) {
  const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const workspace = wsResult.rows[0]
  if (!workspace) return null
  try {
    return typeof workspace.model_settings === 'string'
      ? JSON.parse(workspace.model_settings || '{}')
      : (workspace.model_settings as Record<string, unknown>) || {}
  } catch {
    return {}
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as StripeRequest
    const { workspaceId, action, productName, amountCents, currency, description,
      successUrl, cancelUrl, interval, limit, days } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    const settings = await getSettings(workspaceId)
    if (!settings) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    // Inject Stripe secret key from workspace settings
    if (settings.stripeSecretKey) {
      process.env.STRIPE_SECRET_KEY = settings.stripeSecretKey as string
    }

    if (!isStripeAvailable()) {
      return NextResponse.json({
        ok: false,
        error: 'Stripe not configured. Add your secret key in Settings → Payments.',
        requiresSetup: true,
      })
    }

    // ── Create Payment Link ───────────────────────────────────────────────────
    if (action === 'create_link') {
      if (!productName || !amountCents) {
        return NextResponse.json({ error: 'Missing productName or amountCents' }, { status: 400 })
      }
      const link = await createStripePaymentLink(productName, amountCents, currency, description)
      return NextResponse.json({ ok: true, link: { id: link.id, url: link.url } })
    }

    // ── Create Checkout Session ───────────────────────────────────────────────
    if (action === 'create_checkout') {
      if (!productName || !amountCents) {
        return NextResponse.json({ error: 'Missing productName or amountCents' }, { status: 400 })
      }
      const session = await createStripeCheckoutSession(
        productName,
        amountCents,
        currency || 'usd',
        successUrl,
        cancelUrl,
      )
      return NextResponse.json({ ok: true, session: { id: session.id, url: session.url } })
    }

    // ── List Payment Links ────────────────────────────────────────────────────
    if (action === 'list_links') {
      const links = await getStripePaymentLinks(limit || 20)
      return NextResponse.json({ ok: true, links })
    }

    // ── Revenue Stats ─────────────────────────────────────────────────────────
    if (action === 'revenue') {
      const stats = await getStripeRevenueStats(days || 30)
      return NextResponse.json({ ok: true, stats })
    }

    // ── Create Subscription ───────────────────────────────────────────────────
    if (action === 'create_subscription') {
      if (!productName || !amountCents) {
        return NextResponse.json({ error: 'Missing productName or amountCents' }, { status: 400 })
      }
      const result = await createStripeSubscription(
        productName,
        amountCents,
        interval || 'month',
        currency,
      )
      return NextResponse.json({ ok: true, priceId: result.priceId, productId: result.productId })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Stripe payments route error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
