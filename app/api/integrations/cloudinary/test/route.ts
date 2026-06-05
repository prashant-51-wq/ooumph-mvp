/**
 * POST /api/integrations/cloudinary/test — Sprint 19B
 *
 * Verifies a Cloudinary credential triple (cloud name + API key + API secret)
 * by hitting Cloudinary's /usage endpoint (which requires basic auth) and
 * returning a friendly status the dashboard renders next to the BYOK fields.
 *
 * On success we ALSO persist the three values to workspaces.model_settings so
 * the user doesn't need a separate "Save" click. (Cloudinary keys can't go
 * through `workspace_secrets` like single-key providers — they're 3 fields,
 * and the codebase reads them from model_settings.)
 *
 * Body: { workspaceId, cloudName, apiKey, apiSecret, persist?: boolean }
 * → { ok, status, message, plan?: string, usage?: {...} }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface Body {
  workspaceId: string
  cloudName: string
  apiKey: string
  apiSecret: string
  persist?: boolean
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, status: 'invalid', message: 'Invalid JSON body' }, { status: 400 })
  }

  const { workspaceId, cloudName, apiKey, apiSecret } = body
  if (!workspaceId) {
    return NextResponse.json({ ok: false, status: 'invalid', message: 'workspaceId required' }, { status: 400 })
  }
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ ok: false, status: 'missing', message: 'All three of cloudName, apiKey, apiSecret are required' }, { status: 400 })
  }

  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Hit Cloudinary's /usage endpoint with HTTP Basic auth.
  // Docs: https://cloudinary.com/documentation/admin_api#get_account_usage
  const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  let res: Response
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/usage`, {
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      status: 'network',
      message: err instanceof Error ? err.message : 'Network error reaching Cloudinary',
    })
  }

  if (res.status === 401 || res.status === 403) {
    return NextResponse.json({
      ok: false,
      status: 'invalid_credentials',
      message: 'Cloudinary rejected the credentials. Double-check Cloud Name, API Key, and API Secret on https://console.cloudinary.com/settings/api-keys',
    })
  }
  if (res.status === 404) {
    return NextResponse.json({
      ok: false,
      status: 'cloud_not_found',
      message: `No Cloudinary account named '${cloudName}'. The Cloud Name is the subdomain you see in the Cloudinary console URL.`,
    })
  }
  if (!res.ok) {
    return NextResponse.json({
      ok: false,
      status: 'http_error',
      message: `Cloudinary returned HTTP ${res.status}`,
    })
  }

  let usage: Record<string, unknown> = {}
  try { usage = await res.json() as Record<string, unknown> } catch { /* keep empty */ }

  // Persist on success (default behaviour — user can opt out via persist:false).
  if (body.persist !== false) {
    try {
      const wsRow = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
      let existing: Record<string, unknown> = {}
      const raw = (wsRow.rows[0] as { model_settings?: unknown } | undefined)?.model_settings
      if (typeof raw === 'string') {
        try { existing = JSON.parse(raw) as Record<string, unknown> } catch { existing = {} }
      } else if (raw && typeof raw === 'object') {
        existing = raw as Record<string, unknown>
      }
      const next = {
        ...existing,
        cloudinaryCloudName: cloudName,
        cloudinaryApiKey: apiKey,
        cloudinaryApiSecret: apiSecret,
      }
      await sql`UPDATE workspaces SET model_settings = ${JSON.stringify(next)} WHERE id = ${workspaceId}`
    } catch (err) {
      // Persist failure is non-fatal — the user still got a positive test.
      console.error('[cloudinary/test] persist failed:', err)
    }
  }

  return NextResponse.json({
    ok: true,
    status: 'connected',
    message: `Connected to '${cloudName}'.`,
    plan: usage.plan as string | undefined,
    usage: {
      credits_used: usage.credits as Record<string, unknown> | undefined,
      transformations: usage.transformations as Record<string, unknown> | undefined,
      storage: usage.storage as Record<string, unknown> | undefined,
      bandwidth: usage.bandwidth as Record<string, unknown> | undefined,
    },
  })
}
