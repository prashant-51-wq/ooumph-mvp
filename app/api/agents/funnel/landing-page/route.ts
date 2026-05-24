/**
 * Landing Page Builder Worker — Lead & Funnel Ops Supervisor
 * Generates complete, production-ready HTML landing pages with
 * optimised copy, structure, and conversion elements.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the Landing Page Builder Agent for Ooumph AI Marketing OS.
You create high-converting landing pages with persuasive copy, clear structure, and strong CTAs.
Apply proven CRO principles: single focus, social proof, urgency, specificity.
Always respond with valid JSON.`

interface LandingPageSection {
  sectionType: 'hero' | 'pain_points' | 'solution' | 'features' | 'social_proof' | 'offer' | 'faq' | 'final_cta'
  headline: string
  subtext: string
  bullets?: string[]
  cta?: string
  designNote: string           // visual/layout guidance for developers/designers
}

interface LandingPage {
  metaTitle: string            // SEO title tag
  metaDescription: string      // SEO meta description
  pageGoal: string             // single conversion goal
  targetKeyword: string        // primary SEO keyword
  headline: string             // main H1
  subheadline: string
  sections: LandingPageSection[]
  socialProofItems: string[]   // testimonials / logos / stats
  urgencyElement: string       // scarcity / deadline / limited offer
  formFields: string[]         // lead capture form fields
  thankYouMessage: string      // post-submission message
  abTestVariant: {             // alternative headline to A/B test
    headline: string
    subheadline: string
  }
  seoSchema: string            // JSON-LD schema markup suggestion
  htmlTemplate: string         // complete HTML page (Tailwind CDN, mobile-first)
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, pageType, leadMagnet } = await req.json() as {
      workspaceId: string
      pageType?: 'lead_magnet' | 'product' | 'webinar' | 'consultation' | 'waitlist'
      leadMagnet?: string
    }
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

    const [brandResult, strategyResult, funnelResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'funnel_plan' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'landing_page_builder', 'running')`

    const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const funnel = funnelResult.rows[0]?.content_json as Record<string, unknown> | undefined

    const funnelLP = (funnel as { landingPage?: Record<string, unknown> })?.landingPage
    const funnelLM = (funnel as { leadMagnet?: Record<string, unknown> })?.leadMagnet

    const prompt = `Build a high-converting landing page for:

Business: ${brand.business_name}
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}
Tone: ${brand.tone}
Industry: ${brand.industry || 'Not specified'}
Page Type: ${pageType || 'lead_magnet'}
${leadMagnet ? `Lead Magnet: ${leadMagnet}` : funnelLM ? `Lead Magnet from Funnel Plan: ${JSON.stringify(funnelLM)}` : ''}
${funnelLP ? `Funnel blueprint: ${JSON.stringify(funnelLP)}` : ''}
${strategy ? `Positioning: ${JSON.stringify((strategy as Record<string, unknown>).positioning || '')}` : ''}
Prohibited Claims: ${brand.prohibited_claims || 'None'}

CRO Rules:
- Single conversion goal per page
- Hero section must answer "What is it / Who is it for / What do I get / Why now"
- Use specificity over vague claims ("Get 47 leads in 14 days" not "Get more leads")
- Social proof section must have specific numbers or named sources
- Include urgency/scarcity element (ethical, not fake)
- Form must be above the fold and in the final CTA

The HTML template should:
- Use Tailwind CSS via CDN
- Be fully mobile-responsive
- Have a dark/professional colour palette matching the brand tone
- Include form submit handler placeholder (action="YOUR_FORM_ENDPOINT")
- Be production-ready, clean code

Return JSON:
{
  "metaTitle": "SEO title under 60 chars",
  "metaDescription": "Meta description under 160 chars",
  "pageGoal": "Single conversion goal",
  "targetKeyword": "primary keyword",
  "headline": "Main H1 headline",
  "subheadline": "Supporting subheadline",
  "sections": [
    {
      "sectionType": "hero|pain_points|solution|features|social_proof|offer|faq|final_cta",
      "headline": "Section headline",
      "subtext": "Section body copy",
      "bullets": ["bullet1", "bullet2"],
      "cta": "CTA button text",
      "designNote": "Visual guidance for developers"
    }
  ],
  "socialProofItems": ["Testimonial or stat 1", "Testimonial 2"],
  "urgencyElement": "Limited time / limited spots element",
  "formFields": ["First Name", "Email", "Company"],
  "thankYouMessage": "Post-submission thank you message",
  "abTestVariant": {
    "headline": "Alternative H1",
    "subheadline": "Alternative subheadline"
  },
  "seoSchema": "JSON-LD schema type suggestion",
  "htmlTemplate": "COMPLETE HTML — must be valid, mobile-first, Tailwind CDN"
}`

    const page = await runAgent<LandingPage>(SYSTEM, prompt)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(page)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = `Landing Page — ${pageType || 'Lead Magnet'} — ${brand.business_name}`
    const contentJson = { ...page, businessName: brand.business_name, pageType: pageType || 'lead_magnet' }
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'landing_page', ${title}, ${JSON.stringify(contentJson)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'landing_page',
        artifactTitle: title,
      })
    }

    return NextResponse.json({
      artifactId,
      page: contentJson,
      sectionCount: page.sections?.length || 0,
      message: `Landing page built: ${page.sections?.length || 0} sections, A/B headline variant included, HTML ready to deploy.`,
    })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('Landing page builder error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at,
           ap.status as approval_status
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'landing_page'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
