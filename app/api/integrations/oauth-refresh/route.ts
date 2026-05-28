/**
 * POST /api/integrations/oauth-refresh
 * Refreshes OAuth tokens for LinkedIn, Twitter, and Facebook when they expire.
 *
 * Body: { workspaceId: string, platform: 'linkedin' | 'twitter' | 'facebook' }
 *
 * LinkedIn: OAuth 2.0 refresh_token grant
 * Facebook: long-lived token exchange (fb_exchange_token)
 * Twitter:  OAuth 2.0 PKCE refresh_token grant (Basic auth)
 *
 * On success: updates integrations table with new token + status='active'
 * On failure: sets status='expired', returns error
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { readAccessToken, prepareAccessTokenWrite } from '@/lib/integrations'

type Platform = 'linkedin' | 'twitter' | 'facebook'

// ─── LinkedIn refresh ──────────────────────────────────────────────────────────

async function refreshLinkedIn(
  accessToken: string,
  meta: Record<string, unknown>,
): Promise<{ newAccessToken: string; newMeta: Record<string, unknown> }> {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('LinkedIn OAuth credentials not configured')

  const refreshToken = String(meta.refresh_token || '')
  if (!refreshToken) throw new Error('No refresh_token stored for LinkedIn integration')

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetchWithTimeout('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    timeoutMs: 15000,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status))
    throw new Error(`LinkedIn token refresh failed (${res.status}): ${errText}`)
  }

  interface LinkedInTokenResponse {
    access_token: string
    expires_in?: number
    refresh_token?: string
    refresh_token_expires_in?: number
  }
  const data = (await res.json()) as LinkedInTokenResponse

  if (!data.access_token) throw new Error('LinkedIn response missing access_token')

  const newMeta: Record<string, unknown> = {
    ...meta,
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    ...(data.expires_in
      ? { expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString() }
      : {}),
  }

  return { newAccessToken: data.access_token, newMeta }
}

// ─── Facebook long-lived token exchange ───────────────────────────────────────

async function refreshFacebook(
  accessToken: string,
  meta: Record<string, unknown>,
): Promise<{ newAccessToken: string; newMeta: Record<string, unknown> }> {
  const appId = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET
  if (!appId || !appSecret) throw new Error('Facebook app credentials not configured')

  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: accessToken,
  })

  const res = await fetchWithTimeout(
    `https://graph.facebook.com/v18.0/oauth/access_token?${params.toString()}`,
    {
      method: 'GET',
      timeoutMs: 15000,
    },
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status))
    throw new Error(`Facebook token exchange failed (${res.status}): ${errText}`)
  }

  interface FacebookTokenResponse {
    access_token: string
    token_type?: string
    expires_in?: number
  }
  const data = (await res.json()) as FacebookTokenResponse

  if (!data.access_token) throw new Error('Facebook response missing access_token')

  const newMeta: Record<string, unknown> = {
    ...meta,
    token_type: data.token_type || 'bearer',
    ...(data.expires_in
      ? { expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString() }
      : {}),
  }

  return { newAccessToken: data.access_token, newMeta }
}

// ─── Twitter OAuth 2.0 PKCE refresh ───────────────────────────────────────────

async function refreshTwitter(
  _accessToken: string,
  meta: Record<string, unknown>,
): Promise<{ newAccessToken: string; newMeta: Record<string, unknown> }> {
  const clientId = process.env.TWITTER_CLIENT_ID
  const clientSecret = process.env.TWITTER_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Twitter OAuth credentials not configured')

  const refreshToken = String(meta.refresh_token || '')
  if (!refreshToken) throw new Error('No refresh_token stored for Twitter integration')

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })

  const res = await fetchWithTimeout('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: params.toString(),
    timeoutMs: 15000,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status))
    throw new Error(`Twitter token refresh failed (${res.status}): ${errText}`)
  }

  interface TwitterTokenResponse {
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
    scope?: string
  }
  const data = (await res.json()) as TwitterTokenResponse

  if (!data.access_token) throw new Error('Twitter response missing access_token')

  const newMeta: Record<string, unknown> = {
    ...meta,
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    ...(data.expires_in
      ? { expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString() }
      : {}),
    ...(data.scope ? { scope: data.scope } : {}),
  }

  return { newAccessToken: data.access_token, newMeta }
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { workspaceId: string; platform: Platform }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { workspaceId, platform } = body

  if (!workspaceId || !platform) {
    return NextResponse.json({ error: 'workspaceId and platform are required' }, { status: 400 })
  }

  if (!['linkedin', 'twitter', 'facebook'].includes(platform)) {
    return NextResponse.json(
      { error: 'platform must be one of: linkedin, twitter, facebook' },
      { status: 400 },
    )
  }

  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Load current integration.
  // Sprint 9C: select both token columns. Use readAccessToken() so we
  // can refresh integrations whose token was stored via Sprint 9B's
  // encrypted_access_token path.
  const integResult = await sql`
    SELECT id, access_token, encrypted_access_token, metadata FROM integrations
    WHERE workspace_id = ${workspaceId} AND platform = ${platform}
    LIMIT 1
  `

  if (!integResult.rows[0]) {
    return NextResponse.json(
      { error: `No ${platform} integration found for this workspace` },
      { status: 404 },
    )
  }

  const integId = String(integResult.rows[0].id)
  const currentAccessToken = readAccessToken({
    access_token: integResult.rows[0].access_token as string | null,
    encrypted_access_token: integResult.rows[0].encrypted_access_token as string | null,
  }) || ''

  let meta: Record<string, unknown> = {}
  try {
    const rawMeta = integResult.rows[0].metadata
    if (rawMeta) {
      meta = (typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta) as Record<string, unknown>
    }
  } catch { /* ignore parse errors */ }

  const now = new Date().toISOString()

  try {
    let newAccessToken: string
    let newMeta: Record<string, unknown>

    if (platform === 'linkedin') {
      ;({ newAccessToken, newMeta } = await refreshLinkedIn(currentAccessToken, meta))
    } else if (platform === 'facebook') {
      ;({ newAccessToken, newMeta } = await refreshFacebook(currentAccessToken, meta))
    } else {
      // twitter
      ;({ newAccessToken, newMeta } = await refreshTwitter(currentAccessToken, meta))
    }

    // Sprint 9C: write the rotated token to BOTH columns. Without
    // updating encrypted_access_token, publish/direct + publish (which
    // moved to readAccessToken in 9B and prefer encrypted) would keep
    // returning the OLD token and hit 401 from the provider — exactly
    // the latent drift the post-Sprint-8 audit flagged.
    const tokenWrite = prepareAccessTokenWrite(newAccessToken)
    await sql`
      UPDATE integrations
      SET access_token           = ${tokenWrite.plaintext},
          encrypted_access_token = ${tokenWrite.encrypted},
          metadata               = ${JSON.stringify(newMeta)},
          status                 = 'active'
      WHERE id = ${integId}
    `

    return NextResponse.json({
      ok: true,
      platform,
      refreshed: true,
      expiresAt: newMeta.expires_at ? String(newMeta.expires_at) : null,
      refreshedAt: now,
    })
  } catch (err) {
    console.error(`OAuth refresh failed for ${platform} (workspace=${workspaceId}):`, err)

    // Mark integration as expired so the UI can prompt reconnect
    await sql`
      UPDATE integrations
      SET status = 'expired'
      WHERE id = ${integId}
    `.catch(() => { /* non-fatal */ })

    return NextResponse.json(
      {
        ok: false,
        platform,
        refreshed: false,
        error: (err as Error).message || String(err),
      },
      { status: 502 },
    )
  }
}
