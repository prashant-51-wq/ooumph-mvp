/**
 * GET /api/integrations/oauth/[platform]/callback
 *
 * The provider hands us back `?code=...&state=...`. We:
 *
 *   1. Decrypt the state token (AES-256-GCM via lib/oauth-state.ts).
 *      Fails-closed on tampering, expiry, or shape mismatch.
 *   2. Verify the platform in the URL matches the platform in the state —
 *      blocks attackers from cross-platform-confusion attacks.
 *   3. Exchange `code` for an access (+ optional refresh) token at the
 *      provider's token endpoint.
 *   4. Encrypt the tokens via lib/secrets.ts and UPSERT into oauth_tokens
 *      keyed by (workspace_id, platform).
 *   5. Redirect the user back to `state.returnUrl` (defaults to
 *      /dashboard/publishing).
 *
 * On any failure we redirect to ?oauth_error=… so the UI can surface a
 * toast without leaking error internals.
 *
 * This is the SKELETON: the per-platform token-exchange URL + body shape
 * differs slightly between providers, so we route to a single
 * exchangeCode() helper that dispatches by platform.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { decryptState } from '@/lib/oauth-state'
import { encryptSecret } from '@/lib/secrets'

export const runtime = 'nodejs'

interface RouteCtx {
  params: Promise<{ platform: string }>
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  account_id?: string | null
  account_label?: string | null
}

const FAILURE_REDIRECT_BASE = '/dashboard/publishing'

function fail(reason: string, returnUrl?: string): NextResponse {
  const u = new URL((returnUrl || FAILURE_REDIRECT_BASE), process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
  u.searchParams.set('oauth_error', reason)
  return NextResponse.redirect(u.toString(), 302)
}

function success(returnUrl: string, platform: string): NextResponse {
  const u = new URL(returnUrl, process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
  u.searchParams.set('oauth_connected', platform)
  return NextResponse.redirect(u.toString(), 302)
}

/**
 * Per-platform code → token exchange. Returns null on any failure.
 * Each branch only runs if the provider's CLIENT_ID + SECRET are both set
 * in env, so unconfigured platforms hard-fail at this gate rather than
 * speculatively hitting URLs that won't resolve.
 */
async function exchangeCode(platform: string, code: string, redirectUri: string): Promise<TokenResponse | null> {
  const p = platform.toLowerCase()

  if (p === 'linkedin') {
    const clientId = process.env.LINKEDIN_CLIENT_ID
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
    if (!clientId || !clientSecret) return null
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    })
    if (!res.ok) return null
    const data = await res.json() as { access_token?: string; expires_in?: number; scope?: string; refresh_token?: string }
    if (!data.access_token) return null
    // LinkedIn requires a second call to fetch the person URN.
    let personUrn: string | null = null
    try {
      const meRes = await fetch('https://api.linkedin.com/v2/me', {
        headers: { 'Authorization': `Bearer ${data.access_token}` },
      })
      if (meRes.ok) {
        const me = await meRes.json() as { id?: string }
        if (me.id) personUrn = `urn:li:person:${me.id}`
      }
    } catch { /* non-fatal */ }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      scope: data.scope,
      account_id: personUrn,
    }
  }

  if (p === 'twitter' || p === 'x') {
    const clientId = process.env.TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET
    if (!clientId || !clientSecret) return null
    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
      }).toString(),
    })
    if (!res.ok) return null
    const data = await res.json() as { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string }
    if (!data.access_token) return null
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      scope: data.scope,
    }
  }

  if (p === 'wordpress') {
    const clientId = process.env.WORDPRESS_CLIENT_ID
    const clientSecret = process.env.WORDPRESS_CLIENT_SECRET
    if (!clientId || !clientSecret) return null
    const res = await fetch('https://public-api.wordpress.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    })
    if (!res.ok) return null
    const data = await res.json() as {
      access_token?: string
      blog_id?: string
      blog_url?: string
      scope?: string
    }
    if (!data.access_token) return null
    return {
      access_token: data.access_token,
      scope: data.scope,
      account_id: data.blog_url || data.blog_id || null,
      account_label: data.blog_url || null,
    }
  }

  return null
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { platform } = await ctx.params
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code') || ''
  const stateRaw = searchParams.get('state') || ''
  const providerError = searchParams.get('error')

  if (providerError) return fail(`provider_${providerError}`)

  // 1. Decrypt + verify state
  const state = decryptState(stateRaw)
  if (!state) return fail('invalid_state')
  if (state.platform !== platform.toLowerCase()) return fail('platform_mismatch', state.returnUrl)
  if (!code) return fail('missing_code', state.returnUrl)

  // 2. Build the exact same redirect_uri we used in /connect (provider
  // requires byte-perfect match).
  const base = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host')}`
  const redirectUri = `${base.replace(/\/+$/, '')}/api/integrations/oauth/${platform.toLowerCase()}/callback`

  // 3. Exchange the authorization code for a token.
  const tokens = await exchangeCode(platform, code, redirectUri)
  if (!tokens) return fail('token_exchange_failed', state.returnUrl)

  // 4. Encrypt + UPSERT into oauth_tokens.
  const encryptedAccess = encryptSecret(tokens.access_token)
  const encryptedRefresh = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  // UPSERT (re-connecting overwrites the prior row).
  const existing = await sql`
    SELECT id FROM oauth_tokens WHERE workspace_id = ${state.workspaceId} AND platform = ${state.platform} LIMIT 1
  `
  const existingId = (existing.rows[0] as { id?: string } | undefined)?.id
  const now = new Date().toISOString()

  if (existingId) {
    await sql`
      UPDATE oauth_tokens SET
        encrypted_access_token  = ${encryptedAccess},
        encrypted_refresh_token = ${encryptedRefresh},
        expires_at              = ${expiresAt},
        scope                   = ${tokens.scope || null},
        account_id              = ${tokens.account_id || null},
        account_label           = ${tokens.account_label || null},
        status                  = 'active',
        last_refreshed_at       = ${now},
        updated_at              = ${now}
      WHERE id = ${existingId}
    `
  } else {
    await sql`
      INSERT INTO oauth_tokens (
        id, workspace_id, platform,
        encrypted_access_token, encrypted_refresh_token, expires_at,
        scope, account_id, account_label, status, last_refreshed_at,
        created_at, updated_at
      ) VALUES (
        ${newId()}, ${state.workspaceId}, ${state.platform},
        ${encryptedAccess}, ${encryptedRefresh}, ${expiresAt},
        ${tokens.scope || null}, ${tokens.account_id || null}, ${tokens.account_label || null},
        'active', ${now}, ${now}, ${now}
      )
    `
  }

  // 5. Sprint 8G: also UPSERT into the integrations table so the
  //    /dashboard/integrations page (which reads from `integrations`,
  //    not `oauth_tokens`) immediately shows the platform as connected.
  //    /api/publish/direct + /api/publish read access_token from this
  //    row to fire the actual API calls. The encrypted copy in
  //    oauth_tokens remains the source of truth for refresh.
  try {
    await sql`
      DELETE FROM integrations
      WHERE workspace_id = ${state.workspaceId} AND platform = ${state.platform}
    `
    const intMetadata: Record<string, unknown> = {
      oauth_managed: true,
      scope: tokens.scope || null,
      expires_at: expiresAt,
      account_label: tokens.account_label || null,
    }
    try {
      await sql`
        INSERT INTO integrations (id, workspace_id, platform, access_token, account_id, status, metadata)
        VALUES (${newId()}, ${state.workspaceId}, ${state.platform},
                ${tokens.access_token}, ${tokens.account_id || ''},
                'active', ${JSON.stringify(intMetadata)})
      `
    } catch {
      // metadata column may not exist on older deployments.
      await sql`
        INSERT INTO integrations (id, workspace_id, platform, access_token, account_id, status)
        VALUES (${newId()}, ${state.workspaceId}, ${state.platform},
                ${tokens.access_token}, ${tokens.account_id || ''}, 'active')
      `
    }
  } catch (err) {
    // Non-fatal — the oauth_tokens row succeeded, refresh path still works.
    // The user just won't see the row in /dashboard/integrations until
    // they manually save it. Log so we can spot drift.
    console.error('[oauth-callback] integrations mirror write failed (non-fatal):', err)
  }

  // 6. Bounce back to where we came from with success flag.
  return success(state.returnUrl || FAILURE_REDIRECT_BASE, platform.toLowerCase())
}
