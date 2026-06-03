/**
 * GET  /api/billing/plans          — list active plans
 * POST /api/billing/plans          — seed default plans (first-run setup)
 * PATCH /api/billing/plans         — update a plan (admin only)
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

const DEFAULT_PLANS = [
  {
    slug: 'free',
    name: 'Free',
    price_monthly: 0,
    commission_rate: 0,
    max_sub_accounts: 0,
    max_ai_runs_monthly: 100,
    sort_order: 0,
    features: JSON.stringify(['100 AI runs/month', '1 workspace', 'Core features']),
  },
  {
    slug: 'starter',
    name: 'Starter',
    price_monthly: 9900, // $99 in cents
    commission_rate: 0,
    max_sub_accounts: 0,
    max_ai_runs_monthly: 500,
    sort_order: 1,
    features: JSON.stringify(['500 AI runs/month', '1 workspace', 'All features', 'Email support']),
  },
  {
    slug: 'pro',
    name: 'Pro',
    price_monthly: 19900, // $199
    commission_rate: 0,
    max_sub_accounts: 0,
    max_ai_runs_monthly: -1,
    sort_order: 2,
    features: JSON.stringify(['Unlimited AI runs', '1 workspace', 'All features', 'Priority support', 'Analytics']),
  },
  {
    slug: 'agency',
    name: 'Agency',
    price_monthly: 49700, // $497
    commission_rate: 0.15, // 15% commission on client sales
    max_sub_accounts: 10,
    max_ai_runs_monthly: -1,
    sort_order: 3,
    features: JSON.stringify(['Unlimited AI runs', 'Up to 10 client sub-accounts', 'White-label branding', '15% platform commission on client sales', 'Agency dashboard', 'Priority support']),
  },
  {
    slug: 'agency_scale',
    name: 'Agency Scale',
    price_monthly: 99700, // $997
    commission_rate: 0.12, // 12% commission
    max_sub_accounts: -1,
    max_ai_runs_monthly: -1,
    sort_order: 4,
    features: JSON.stringify(['Unlimited AI runs', 'Unlimited client sub-accounts', 'White-label + custom domain', '12% platform commission on client sales', 'Dedicated support', 'API access']),
  },
]

export async function GET() {
  // Auto-seed plans on first request if table is empty (zero-config setup)
  const count = await sql`SELECT COUNT(*) as c FROM plans`
  if (Number(count.rows[0]?.c || 0) === 0) {
    for (const plan of DEFAULT_PLANS) {
      await sql`
        INSERT INTO plans (id, name, slug, price_monthly, commission_rate, max_sub_accounts, max_ai_runs_monthly, features, sort_order)
        VALUES (${newId()}, ${plan.name}, ${plan.slug}, ${plan.price_monthly}, ${plan.commission_rate}, ${plan.max_sub_accounts}, ${plan.max_ai_runs_monthly}, ${plan.features}, ${plan.sort_order})
      `.catch(() => { /* ignore if already exists */ })
    }
  }
  const result = await sql`SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order ASC`
  return NextResponse.json(result.rows)
}

function checkAdminSecret(provided: unknown): boolean {
  const expected = process.env.ADMIN_SECRET || ''
  if (!expected) return false  // fail-closed: never pass when secret unset
  return typeof provided === 'string' && provided === expected
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { action?: string; adminSecret?: string }

    // Seed default plans — requires admin secret
    if (body.action === 'seed') {
      if (!checkAdminSecret(body.adminSecret)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      for (const plan of DEFAULT_PLANS) {
        const existing = await sql`SELECT id FROM plans WHERE slug = ${plan.slug} LIMIT 1`
        if (!existing.rows[0]) {
          await sql`
            INSERT INTO plans (id, name, slug, price_monthly, commission_rate, max_sub_accounts, max_ai_runs_monthly, features, sort_order)
            VALUES (${newId()}, ${plan.name}, ${plan.slug}, ${plan.price_monthly}, ${plan.commission_rate}, ${plan.max_sub_accounts}, ${plan.max_ai_runs_monthly}, ${plan.features}, ${plan.sort_order})
          `
        }
      }
      return NextResponse.json({ ok: true, seeded: DEFAULT_PLANS.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { id: string; stripe_price_id?: string; stripe_price_id_yearly?: string; is_active?: number; commission_rate?: number; adminSecret?: string }
    if (!checkAdminSecret(body.adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id, stripe_price_id, stripe_price_id_yearly, is_active, commission_rate } = body
    await sql`
      UPDATE plans SET
        stripe_price_id = COALESCE(${stripe_price_id || null}, stripe_price_id),
        stripe_price_id_yearly = COALESCE(${stripe_price_id_yearly || null}, stripe_price_id_yearly),
        is_active = COALESCE(${is_active ?? null}, is_active),
        commission_rate = COALESCE(${commission_rate ?? null}, commission_rate)
      WHERE id = ${id}
    `
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
