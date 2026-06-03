import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are a conversion rate optimisation (CRO) expert and landing page copywriter.
You create landing page content that converts — clear value propositions, social proof, objection handling.
Respond ONLY with valid JSON.`

interface LandingPageVisualPack {
  pageName: string          // e.g. "Free Trial Landing Page", "Webinar Registration"
  hero: {
    tag: string             // eyebrow label
    headline: string        // main H1
    sub: string             // subheadline
    cta: string             // primary button text
  }
  features: {
    tag: string
    headline: string
    items: Array<{ title: string; desc: string }>  // max 3 items
  }
  stats: {
    items: Array<{ num: string; label: string }>   // max 4 stat items
  }
  cta: {
    tag: string
    headline: string
    sub: string
    cta: string
  }
  seoTitle: string          // meta title
  seoDescription: string    // meta description
  ogHeadline: string        // Open Graph / social share headline
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, pageType = 'lead_capture' } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Pull from Strategy + Funnel supervisors in parallel
    const [brandResult, strategyResult, funnelResult, leadGenResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      // Strategy supervisor — positioning, key messages, differentiation
      sql`SELECT content_json FROM artifacts
          WHERE workspace_id = ${workspaceId} AND type = 'strategy'
          ORDER BY created_at DESC LIMIT 1`,
      // Funnel supervisor — funnel stages, offers, pain points per stage
      sql`SELECT content_json FROM artifacts
          WHERE workspace_id = ${workspaceId} AND type = 'funnel_plan'
          ORDER BY created_at DESC LIMIT 1`,
      // Lead gen supervisor — lead magnets, ICP pain points, objections
      sql`SELECT content_json FROM artifacts
          WHERE workspace_id = ${workspaceId} AND type = 'lead_gen_plan'
          ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const funnel   = funnelResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const leadGen  = leadGenResult.rows[0]?.content_json as Record<string, unknown> | undefined

    const strategyContext = strategy ? `
STRATEGY (from Strategy Supervisor):
- Positioning: ${JSON.stringify((strategy as Record<string, unknown>).positioning || '')}
- Unique Value Prop: ${JSON.stringify((strategy as Record<string, unknown>).uniqueValueProp || (strategy as Record<string, unknown>).unique_value_prop || brand.unique_value_prop || '')}
- Key differentiators: ${JSON.stringify((strategy as Record<string, unknown>).differentiators || (strategy as Record<string, unknown>).keyDifferentiators || '')}
- Key messages: ${JSON.stringify((strategy as Record<string, unknown>).keyMessages || (strategy as Record<string, unknown>).key_messages || '')}` : ''

    const funnelContext = funnel ? `
FUNNEL PLAN (from Funnel Supervisor):
- Stages: ${JSON.stringify((funnel as Record<string, unknown>).stages || '')}
- Top of funnel offer: ${JSON.stringify((funnel as Record<string, unknown>).topOfFunnelOffer || (funnel as Record<string, unknown>).tofu || '')}
- Pain points addressed: ${JSON.stringify((funnel as Record<string, unknown>).painPoints || '')}` : ''

    const leadGenContext = leadGen ? `
LEAD GEN PLAN (from Lead Gen Supervisor):
- Lead magnet: ${JSON.stringify((leadGen as Record<string, unknown>).leadMagnet || '')}
- ICP pain points: ${JSON.stringify((leadGen as Record<string, unknown>).icpPainPoints || (leadGen as Record<string, unknown>).painPoints || '')}
- Objections to handle: ${JSON.stringify((leadGen as Record<string, unknown>).objections || '')}` : ''

    const PAGE_TYPES: Record<string, string> = {
      lead_capture: 'Lead Capture / Free Resource page',
      product:      'Product / Service landing page',
      webinar:      'Webinar / Event registration page',
      free_trial:   'Free Trial / Demo booking page',
      sale:         'Sales / Offer page',
    }

    const prompt = `Create a complete landing page visual pack for a ${PAGE_TYPES[pageType] || pageType}.

Business: ${brand.business_name}
Industry: ${brand.industry}
Target Audience: ${brand.target_audience}
Tone: ${brand.tone}
Products/Services: ${brand.products_services || ''}
${brand.unique_value_prop ? `Unique Value Prop: ${brand.unique_value_prop}` : ''}
${strategyContext}
${funnelContext}
${leadGenContext}

Rules:
- pageName: short name for this page (e.g. "Free Strategy Call Page")
- hero section (main above-the-fold):
  - tag: 3-5 word eyebrow (e.g. "FREE STRATEGY CALL", "LIMITED SPOTS")
  - headline: 6-10 word H1, outcome-focused (not features, BENEFITS)
  - sub: 15-25 words supporting the headline with specifics
  - cta: 3-6 word button (action-oriented, e.g. "Book My Free Call", "Get Instant Access")
- features: highlight the 3 biggest benefits/differentiators
  - tag: 3-4 word section label
  - headline: 5-8 word section title
  - items: exactly 3 items, each with a punchy title (3-5 words) and desc (12-20 words)
- stats: 3-4 credibility numbers (use real-looking specifics that reflect the industry)
  - each: num (e.g. "97%", "10X", "₹50L+", "500+") and label (3-8 words)
- cta section (bottom close):
  - tag: urgency label (e.g. "LIMITED TIME", "ACT NOW")
  - headline: 6-10 words, final persuasive push
  - sub: 12-20 words handling the last objection
  - cta: strong action button text (different from hero CTA)
- seoTitle: page title for browser tab (50-60 chars)
- seoDescription: meta description for Google (140-155 chars)
- ogHeadline: social share card headline (short, curiosity-driven, 6-10 words)

Return JSON only — no markdown.`

    const pack = await runAgent<LandingPageVisualPack>(SYSTEM, prompt, workspaceId)

    const contentJson = {
      ...pack,
      businessName: brand.business_name,
      tone: brand.tone,
      pageType,
      // Cross-supervisor references
      pulledFrom: {
        strategy: !!strategy,
        funnelPlan: !!funnel,
        leadGenPlan: !!leadGen,
      },
    }

    const artifactId = newId()
    const title = `Landing Page — ${pack.pageName || pageType}`
    await sql`INSERT INTO artifacts (id, workspace_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, 'landing_visual_pack', ${title}, ${JSON.stringify(contentJson)})`

    const approvalId = newId()
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id)
              VALUES (${approvalId}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'landing_visual_pack',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ artifactId, approvalId, pack: contentJson })
  } catch (error) {
    console.error('Landing page visual error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at,
           ap.status as approval_status, ap.id as approval_id, ap.notes as approval_notes
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'landing_visual_pack'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
