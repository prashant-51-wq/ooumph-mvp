/**
 * GET /api/l/[slug]
 *
 * The analytics redirector. Resolves a 6-char slug → original URL,
 * fire-and-forgets the click event into link_clicks, then issues an
 * immediate 302. End user sees a flawless hand-off — the click logging
 * happens out-of-band so it never adds latency.
 *
 * If the slug is unknown / disabled we redirect to the workspace base
 * (rather than 404) so the user never sees a broken-link page from a
 * tracked shortlink in the wild.
 *
 * Trailing-slash robustness: Next.js matches both `/api/l/abc` and
 * `/api/l/abc/`; the slug param is the same in either case. We also
 * strip whitespace and lowercase normalization is intentionally NOT
 * applied (slugs are case-sensitive base57).
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { resolveSlug, recordClick } from '@/lib/link-tracker'

export const runtime = 'nodejs'
// This route should never be cached — it's a one-shot redirect per click.
export const dynamic = 'force-dynamic'

interface RouteCtx {
  params: Promise<{ slug: string }>
}

const FALLBACK_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://ooumph.com'

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { slug: rawSlug } = await ctx.params
  // Tolerate trailing punctuation that might sneak in from copy/paste
  // (e.g. "/api/l/abc123." in a poorly-parsed clipboard).
  const slug = (rawSlug || '').trim().replace(/[.,!?)\];:]+$/, '')

  if (!slug) {
    return NextResponse.redirect(FALLBACK_URL, 302)
  }

  const link = await resolveSlug(slug)
  if (!link) {
    // Unknown / disabled slug — fall back to the workspace base URL so the
    // end user never lands on a 404 from a tracked shortlink.
    return NextResponse.redirect(FALLBACK_URL, 302)
  }

  // ─── Vercel lifecycle safety: after() ─────────────────────────────────────
  // Without after(), a `void recordClick(...)` would race the lambda freeze
  // — Vercel can suspend the function the moment the 302 response is flushed,
  // killing the in-flight INSERT. Wrapping the click log in `after()` registers
  // it with Next.js's serverless runtime: the lambda is guaranteed to stay
  // warm until the registered promise settles, BUT the response still flushes
  // immediately. End user sees zero added latency; the click row reliably lands.
  const referrer = req.headers.get('referer') || req.headers.get('referrer')
  const userAgent = req.headers.get('user-agent')
  const country = req.headers.get('x-vercel-ip-country')
    || req.headers.get('cf-ipcountry')
    || null

  after(async () => {
    try {
      await recordClick({
        slug,
        workspaceId: link.workspace_id,
        channel: link.channel,
        referrer,
        userAgent,
        country,
      })
    } catch (err) {
      // recordClick already swallows errors internally, but belt-and-braces:
      // never let a click-log failure propagate up through after().
      console.error('[api/l] after-handler recordClick threw:', err)
    }
  })

  return NextResponse.redirect(link.original_url, 302)
}
