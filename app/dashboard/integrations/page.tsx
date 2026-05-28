'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWorkspaceId } from '@/lib/hooks/use-workspace-id'

interface Integration {
  id: string
  platform: string
  account_id: string
  token_preview: string
  status: string
  connected_at: string
}

const PLATFORMS = [
  // ── Ad / DSP Platforms ────────────────────────────────────────────────────
  {
    id: 'meta_ads',
    name: 'Meta Ads Manager',
    icon: '📘',
    color: 'from-blue-700 to-indigo-600',
    badge: 'DSP',
    fields: [
      { key: 'accountId', label: 'Ad Account ID', placeholder: 'act_123456789012345', hint: 'Meta Business Suite → Ad Accounts → Your Account → ID. Must start with "act_"' },
      { key: 'accessToken', label: 'User Access Token (Marketing API)', placeholder: 'EAAxxxxxx...', hint: 'Meta for Developers → Graph API Explorer → select your app → User Access Token with ads_management scope. Use token debugger to extend to 60 days.' },
    ],
    publishSupports: 'Create campaigns, ad sets, and ads on Facebook & Instagram. Sync impressions, CTR, CPC, ROAS.',
    docsUrl: 'https://developers.facebook.com/docs/marketing-apis',
    extraFields: [
      { key: 'pageId', label: 'Facebook Page ID (for ad creatives)', placeholder: '123456789012345', hint: 'Required to attach image ads to your Facebook Page' },
      { key: 'websiteUrl', label: 'Landing Page URL', placeholder: 'https://yoursite.com', hint: 'Default destination URL for ad creatives' },
    ],
  },
  {
    id: 'google_ads',
    name: 'Google Ads',
    icon: '🎯',
    color: 'from-green-600 to-emerald-500',
    badge: 'DSP',
    fields: [
      { key: 'accountId', label: 'Customer ID', placeholder: '123-456-7890', hint: 'Google Ads → top right corner → Customer ID (10 digits, shown with dashes). Remove dashes when entering.' },
      { key: 'accessToken', label: 'OAuth Access Token', placeholder: 'ya29.a0...', hint: 'Google OAuth 2.0 → scope: https://www.googleapis.com/auth/adwords. Use Google OAuth Playground or your backend OAuth flow. Refreshes every hour.' },
    ],
    publishSupports: 'Create Search, Display, Performance Max campaigns. Create ad groups, RSAs, keywords. Sync impressions, clicks, CPC, conversions, ROAS.',
    docsUrl: 'https://developers.google.com/google-ads/api/docs/start',
    extraFields: [
      { key: 'managerId', label: 'Manager Account ID (MCC — optional)', placeholder: '987-654-3210', hint: 'If using a Google Ads Manager Account (MCC), enter the manager ID here' },
      { key: 'websiteUrl', label: 'Final URL', placeholder: 'https://yoursite.com', hint: 'Landing page URL for search ads' },
    ],
  },
  {
    id: 'dv360',
    name: 'Google DV360',
    icon: '📡',
    color: 'from-purple-600 to-violet-500',
    badge: 'DSP',
    fields: [
      { key: 'accountId', label: 'Advertiser ID', placeholder: '123456789', hint: 'Display & Video 360 → Advertiser Settings → Advertiser ID (numeric)' },
      { key: 'accessToken', label: 'OAuth Access Token', placeholder: 'ya29.a0...', hint: 'Same Google OAuth 2.0 token as Google Ads but with display-video scope: https://www.googleapis.com/auth/display-video' },
    ],
    publishSupports: 'Create Insertion Orders and Line Items for programmatic display, video, and native ads.',
    docsUrl: 'https://developers.google.com/display-video/api/reference/rest',
    extraFields: [
      { key: 'partnerId', label: 'Partner ID (optional)', placeholder: '12345678', hint: 'DV360 Partner ID — required if your advertiser is under a partner account' },
      { key: 'dv360CampaignId', label: 'DV360 Campaign ID', placeholder: '123456', hint: 'Create a Campaign in DV360 first, then enter its ID here. Campaign Manager → Campaigns → select campaign → Campaign ID.' },
    ],
  },
  // ── Social Publishing Platforms ────────────────────────────────────────────
  {
    id: 'instagram',
    name: 'Instagram',
    icon: '📸',
    color: 'from-pink-600 to-purple-600',
    badge: 'Social',
    fields: [
      { key: 'accountId', label: 'Instagram Business Account ID', placeholder: '17841400123456789', hint: 'Find in Meta Business Suite → Instagram Account → Account ID' },
      { key: 'accessToken', label: 'Page Access Token', placeholder: 'EAAxxxxxx...', hint: 'Meta for Developers → Graph API Explorer → Page Access Token (long-lived)' },
    ],
    publishSupports: 'Carousel, Static Post, Story Cover, Ad Creative, YouTube Thumbnail',
    docsUrl: 'https://developers.facebook.com/docs/instagram-api',
  },
  {
    id: 'facebook',
    name: 'Facebook Pages',
    icon: '📘',
    color: 'from-blue-600 to-blue-400',
    badge: 'Social',
    fields: [
      { key: 'accountId', label: 'Facebook Page ID', placeholder: '123456789012345', hint: 'Facebook Page → About → Page ID (or Meta Business Suite)' },
      { key: 'accessToken', label: 'Page Access Token', placeholder: 'EAAxxxxxx...', hint: 'Meta for Developers → Graph API Explorer → select your Page → Page Access Token' },
    ],
    publishSupports: 'Static Post, Ad Creative, Story Cover, Carousel (as cover image + caption)',
    docsUrl: 'https://developers.facebook.com/docs/pages-api',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: '💼',
    color: 'from-blue-700 to-blue-500',
    badge: 'Social',
    // Sprint 8G: backed by /api/integrations/oauth/linkedin/connect.
    // When the LINKEDIN_CLIENT_ID env var is set on the deployment, the
    // "Connect with LinkedIn" button on this card kicks off the real
    // OAuth dance and the user never sees a paste-token field.
    oauthPlatform: 'linkedin',
    fields: [
      { key: 'accountId', label: 'LinkedIn Person URN', placeholder: 'urn:li:person:AbCdEfGhIj', hint: 'LinkedIn Developer Portal → Auth → Person URN (or just your person ID)' },
      { key: 'accessToken', label: 'Access Token', placeholder: 'AQV...', hint: 'LinkedIn Developer Portal → OAuth 2.0 → Generate token with w_member_social scope' },
    ],
    publishSupports: 'LinkedIn Post, Static Post, Visual Carousel, Ad Creative',
    docsUrl: 'https://www.linkedin.com/developers/apps',
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    icon: '🐦',
    color: 'from-gray-700 to-gray-500',
    badge: 'Social',
    oauthPlatform: 'twitter',
    fields: [
      { key: 'accountId', label: 'Twitter Username', placeholder: '@yourbrand', hint: 'Your Twitter/X handle (used for display only — posting uses the Bearer Token)' },
      { key: 'accessToken', label: 'Bearer Token', placeholder: 'AAAAAAAAAA...', hint: 'Twitter Developer Portal → Your App → Keys and Tokens → Bearer Token' },
    ],
    publishSupports: 'Tweets from any text artifact (280 char limit auto-applied)',
    docsUrl: 'https://developer.twitter.com/en/portal',
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    icon: '📝',
    color: 'from-blue-800 to-cyan-600',
    badge: 'Social',
    oauthPlatform: 'wordpress',
    fields: [
      { key: 'accountId', label: 'Blog ID or URL', placeholder: 'myblog.wordpress.com', hint: 'Your WordPress.com blog identifier — captured automatically by the OAuth flow' },
      { key: 'accessToken', label: 'Access Token', placeholder: '...', hint: 'Use the Connect button above for the OAuth flow, or paste a manually generated token here' },
    ],
    publishSupports: 'Long-form blog posts. Direct publish from approved blog artifacts.',
    docsUrl: 'https://developer.wordpress.com/docs/oauth2/',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    icon: '💬',
    color: 'from-green-600 to-emerald-500',
    badge: 'Messaging',
    fields: [
      { key: 'accountId', label: 'Phone Number ID', placeholder: '1234567890', hint: 'Meta for Developers → Your WhatsApp App → Phone Numbers → Phone Number ID (numeric). Not your phone number itself.' },
      { key: 'accessToken', label: 'WhatsApp Access Token', placeholder: 'EAAxxxxxx...', hint: 'Meta for Developers → Your App → WhatsApp → API Setup → Temporary / Permanent Token. For production use a permanent System User token.' },
    ],
    publishSupports: 'Broadcast campaigns using pre-approved message templates. Requires opted-in contacts only.',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    extraFields: [
      { key: 'whatsappBusinessAccountId', label: 'WhatsApp Business Account ID (WABA ID)', placeholder: '987654321', hint: 'Meta Business Suite → WhatsApp → WABA ID. Used for template management.' },
    ],
  },
]

export default function IntegrationsPage() {
  // Sprint 9E: session-derived workspaceId. The hook caches /api/auth/me
  // (1-minute TTL) and mirrors back to localStorage for legacy code paths.
  const { workspaceId: sessionWorkspaceId } = useWorkspaceId()
  const [workspaceId, setWorkspaceId] = useState('')
  const [connected, setConnected] = useState<Integration[]>([])
  const [form, setForm] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [error, setError] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState<Record<string, boolean>>({})
  // Sprint 8G: OAuth callback toast — driven by ?oauth_connected= or
  // ?oauth_error= query params the callback redirects to.
  const [oauthBanner, setOauthBanner] = useState<{ kind: 'success' | 'error'; platform: string; reason?: string } | null>(null)

  const load = useCallback(async (wid: string) => {
    const res = await fetch(`/api/integrations?workspaceId=${wid}`)
    const data = await res.json()
    if (Array.isArray(data)) setConnected(data)
  }, [])

  // Sprint 9E: when the session-derived workspaceId resolves, adopt it.
  // We keep the local state because deep call sites (connect/disconnect)
  // still read `workspaceId`, but the value now reflects whatever the
  // server's signed cookie says — not a stale localStorage entry.
  useEffect(() => {
    if (!sessionWorkspaceId) return
    setWorkspaceId(sessionWorkspaceId)
    load(sessionWorkspaceId)
  }, [sessionWorkspaceId, load])

  // Sprint 8G: catch the OAuth callback bounce-back. Pulls the
  // success/error query param, shows a banner, then scrubs the URL
  // so refresh doesn't re-show it.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const connectedPlatform = url.searchParams.get('oauth_connected')
    const errorReason = url.searchParams.get('oauth_error')
    if (connectedPlatform) {
      setOauthBanner({ kind: 'success', platform: connectedPlatform })
      url.searchParams.delete('oauth_connected')
      window.history.replaceState({}, '', url.toString())
    } else if (errorReason) {
      setOauthBanner({ kind: 'error', platform: '', reason: errorReason })
      url.searchParams.delete('oauth_error')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  /** Kick off the OAuth dance — full-page redirect. The callback at
   *  /api/integrations/oauth/[platform]/callback bounces back here
   *  with ?oauth_connected= or ?oauth_error=. */
  function startOAuth(platform: string) {
    const returnUrl = encodeURIComponent('/dashboard/integrations')
    window.location.href = `/api/integrations/oauth/${platform}/connect?returnUrl=${returnUrl}`
  }

  function setField(platform: string, key: string, value: string) {
    setForm(f => ({ ...f, [platform]: { ...(f[platform] || {}), [key]: value } }))
  }

  async function connect(platformId: string) {
    setSaving(platformId)
    setError(e => ({ ...e, [platformId]: '' }))
    setSuccess(s => ({ ...s, [platformId]: false }))
    const fields = form[platformId] || {}
    const platform = PLATFORMS.find(p => p.id === platformId)
    // Build metadata from extra fields
    const metadata: Record<string, string> = {}
    if (platform && 'extraFields' in platform) {
      for (const ef of (platform.extraFields as Array<{ key: string }>) || []) {
        if (fields[ef.key]) metadata[ef.key] = fields[ef.key]
      }
    }
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          platform: platformId,
          accessToken: fields.accessToken || '',
          accountId: fields.accountId || '',
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(e => ({ ...e, [platformId]: data.error })); return }
      setSuccess(s => ({ ...s, [platformId]: true }))
      setForm(f => ({ ...f, [platformId]: {} }))
      await load(workspaceId)
    } catch (err) {
      setError(e => ({ ...e, [platformId]: String(err) }))
    } finally {
      setSaving(null)
    }
  }

  async function disconnect(platformId: string) {
    setDisconnecting(platformId)
    try {
      await fetch(`/api/integrations?workspaceId=${workspaceId}&platform=${platformId}`, { method: 'DELETE' })
      await load(workspaceId)
    } finally {
      setDisconnecting(null) }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">🔗</div>
          <h1 className="text-2xl font-bold text-white">Integrations</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">Connect your platforms — approved content can then be published in one click</p>
      </div>

      {/* Important notice */}
      <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-xl p-4 mb-8 flex gap-3">
        <span className="text-yellow-400 text-lg mt-0.5">⚠️</span>
        <div>
          <p className="text-yellow-300 text-sm font-medium">HITL Safety: Nothing publishes automatically</p>
          <p className="text-yellow-600 text-xs mt-0.5">Every post requires your explicit approval in the Approvals page before publishing. Credentials are stored encrypted and never logged.</p>
        </div>
      </div>

      {/* Sprint 8G: OAuth callback banner. */}
      {oauthBanner && (
        <div className={`mb-8 rounded-xl p-4 flex items-center justify-between gap-3 border ${oauthBanner.kind === 'success' ? 'bg-green-900/20 border-green-800/50' : 'bg-red-900/20 border-red-800/50'}`}>
          <div className="flex items-center gap-3">
            <span className="text-lg">{oauthBanner.kind === 'success' ? '✅' : '⚠️'}</span>
            <div>
              {oauthBanner.kind === 'success'
                ? (
                  <>
                    <p className="text-green-300 text-sm font-medium">Connected {oauthBanner.platform}</p>
                    <p className="text-green-600 text-xs">You can now publish to {oauthBanner.platform} from /dashboard/publishing.</p>
                  </>
                ) : (
                  <>
                    <p className="text-red-300 text-sm font-medium">OAuth connection failed</p>
                    <p className="text-red-600 text-xs">{oauthBanner.reason === 'token_exchange_failed'
                      ? 'The provider rejected the token exchange. Try again, or use the manual token form below.'
                      : oauthBanner.reason === 'invalid_state'
                        ? 'Sign-in state expired. Click Connect again.'
                        : `Reason: ${oauthBanner.reason}.`}</p>
                  </>
                )}
            </div>
          </div>
          <button onClick={() => setOauthBanner(null)} className="text-gray-500 hover:text-white">✕</button>
        </div>
      )}

      {/* Ad / DSP Platforms */}
      <div className="mb-3">
        <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Ad Platforms & DSPs</h2>
        <p className="text-gray-600 text-xs mt-0.5">Connect to publish campaigns, sync performance, and enable AI optimization</p>
      </div>

      {/* Platform cards */}
      <div className="space-y-6">
        {PLATFORMS.map((platform, idx) => {
          // Section break before social / messaging platforms
          const prevPlatform = PLATFORMS[idx - 1]
          const showSocialHeader = platform.badge === 'Social' && prevPlatform?.badge === 'DSP'
          const showMessagingHeader = platform.badge === 'Messaging' && prevPlatform?.badge === 'Social'

          const isConnected = connected.some(c => c.platform === platform.id)
          const connectedData = connected.find(c => c.platform === platform.id)
          const f = form[platform.id] || {}

          return (
            <div key={platform.id}>
              {showSocialHeader && (
                <div className="pt-4 pb-2">
                  <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Social Publishing</h2>
                  <p className="text-gray-600 text-xs mt-0.5">Connect to publish approved content directly to your social channels</p>
                </div>
              )}
              {showMessagingHeader && (
                <div className="pt-4 pb-2">
                  <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Messaging</h2>
                  <p className="text-gray-600 text-xs mt-0.5">Connect messaging platforms to broadcast campaigns to opted-in contacts</p>
                </div>
              )}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              {/* Platform header */}
              <div className="flex items-center justify-between p-5 border-b border-gray-800">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${platform.color} flex items-center justify-center text-xl`}>
                    {platform.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-white font-semibold">{platform.name}</h2>
                      {'badge' in platform && platform.badge === 'DSP' && (
                        <span className="text-xs bg-purple-900/40 text-purple-400 px-2 py-0.5 rounded-full font-medium">DSP</span>
                      )}
                      {'badge' in platform && platform.badge === 'Messaging' && (
                        <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full font-medium">Messaging</span>
                      )}
                      {/* Sprint 15F (P1 #12): badge so users know which flow
                          is one-click vs which still needs manual paste. */}
                      {'oauthPlatform' in platform ? (
                        <span className="text-[10px] bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded-full font-medium border border-indigo-800/50">OAuth</span>
                      ) : (
                        <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full font-medium border border-gray-700" title="Manual API-key paste only. OAuth flow planned for a future release.">Manual key</span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs mt-0.5">{platform.publishSupports}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isConnected && (
                    <span className="flex items-center gap-1.5 text-green-400 text-sm font-medium">
                      <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                      Connected
                    </span>
                  )}
                  {isConnected && (
                    <button
                      onClick={() => disconnect(platform.id)}
                      disabled={disconnecting === platform.id}
                      className="text-red-400 hover:text-red-300 text-xs border border-red-900 hover:border-red-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {disconnecting === platform.id ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  )}
                </div>
              </div>

              {/* Connection form */}
              <div className="p-5">
                {isConnected && connectedData ? (
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <span>Account ID:</span>
                    <code className="text-gray-300 bg-gray-800 px-2 py-0.5 rounded text-xs">{connectedData.account_id}</code>
                    <span>Token:</span>
                    <code className="text-gray-300 bg-gray-800 px-2 py-0.5 rounded text-xs">{connectedData.token_preview}••••••••</code>
                    <button
                      onClick={() => setConnected(c => c.filter(x => x.platform !== platform.id))}
                      className="text-indigo-400 hover:text-indigo-300 text-xs ml-2"
                    >
                      Update credentials →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Sprint 8G: one-click OAuth for platforms that support it.
                        Falls back to manual paste below if the user already
                        has a token. The /connect endpoint returns 501 if the
                        deployment doesn't have the provider's CLIENT_ID
                        configured — we still render the button so admins
                        see the right next step. */}
                    {'oauthPlatform' in platform && (
                      <div className="rounded-lg border border-indigo-900/40 bg-indigo-950/30 p-4">
                        <p className="text-indigo-300 text-sm font-medium mb-1">Recommended: Sign in with {platform.name}</p>
                        <p className="text-indigo-400/80 text-xs mb-3">
                          One click. We&apos;ll take you to {platform.name}&apos;s sign-in page and bring you back when done.
                          No need to find tokens or URNs manually.
                        </p>
                        <button
                          onClick={() => startOAuth(platform.oauthPlatform as string)}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          {platform.icon} Connect with {platform.name}
                        </button>
                        <p className="text-gray-500 text-[11px] mt-2">
                          Or paste a token manually below if you&apos;ve already generated one.
                        </p>
                      </div>
                    )}
                    {platform.fields.map(field => (
                      <div key={field.key}>
                        <label className="block text-gray-400 text-xs font-medium mb-1.5">{field.label}</label>
                        <input
                          type={field.key === 'accessToken' ? 'password' : 'text'}
                          value={f[field.key] || ''}
                          onChange={e => setField(platform.id, field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                        />
                        <p className="text-gray-600 text-xs mt-1">{field.hint}</p>
                      </div>
                    ))}

                    {/* Extra (metadata) fields */}
                    {'extraFields' in platform && (platform.extraFields as Array<{ key: string; label: string; placeholder: string; hint: string }>).map(field => (
                      <div key={field.key}>
                        <label className="block text-gray-400 text-xs font-medium mb-1.5">{field.label}</label>
                        <input
                          type="text"
                          value={f[field.key] || ''}
                          onChange={e => setField(platform.id, field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                        />
                        <p className="text-gray-600 text-xs mt-1">{field.hint}</p>
                      </div>
                    ))}

                    {error[platform.id] && (
                      <p className="text-red-400 text-sm">{error[platform.id]}</p>
                    )}
                    {success[platform.id] && (
                      <p className="text-green-400 text-sm">✅ Connected successfully!</p>
                    )}

                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => connect(platform.id)}
                        disabled={saving === platform.id || !f.accessToken || !f.accountId}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
                      >
                        {saving === platform.id ? 'Connecting...' : `Connect ${platform.name}`}
                      </button>
                      <a
                        href={platform.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 text-xs"
                      >
                        Get credentials →
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          )
        })}
      </div>

      {/* Coming soon */}
      <div className="mt-8">
        <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-4">Coming Soon</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: '📧', name: 'Klaviyo' },
            { icon: '📱', name: 'WhatsApp Business' },
            { icon: '📊', name: 'TikTok Ads' },
            { icon: '📺', name: 'YouTube Ads (direct)' },
            { icon: '🛒', name: 'Amazon DSP' },
            { icon: '🏷️', name: 'Snapchat Ads' },
          ].map(p => (
            <div key={p.name} className="border border-gray-800 rounded-xl p-4 opacity-40 flex items-center gap-3">
              <span className="text-xl">{p.icon}</span>
              <span className="text-gray-400 text-sm">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
