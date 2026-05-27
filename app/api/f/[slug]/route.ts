/**
 * GET /api/f/[slug]
 *
 * Public funnel landing page renderer. Serves a row from `funnel_steps` as
 * raw HTML, bumping `view_count` out-of-band so the response is never
 * blocked by analytics writes.
 *
 *   GET /api/f/saas-demo-2026
 *   → 200  Content-Type: text/html; charset=utf-8
 *     <full landing page html>
 *
 *   GET /api/f/nonexistent
 *   → 404  text/html
 *     <minimal "page not found" page>
 *
 * Lifecycle safety
 * ────────────────
 * The view-count increment is wrapped in Next.js's `after()` primitive so
 * Vercel keeps the lambda warm until the UPDATE commits — even though the
 * HTML response flushes to the browser immediately. This matches the same
 * lifecycle pattern proven on the `/api/l/[slug]` redirector in Sprint 2.
 *
 * Security
 * ────────
 * - This route is intentionally PUBLIC (no workspace ownership check) — the
 *   whole point is that prospects can hit the URL from an ad click.
 * - `html_content` is rendered AS-IS. Authors are responsible for keeping
 *   the markup safe; we wrap with restrictive headers (X-Frame-Options, etc.)
 *   to mitigate the obvious abuse vectors.
 * - Slug is regex-validated before any DB lookup to short-circuit injection.
 *
 * Trailing-slash robustness mirrors `/api/l/[slug]`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'   // never cache — view counts must be live

interface RouteCtx {
  params: Promise<{ slug: string }>
}

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

const FALLBACK_404_HTML = `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Page not found</title>
  <style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
           background:#0b0d12; color:#e7e9ee; min-height:100vh;
           display:flex; align-items:center; justify-content:center; text-align:center; }
    .card { padding:48px 32px; max-width:480px; }
    h1 { font-size:48px; margin:0 0 8px; font-weight:700; letter-spacing:-0.02em; }
    p { color:#8b93a3; margin:0; line-height:1.6; }
  </style>
</head><body>
  <div class="card">
    <h1>404</h1>
    <p>The funnel page you're looking for doesn't exist or was archived.</p>
  </div>
</body></html>`

function htmlResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Prevent the page from being embedded in malicious iframes.
      'X-Frame-Options': 'SAMEORIGIN',
      // Light defaults — authors can override via <meta http-equiv> in their html_content.
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      // Don't let any intermediate proxy cache funnel pages — engagement
      // metrics depend on every request hitting our DB.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  })
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { slug: rawSlug } = await ctx.params
  // Tolerate trailing punctuation (e.g. clipboard paste of "demo.").
  const slug = (rawSlug || '').trim().replace(/[.,!?)\];:]+$/, '')

  // Cheap regex pre-filter — invalid slugs never touch the DB.
  if (!slug || !SLUG_PATTERN.test(slug)) {
    return htmlResponse(FALLBACK_404_HTML, 404)
  }

  const result = await sql`
    SELECT id, workspace_id, html_content
    FROM funnel_steps WHERE slug = ${slug} LIMIT 1
  `
  const row = result.rows[0] as { id?: string; workspace_id?: string; html_content?: string } | undefined
  if (!row?.html_content) {
    return htmlResponse(FALLBACK_404_HTML, 404)
  }

  // Lifecycle-safe atomic view_count bump. Vercel keeps the function alive
  // until the UPDATE settles, but the HTML response flushes immediately so
  // the end-user sees the page instantly.
  const funnelStepId = String(row.id || '')
  after(async () => {
    try {
      await sql`
        UPDATE funnel_steps
        SET view_count = view_count + 1
        WHERE id = ${funnelStepId}
      `
    } catch (err) {
      // View-count failures are non-fatal — log only.
      console.error('[api/f] view_count bump failed:', err)
    }
  })

  return htmlResponse(row.html_content, 200)
}
