/**
 * GET /api/integrations/oauth/[platform]/connect
 *
 * Skeleton OAuth kick-off. Builds an AES-encrypted `state` token via
 * lib/oauth-state.ts (contains workspaceId + platform + nonce + exp) and
 * redirects the browser to the provider's authorize endpoint with that
 * state attached. The state's encryption guarantees the callback can
 * 100% trust the workspaceId it gets back.
 *
 *   GET /api/integrations/oauth/linkedin/connect?returnUrl=/dashboard/publishing
 *
 * Per-platform client ids + scopes live in env (LINKEDIN_CLIENT_ID,
 * TWITTER_CLIENT_ID, WORDPRESS_CLIENT_ID). If a platform isn't configured,
 * we return a 501 — the placeholder shape is in place so the next sprint
 * can drop real client creds in without touching this file.
 *
 * This route does NOT yet store anything in oauth_tokens — that happens in
 * the callback handler once the provider issues the access token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertWorkspaceOwnership, getSessionWorkspaceId, getSessionUserId } from '@/lib/guards'
import { encryptState } from '@/lib/oauth-state'

export const runtime = 'nodejs'

interface RouteCtx {
  params: Promise<{ platform: string }>
}

interface PlatformConfig {
  authorizeUrl: string
  clientId: string | undefined
  defaultScopes: string
  /** Whether the provider supports the modern PKCE flow (X v2 does, LI doesn't). */
  responseType?: 'code'
}

function getPlatformConfig(platform: string): PlatformConfig | null {
  switch (platform.toLowerCase()) {
    case 'linkedin':
      return {
        authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        clientId: process.env.LINKEDIN_CLIENT_ID,
        defaultScopes: 'r_liteprofile r_emailaddress w_member_social',
        responseType: 'code',
      }
    case 'twitter':
    case 'x':
      return {
        authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
        clientId: process.env.TWITTER_CLIENT_ID,
        defaultScopes: 'tweet.read tweet.write users.read offline.access',
        responseType: 'code',
      }
    case 'wordpress':
      return {
        authorizeUrl: 'https://public-api.wordpress.com/oauth2/authorize',
        clientId: process.env.WORDPRESS_CLIENT_ID,
        defaultScopes: 'global',
        responseType: 'code',
      }
    default:
      return null
  }
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { platform } = await ctx.params
  const cfg = getPlatformConfig(platform)
  if (!cfg) {
    return NextResponse.json({ error: `Platform '${platform}' is not supported` }, { status: 404 })
  }

  // Workspace identity is taken from the session; the caller cannot forge
  // a workspaceId via query string.
  const workspaceId = getSessionWorkspaceId(req)
  if (!workspaceId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  if (!cfg.clientId) {
    return NextResponse.json(
      {
        error: `${platform} OAuth is not yet configured on this deployment.`,
        hint: `Set ${platform.toUpperCase()}_CLIENT_ID and matching SECRET in env, then redeploy.`,
      },
      { status: 501 },
    )
  }

  const { searchParams } = new URL(req.url)
  const returnUrl = searchParams.get('returnUrl') || '/dashboard/publishing'

  // Encrypt the state. AES-256-GCM. 10-minute TTL by default.
  const stateToken = encryptState({
    workspaceId,
    platform: platform.toLowerCase(),
    returnUrl,
    userId: getSessionUserId(req) || undefined,
  })

  const base = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host')}`
  const redirectUri = `${base.replace(/\/+$/, '')}/api/integrations/oauth/${platform.toLowerCase()}/callback`

  const url = new URL(cfg.authorizeUrl)
  url.searchParams.set('response_type', cfg.responseType || 'code')
  url.searchParams.set('client_id', cfg.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', cfg.defaultScopes)
  url.searchParams.set('state', stateToken)

  return NextResponse.redirect(url.toString(), 302)
}
