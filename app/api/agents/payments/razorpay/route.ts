/**
 * Razorpay Payments Worker — Payments Supervisor
 * POST /api/agents/payments/razorpay — create payment links, orders, and query stats
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { withCredentials } from '@/lib/credential-context'
import {
  createRazorpayPaymentLink,
  getRazorpayPaymentLinks,
  createRazorpayOrder,
  getRazorpayStats,
  isRazorpayAvailable,
} from '@/lib/tools/razorpay'

interface RazorpayRequest {
  workspaceId: string
  action: 'create_link' | 'list_links' | 'create_order' | 'stats'
  // create_link
  amountPaise?: number
  description?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  callbackUrl?: string
  // list_links
  count?: number
  // create_order
  notes?: Record<string, string>
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
    const body = await req.json() as RazorpayRequest
    const { workspaceId, action, amountPaise, description, customerName,
      customerEmail, customerPhone, callbackUrl, count, notes } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    // Sprint 18I/J: ownership gate so a logged-in user can't drive
    // another workspace's Razorpay account.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const settings = await getSettings(workspaceId)
    if (!settings) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    // Sprint 18I: request-scoped credentials — was process.env mutation.
    return withCredentials(
      {
        RAZORPAY_KEY_ID: settings.razorpayKeyId as string | undefined,
        RAZORPAY_KEY_SECRET: settings.razorpayKeySecret as string | undefined,
      },
      async () => {
        if (!isRazorpayAvailable()) {
          return NextResponse.json({
            ok: false,
            error: 'Razorpay not configured. Add your Key ID and Key Secret in Settings → Payments.',
            requiresSetup: true,
          })
        }

        // ── Create Payment Link ───────────────────────────────────────────────
        if (action === 'create_link') {
          if (!amountPaise) {
            return NextResponse.json({ error: 'Missing amountPaise' }, { status: 400 })
          }
          const link = await createRazorpayPaymentLink({
            amountPaise,
            description: description || '',
            customerName,
            customerEmail,
            customerPhone,
            callbackUrl,
          })
          if (!link) return NextResponse.json({ ok: false, error: 'Failed to create payment link. Check your Razorpay credentials.' }, { status: 500 })
          return NextResponse.json({ ok: true, link: { id: link.id, short_url: link.short_url, amount: link.amount } })
        }

        // ── List Payment Links ────────────────────────────────────────────────
        if (action === 'list_links') {
          const links = await getRazorpayPaymentLinks(count || 20)
          return NextResponse.json({ ok: true, links })
        }

        // ── Create Order ──────────────────────────────────────────────────────
        if (action === 'create_order') {
          if (!amountPaise) {
            return NextResponse.json({ error: 'Missing amountPaise' }, { status: 400 })
          }
          const order = await createRazorpayOrder(amountPaise, 'INR', notes)
          return NextResponse.json({ ok: true, order })
        }

        // ── Stats ─────────────────────────────────────────────────────────────
        if (action === 'stats') {
          const stats = await getRazorpayStats()
          return NextResponse.json({ ok: true, stats })
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
      },
    )
  } catch (error) {
    console.error('Razorpay payments route error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
