// Stripe API

import { getCredential } from '@/lib/credential-context'

const STRIPE_BASE = 'https://api.stripe.com/v1'

export interface StripePaymentLink {
  id: string
  url: string
  active: boolean
  currency: string
  metadata?: Record<string, string>
}

export interface StripePrice {
  id: string
  product: string
  unit_amount: number
  currency: string
  recurring?: { interval: string; interval_count: number }
}

export interface StripeCheckoutSession {
  id: string
  url: string
  status: string
  amount_total?: number
  currency?: string
}

function stripeHeaders(): Record<string, string> {
  const key = getCredential('STRIPE_SECRET_KEY') || ''
  const encoded = Buffer.from(key + ':').toString('base64')
  return {
    Authorization: `Basic ${encoded}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

// Build flat form-encoded string including bracket-notation keys
function toFormEncoded(obj: Record<string, string>): string {
  return new URLSearchParams(obj).toString()
}

export async function createStripePaymentLink(
  productName: string,
  amountCents: number,
  currency: string = 'usd',
  description?: string
): Promise<StripePaymentLink | null> {
  const key = getCredential('STRIPE_SECRET_KEY')
  if (!key) return null
  try {
    // 1. Create product
    const productBody = toFormEncoded({
      name: productName,
      ...(description ? { description } : {}),
    })
    const productRes = await fetch(`${STRIPE_BASE}/products`, {
      method: 'POST',
      headers: stripeHeaders(),
      body: productBody,
    })
    if (!productRes.ok) return null
    const product = await productRes.json()
    const productId: string = product.id

    // 2. Create price
    const priceBody = toFormEncoded({
      product: productId,
      unit_amount: String(amountCents),
      currency,
    })
    const priceRes = await fetch(`${STRIPE_BASE}/prices`, {
      method: 'POST',
      headers: stripeHeaders(),
      body: priceBody,
    })
    if (!priceRes.ok) return null
    const price = await priceRes.json()
    const priceId: string = price.id

    // 3. Create payment link — bracket notation via URLSearchParams
    const plParams = new URLSearchParams()
    plParams.set('line_items[0][price]', priceId)
    plParams.set('line_items[0][quantity]', '1')
    const plRes = await fetch(`${STRIPE_BASE}/payment_links`, {
      method: 'POST',
      headers: stripeHeaders(),
      body: plParams.toString(),
    })
    if (!plRes.ok) return null
    const pl = await plRes.json()
    return {
      id: pl.id,
      url: pl.url,
      active: pl.active ?? true,
      currency: pl.currency || currency,
      metadata: pl.metadata,
    }
  } catch {
    return null
  }
}

export async function createStripeCheckoutSession(
  productName: string,
  amountCents: number,
  currency: string,
  successUrl: string,
  cancelUrl: string
): Promise<StripeCheckoutSession | null> {
  const key = getCredential('STRIPE_SECRET_KEY')
  if (!key) return null
  try {
    const params = new URLSearchParams()
    params.set('mode', 'payment')
    params.set('success_url', successUrl)
    params.set('cancel_url', cancelUrl)
    params.set('line_items[0][price_data][currency]', currency)
    params.set('line_items[0][price_data][unit_amount]', String(amountCents))
    params.set('line_items[0][price_data][product_data][name]', productName)
    params.set('line_items[0][quantity]', '1')

    const res = await fetch(`${STRIPE_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: stripeHeaders(),
      body: params.toString(),
    })
    if (!res.ok) return null
    const json = await res.json()
    return {
      id: json.id,
      url: json.url,
      status: json.status,
      amount_total: json.amount_total,
      currency: json.currency,
    }
  } catch {
    return null
  }
}

export async function getStripePaymentLinks(limit: number = 10): Promise<StripePaymentLink[]> {
  const key = getCredential('STRIPE_SECRET_KEY')
  if (!key) return []
  try {
    const res = await fetch(`${STRIPE_BASE}/payment_links?limit=${limit}`, {
      headers: stripeHeaders(),
    })
    if (!res.ok) return []
    const json = await res.json()
    const data: Record<string, unknown>[] = json.data || []
    return data.map((pl) => ({
      id: String(pl.id || ''),
      url: String(pl.url || ''),
      active: pl.active === true,
      currency: String(pl.currency || ''),
      metadata: pl.metadata as Record<string, string> | undefined,
    }))
  } catch {
    return []
  }
}

export async function getStripeRevenueStats(
  days: number = 30
): Promise<{ totalRevenue: number; currency: string; transactions: number; avgOrderValue: number } | null> {
  const key = getCredential('STRIPE_SECRET_KEY')
  if (!key) return null
  try {
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400
    const res = await fetch(
      `${STRIPE_BASE}/charges?limit=100&created[gte]=${cutoff}`,
      { headers: stripeHeaders() }
    )
    if (!res.ok) return null
    const json = await res.json()
    const charges: Record<string, unknown>[] = json.data || []
    const captured = charges.filter((c) => c.captured === true && c.refunded === false)
    const totalRevenue = captured.reduce((sum, c) => sum + Number(c.amount || 0), 0)
    const transactions = captured.length
    const currency =
      captured.length > 0 ? String(captured[0].currency || 'usd') : 'usd'
    return {
      totalRevenue,
      currency,
      transactions,
      avgOrderValue: transactions > 0 ? Math.round(totalRevenue / transactions) : 0,
    }
  } catch {
    return null
  }
}

export async function createStripeSubscription(
  name: string,
  amountCents: number,
  interval: 'month' | 'year',
  currency: string = 'usd'
): Promise<{ priceId: string; productId: string } | null> {
  const key = getCredential('STRIPE_SECRET_KEY')
  if (!key) return null
  try {
    // 1. Create product
    const productRes = await fetch(`${STRIPE_BASE}/products`, {
      method: 'POST',
      headers: stripeHeaders(),
      body: toFormEncoded({ name }),
    })
    if (!productRes.ok) return null
    const product = await productRes.json()
    const productId: string = product.id

    // 2. Create recurring price
    const priceParams = new URLSearchParams()
    priceParams.set('product', productId)
    priceParams.set('unit_amount', String(amountCents))
    priceParams.set('currency', currency)
    priceParams.set('recurring[interval]', interval)
    const priceRes = await fetch(`${STRIPE_BASE}/prices`, {
      method: 'POST',
      headers: stripeHeaders(),
      body: priceParams.toString(),
    })
    if (!priceRes.ok) return null
    const price = await priceRes.json()
    return { priceId: price.id, productId }
  } catch {
    return null
  }
}

export function isStripeAvailable(): boolean {
  return !!getCredential('STRIPE_SECRET_KEY')
}
