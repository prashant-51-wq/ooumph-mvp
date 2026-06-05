/**
 * Retargeting Worker: Pixel Strategy Designer
 * POST { workspaceId, platforms, pages? }
 * GET  ?workspaceId=xxx
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { sendApprovalRequestEmail } from '@/lib/email'
import type { BrandProfile } from '@/types'
import { designPixelStrategy } from '@/lib/agents/retargeting'

const SYSTEM = `You are a marketing technology architect specializing in pixel implementation and tag management.
You generate precise, copy-paste-ready implementation code.
Respond ONLY with valid JSON.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      platforms?: string[]
      pages?: string[]
    }
    const { workspaceId } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // ── Determine platforms ───────────────────────────────────────────────────
    let platforms = body.platforms
    if (!platforms || platforms.length === 0) {
      // Infer from brand channels + published content platforms
      const [channelsData, publishedRes] = await Promise.all([
        Promise.resolve(Array.isArray(brand.channels) ? brand.channels : []),
        sql`SELECT DISTINCT platform FROM published_content WHERE workspace_id = ${workspaceId}`,
      ])
      const publishedPlatforms = publishedRes.rows.map(r => String(r.platform))
      const allChannels = [...channelsData, ...publishedPlatforms]

      const pixelMap: Record<string, string> = {
        instagram: 'meta',
        facebook: 'meta',
        'facebook ads': 'meta',
        google: 'google',
        'google ads': 'google',
        youtube: 'google',
        linkedin: 'linkedin',
        tiktok: 'tiktok',
        twitter: 'twitter',
        x: 'twitter',
        pinterest: 'pinterest',
      }

      platforms = [...new Set(
        allChannels.map(c => pixelMap[c.toLowerCase()] || c.toLowerCase())
          .filter(p => ['meta', 'google', 'linkedin', 'tiktok', 'twitter', 'pinterest'].includes(p))
      )]

      if (platforms.length === 0) platforms = ['meta', 'google']
    }

    // ── Determine pages from brand context if not provided ────────────────────
    let pages = body.pages
    if (!pages || pages.length === 0) {
      // Infer pages from brand profile and typical business structure
      interface InferredPages { pages: string[]; reasoning: string }
      const pagesResult = await runAgent<InferredPages>(
        SYSTEM,
        `Based on this business profile, infer the likely website page structure.

Business: ${brand.business_name}
Industry: ${brand.industry || 'service business'}
Offer: ${brand.offer}
Goals: ${brand.goals}

Return the most likely page paths for this type of business:
{
  "pages": ["/", "/about", "/services", "/pricing", "/contact", "/book", "/thank-you"],
  "reasoning": "brief explanation of why these pages"
}`,
        workspaceId,
      )
      pages = pagesResult.pages || ['/', '/about', '/services', '/pricing', '/contact', '/book', '/thank-you']
    }

    // ── Generate the pixel strategy ───────────────────────────────────────────
    const strategy = await designPixelStrategy(brand, platforms, pages)

    // ── Generate GTM container configuration ─────────────────────────────────
    interface GtmConfig {
      containerName: string
      tags: Array<{ name: string; type: string; firingTriggers: string[]; code?: string }>
      triggers: Array<{ name: string; type: string; condition: string }>
      variables: Array<{ name: string; type: string; value: string }>
      testingChecklist: string[]
    }
    const gtmConfig = await runAgent<GtmConfig>(
      SYSTEM,
      `Generate a Google Tag Manager container configuration for these pixels.

Business: ${brand.business_name}
Platforms needing pixels: ${platforms.join(', ')}
Pages: ${pages.join(', ')}
Standard events needed: ${JSON.stringify(strategy.standardEvents?.map(e => ({ event: e.event, page: e.pagePath })))}
Custom events: ${JSON.stringify(strategy.customEvents?.map(e => e.name))}

Return a GTM configuration:
{
  "containerName": "container name",
  "tags": [
    {
      "name": "tag name e.g. Meta Pixel — Base Code",
      "type": "Custom HTML|Google Analytics 4|Conversion Linker",
      "firingTriggers": ["All Pages", "specific trigger name"],
      "code": "<!-- actual pixel base code or gtag snippet -->"
    }
  ],
  "triggers": [
    {
      "name": "trigger name e.g. Pricing Page View",
      "type": "Page View|Click|Form Submission|Scroll Depth|Timer",
      "condition": "Page URL contains /pricing"
    }
  ],
  "variables": [
    {
      "name": "variable name",
      "type": "Data Layer Variable|URL|Click Text",
      "value": "variable value or data layer key"
    }
  ],
  "testingChecklist": [
    "Step 1: Enable GTM Preview mode",
    "Step 2: Visit each page and verify tags fire",
    "Step 3: Check Facebook Pixel Helper extension for Meta events"
  ]
}`,
      workspaceId,
    )

    // ── Verification checklist per platform ────────────────────────────────────
    const verificationSteps: Record<string, string[]> = {}
    for (const p of platforms) {
      if (p === 'meta') {
        verificationSteps.meta = [
          'Install "Meta Pixel Helper" Chrome extension',
          'Visit each page — confirm blue badge (pixel firing)',
          'Check Events Manager → Test Events → enter your website URL',
          'Verify each standard event fires on the correct page/action',
          'Confirm no duplicate events (red badge in Pixel Helper = issue)',
          'Test purchase event by simulating checkout (use test mode)',
          'Enable Conversions API (CAPI) for server-side deduplication',
        ]
      }
      if (p === 'google') {
        verificationSteps.google = [
          'Install "Tag Assistant Legacy" Chrome extension',
          'Enable recording and visit key pages',
          'Verify Google tag loads on every page (green badge)',
          'Check Realtime report in GA4 to confirm events arriving',
          'In Google Ads: Tools → Conversions → check tag status turns green',
          'Use Google Ads Preview & Diagnose to test conversion tracking',
        ]
      }
      if (p === 'linkedin') {
        verificationSteps.linkedin = [
          'Install "LinkedIn Insight Tag Helper" Chrome extension',
          'Visit your website — verify tag fires on key pages',
          'In Campaign Manager → Analyze → Insight Tag — check domain status',
          'Wait 24 hours for conversion tracking to activate',
          'Test a Lead Gen Form submission to verify LeadGenFormComplete fires',
        ]
      }
      if (p === 'tiktok') {
        verificationSteps.tiktok = [
          'In TikTok Ads Manager → Assets → Events — check pixel status',
          'Use "Test Events" tool in TikTok Events Manager',
          'Visit your website and complete a test conversion',
          'Verify events appear in real-time in the Events Manager console',
          'Enable Conversions API (CAPI) for iOS signal recovery',
        ]
      }
    }

    const result = {
      strategy,
      platforms,
      pages,
      gtmConfig,
      verificationSteps,
      priorityOrder: [
        '1. Install base pixel code via GTM on ALL pages first',
        '2. Set up standard events on conversion pages',
        '3. Create custom audiences from day 1 (audiences build retroactively)',
        '4. Add custom events for granular segmentation',
        '5. Enable server-side CAPI for privacy-resilient tracking',
        '6. Verify all events with platform-specific testing tools',
      ],
      generatedAt: new Date().toISOString(),
    }

    // ── Save artifact ─────────────────────────────────────────────────────────
    const runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'retargeting_pixel', 'completed')`

    const artifactId = newId()
    const title = `Pixel Strategy (${platforms.join(', ')}) — ${brand.business_name}`
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'pixel_strategy', ${title}, ${JSON.stringify(result)})`

    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'pixel_strategy',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ ok: true, artifactId, ...result })
  } catch (error) {
    console.error('Pixel strategy error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'pixel_strategy'
    ORDER BY a.created_at DESC LIMIT 5
  `
  return NextResponse.json(result.rows)
}
