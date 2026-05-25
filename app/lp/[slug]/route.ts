/**
 * GET /lp/{artifactId}
 * Serves a live landing page from the artifacts table (raw HTML response).
 */
import { NextRequest } from 'next/server'
import { sql } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: artifactId } = await params

  if (!artifactId) {
    return new Response('<html><body><h1>404 — Not Found</h1></body></html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const result = await sql`
    SELECT title, content_json FROM artifacts
    WHERE id = ${artifactId} AND type = 'landing_page'
    LIMIT 1
  `

  const row = result.rows[0]
  if (!row) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Not Found</title></head><body style="font-family:sans-serif;text-align:center;padding:80px;background:#111;color:#fff;"><h1>404</h1><p>Landing page not found.</p></body></html>`,
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    )
  }

  const contentJson = row.content_json as Record<string, unknown>
  let html = String(contentJson.htmlTemplate || '')

  if (!html) {
    return new Response(
      `<!DOCTYPE html><html><head><title>No Content</title></head><body style="font-family:sans-serif;text-align:center;padding:80px;background:#111;color:#fff;"><h1>Page has no HTML content.</h1></body></html>`,
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Replace form action placeholder with the real submission endpoint
  html = html.replace(/action="YOUR_FORM_ENDPOINT"/g, `action="/api/lp-submit?lid=${artifactId}"`)
  html = html.replace(/action='YOUR_FORM_ENDPOINT'/g, `action="/api/lp-submit?lid=${artifactId}"`)

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })
}
