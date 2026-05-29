// Razorpay API
import crypto from 'crypto'
import { getCredential } from '@/lib/credential-context'

const RAZORPAY_BASE = 'https://api.razorpay.com/v1'

export interface RazorpayPaymentLink {
  id: string
  short_url: string
  amount: number
  currency: string
  status: string
  description?: string
  customer?: { name?: string; email?: string; contact?: string }
  created_at?: number
  expire_by?: number
}

export interface RazorpayOrder {
  id: string
  amount: number
  currency: string
  status: string
  receipt?: string
  notes?: Record<string, string>
  created_at?: number
}

function razorpayHeaders(): Record<string, string> {
  const keyId = getCredential('RAZORPAY_KEY_ID') || ''
  const keySecret = getCredential('RAZORPAY_KEY_SECRET') || ''
  const encoded = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  return {
    Authorization: `Basic ${encoded}`,
    'Content-Type': 'application/json',
  }
}

export async function createRazorpayPaymentLink(options: {
  amountPaise: number
  description: string
  currency?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  callbackUrl?: string
  expireByTimestamp?: number
}): Promise<RazorpayPaymentLink | null> {
  const keyId = getCredential('RAZORPAY_KEY_ID')
  const keySecret = getCredential('RAZORPAY_KEY_SECRET')
  if (!keyId || !keySecret) return null
  try {
    const body: Record<string, unknown> = {
      amount: options.amountPaise,
      currency: options.currency || 'INR',
      description: options.description,
      notify: { email: true, sms: true },
      reminder_enable: true,
      callback_method: 'get',
    }
    const customer: Record<string, string> = {}
    if (options.customerName) customer.name = options.customerName
    if (options.customerEmail) customer.email = options.customerEmail
    if (options.customerPhone) customer.contact = options.customerPhone
    if (Object.keys(customer).length > 0) body.customer = customer
    if (options.callbackUrl) body.callback_url = options.callbackUrl
    if (options.expireByTimestamp) body.expire_by = options.expireByTimestamp

    const res = await fetch(`${RAZORPAY_BASE}/payment_links`, {
      method: 'POST',
      headers: razorpayHeaders(),
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const json = await res.json()
    return {
      id: json.id,
      short_url: json.short_url,
      amount: json.amount,
      currency: json.currency,
      status: json.status,
      description: json.description,
      customer: json.customer,
      created_at: json.created_at,
      expire_by: json.expire_by,
    }
  } catch {
    return null
  }
}

export async function getRazorpayPaymentLinks(
  count: number = 10
): Promise<RazorpayPaymentLink[]> {
  const keyId = getCredential('RAZORPAY_KEY_ID')
  const keySecret = getCredential('RAZORPAY_KEY_SECRET')
  if (!keyId || !keySecret) return []
  try {
    const res = await fetch(`${RAZORPAY_BASE}/payment_links?count=${count}`, {
      headers: razorpayHeaders(),
    })
    if (!res.ok) return []
    const json = await res.json()
    const items: Record<string, unknown>[] = json.items || []
    return items.map((item) => ({
      id: String(item.id || ''),
      short_url: String(item.short_url || ''),
      amount: Number(item.amount || 0),
      currency: String(item.currency || 'INR'),
      status: String(item.status || ''),
      description: item.description ? String(item.description) : undefined,
      customer: item.customer as RazorpayPaymentLink['customer'],
      created_at: item.created_at ? Number(item.created_at) : undefined,
      expire_by: item.expire_by ? Number(item.expire_by) : undefined,
    }))
  } catch {
    return []
  }
}

export async function createRazorpayOrder(
  amountPaise: number,
  currency: string = 'INR',
  notes?: Record<string, string>
): Promise<RazorpayOrder | null> {
  const keyId = getCredential('RAZORPAY_KEY_ID')
  const keySecret = getCredential('RAZORPAY_KEY_SECRET')
  if (!keyId || !keySecret) return null
  try {
    const body: Record<string, unknown> = {
      amount: amountPaise,
      currency,
      receipt: 'order_' + Date.now(),
    }
    if (notes) body.notes = notes

    const res = await fetch(`${RAZORPAY_BASE}/orders`, {
      method: 'POST',
      headers: razorpayHeaders(),
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const json = await res.json()
    return {
      id: json.id,
      amount: json.amount,
      currency: json.currency,
      status: json.status,
      receipt: json.receipt,
      notes: json.notes,
      created_at: json.created_at,
    }
  } catch {
    return null
  }
}

export async function getRazorpayStats(): Promise<{
  captured: number
  refunded: number
  total: number
  currency: string
  transactions: number
} | null> {
  const keyId = getCredential('RAZORPAY_KEY_ID')
  const keySecret = getCredential('RAZORPAY_KEY_SECRET')
  if (!keyId || !keySecret) return null
  try {
    const res = await fetch(`${RAZORPAY_BASE}/payments?count=100`, {
      headers: razorpayHeaders(),
    })
    if (!res.ok) return null
    const json = await res.json()
    const payments: Record<string, unknown>[] = json.items || []
    let captured = 0
    let refunded = 0
    let currency = 'INR'
    for (const p of payments) {
      if (p.status === 'captured') {
        captured += Number(p.amount || 0)
        currency = String(p.currency || 'INR')
      }
      if (p.amount_refunded) {
        refunded += Number(p.amount_refunded || 0)
      }
    }
    return {
      captured,
      refunded,
      total: captured - refunded,
      currency,
      transactions: payments.filter((p) => p.status === 'captured').length,
    }
  } catch {
    return null
  }
}

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const keySecret = getCredential('RAZORPAY_KEY_SECRET')
  if (!keySecret) return false
  try {
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex')
    return expectedSignature === signature
  } catch {
    return false
  }
}

export function isRazorpayAvailable(): boolean {
  return !!(getCredential('RAZORPAY_KEY_ID') && getCredential('RAZORPAY_KEY_SECRET'))
}
