'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Integration {
  id: string
  platform: string
  account_id: string
  token_preview: string
  status: string
  connected_at: string
}

interface ModelSettings {
  defaultModel: string
  // AI & LLM
  groqApiKey: string
  openaiApiKey: string
  elevenLabsApiKey: string
  elevenLabsVoiceId: string
  runwayApiKey: string
  heygenApiKey: string
  vapiApiKey: string
  // Search & Research
  braveSearchApiKey: string
  firecrawlApiKey: string
  // Email & CRM
  resendApiKey: string
  hubspotAccessToken: string
  mailchimpApiKey: string
  mailchimpServer: string
  brevoApiKey: string
  brevoFromEmail: string
  // Analytics & SEO
  ga4PropertyId: string
  ga4AccessToken: string
  searchConsoleSiteUrl: string
  searchConsoleAccessToken: string
  // Content & Media
  cloudinaryCloudName: string
  cloudinaryApiKey: string
  cloudinaryApiSecret: string
  unsplashAccessKey: string
  pexelsApiKey: string
  deepgramApiKey: string
  // Lead Enrichment
  apolloApiKey: string
  hunterApiKey: string
  // Social Publishing
  bufferAccessToken: string
  twitterBearerToken: string
  twitterAccessToken: string
  linkedinAccessToken: string
  linkedinAuthorUrn: string
  youtubeApiKey: string
  youtubeAccessToken: string
  // Publishing
  wpSiteUrl: string
  wpUsername: string
  wpAppPassword: string
  ghostUrl: string
  ghostAdminKey: string
  // Payments
  stripeSecretKey: string
  stripePublishableKey: string
  razorpayKeyId: string
  razorpayKeySecret: string
  // Notifications
  slackBotToken: string
  slackChannelId: string
  telegramBotToken: string
  telegramChatId: string
  // Automation
  n8nBaseUrl: string
  n8nApiKey: string
  calcomApiKey: string
  tallyApiKey: string
  // Misc
  metaWebhookVerifyToken: string
  metaAccessToken: string
  metaAdAccountId: string
  googleAdsDeveloperToken: string
  googleAdsCustomerId: string
  googleAdsAccessToken: string
  linkedinAdsAccessToken: string
  linkedinAdsAccountId: string
}

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  defaultModel: 'claude-sonnet-4-6',
  groqApiKey: '', openaiApiKey: '', elevenLabsApiKey: '', elevenLabsVoiceId: '',
  runwayApiKey: '', heygenApiKey: '', vapiApiKey: '',
  braveSearchApiKey: '', firecrawlApiKey: '',
  resendApiKey: '', hubspotAccessToken: '', mailchimpApiKey: '', mailchimpServer: '',
  brevoApiKey: '', brevoFromEmail: '',
  ga4PropertyId: '', ga4AccessToken: '', searchConsoleSiteUrl: '', searchConsoleAccessToken: '',
  cloudinaryCloudName: '', cloudinaryApiKey: '', cloudinaryApiSecret: '',
  unsplashAccessKey: '', pexelsApiKey: '', deepgramApiKey: '',
  apolloApiKey: '', hunterApiKey: '',
  bufferAccessToken: '', twitterBearerToken: '', twitterAccessToken: '',
  linkedinAccessToken: '', linkedinAuthorUrn: '', youtubeApiKey: '', youtubeAccessToken: '',
  wpSiteUrl: '', wpUsername: '', wpAppPassword: '', ghostUrl: '', ghostAdminKey: '',
  stripeSecretKey: '', stripePublishableKey: '', razorpayKeyId: '', razorpayKeySecret: '',
  slackBotToken: '', slackChannelId: '', telegramBotToken: '', telegramChatId: '',
  n8nBaseUrl: '', n8nApiKey: '', calcomApiKey: '', tallyApiKey: '',
  metaWebhookVerifyToken: '', metaAccessToken: '', metaAdAccountId: '',
  googleAdsDeveloperToken: '', googleAdsCustomerId: '', googleAdsAccessToken: '',
  linkedinAdsAccessToken: '', linkedinAdsAccountId: '',
}

// ── API key category definitions ──────────────────────────────────────────────

interface KeyField {
  key: keyof ModelSettings
  label: string
  hint: string
  placeholder: string
  type?: 'text' | 'password' | 'email' | 'url'
}

interface KeyCategory {
  title: string
  icon: string
  fields: KeyField[]
}

const KEY_CATEGORIES: KeyCategory[] = [
  {
    title: 'AI & LLM',
    icon: '🤖',
    fields: [
      { key: 'groqApiKey', label: 'Groq API Key', hint: 'Fast free-tier LLM for bulk tasks — get free at console.groq.com', placeholder: 'gsk_...' },
      { key: 'openaiApiKey', label: 'OpenAI API Key', hint: 'For DALL-E image generation and Whisper transcription', placeholder: 'sk-...' },
      { key: 'elevenLabsApiKey', label: 'ElevenLabs API Key', hint: 'For voiceover and audio generation — get at elevenlabs.io', placeholder: 'el_...' },
      { key: 'elevenLabsVoiceId', label: 'ElevenLabs Voice ID', hint: 'Default voice ID — optional, e.g. 21m00Tcm4TlvDq8ikWAM', placeholder: '21m00Tcm4TlvDq8ikWAM', type: 'text' },
      { key: 'runwayApiKey', label: 'Runway API Key', hint: 'For AI video generation — get at runwayml.com', placeholder: 'Runway API Key' },
      { key: 'heygenApiKey', label: 'HeyGen API Key', hint: 'For avatar video creation — get at heygen.com', placeholder: 'HeyGen API Key' },
      { key: 'vapiApiKey', label: 'Vapi API Key', hint: 'For voice AI agents — get at vapi.ai', placeholder: 'Vapi API Key' },
    ],
  },
  {
    title: 'Search & Research',
    icon: '🔍',
    fields: [
      { key: 'braveSearchApiKey', label: 'Brave Search API Key', hint: 'Enables live trend signals in the Trend Scout agent — get at api.search.brave.com', placeholder: 'BSA...' },
      { key: 'firecrawlApiKey', label: 'Firecrawl API Key', hint: 'Enables website scraping for content research and competitor analysis', placeholder: 'fc-...' },
    ],
  },
  {
    title: 'Email & CRM',
    icon: '📧',
    fields: [
      { key: 'resendApiKey', label: 'Resend API Key', hint: 'Used for sending email sequences and campaigns', placeholder: 're_...' },
      { key: 'hubspotAccessToken', label: 'HubSpot Access Token', hint: 'Enables automatic CRM push after lead qualification — from HubSpot Private Apps', placeholder: 'pat-...' },
      { key: 'mailchimpApiKey', label: 'Mailchimp API Key', hint: 'From Mailchimp → Account → Extras → API keys', placeholder: 'Mailchimp API key' },
      { key: 'mailchimpServer', label: 'Mailchimp Server Prefix', hint: 'The server prefix in your Mailchimp API key, e.g. us18', placeholder: 'us18', type: 'text' },
      { key: 'brevoApiKey', label: 'Brevo API Key', hint: 'From app.brevo.com → SMTP & API → API Keys', placeholder: 'Brevo API key' },
      { key: 'brevoFromEmail', label: 'Brevo From Email', hint: 'Verified sender email address in your Brevo account', placeholder: 'hello@yourcompany.com', type: 'email' },
    ],
  },
  {
    title: 'Analytics & SEO',
    icon: '📊',
    fields: [
      { key: 'ga4PropertyId', label: 'Google Analytics 4 Property ID', hint: 'Format: 1234567890 — from GA4 Admin → Property Settings', placeholder: 'GA4 Property ID', type: 'text' },
      { key: 'ga4AccessToken', label: 'Google Analytics 4 Access Token', hint: 'Service account access token for GA4 Data API', placeholder: 'ya29...' },
      { key: 'searchConsoleSiteUrl', label: 'Search Console Site URL', hint: 'Exact property URL in Search Console, e.g. https://yourdomain.com', placeholder: 'https://yourdomain.com', type: 'url' },
      { key: 'searchConsoleAccessToken', label: 'Search Console Access Token', hint: 'Google OAuth access token with Search Console read scope', placeholder: 'ya29....' },
    ],
  },
  {
    title: 'Content & Media',
    icon: '🎨',
    fields: [
      { key: 'cloudinaryCloudName', label: 'Cloudinary Cloud Name', hint: 'Found in your Cloudinary dashboard — e.g. mycloud', placeholder: 'mycloud', type: 'text' },
      { key: 'cloudinaryApiKey', label: 'Cloudinary API Key', hint: 'From cloudinary.com → Settings → API Keys', placeholder: 'Cloudinary API Key', type: 'text' },
      { key: 'cloudinaryApiSecret', label: 'Cloudinary API Secret', hint: 'Keep this secret — never share it publicly', placeholder: 'Cloudinary API Secret' },
      { key: 'unsplashAccessKey', label: 'Unsplash Access Key', hint: 'Free stock images for content and creative assets', placeholder: 'Unsplash access key' },
      { key: 'pexelsApiKey', label: 'Pexels API Key', hint: 'Free stock images and videos for content creation', placeholder: 'Pexels API key' },
      { key: 'deepgramApiKey', label: 'Deepgram API Key', hint: 'For audio transcription — get at console.deepgram.com', placeholder: 'Deepgram API key' },
    ],
  },
  {
    title: 'Lead Enrichment',
    icon: '🎯',
    fields: [
      { key: 'apolloApiKey', label: 'Apollo.io API Key', hint: 'For lead enrichment — get at apollo.io/settings/integrations/api', placeholder: 'Apollo.io API key' },
      { key: 'hunterApiKey', label: 'Hunter.io API Key', hint: 'For email finding and verification — get at hunter.io/api-keys', placeholder: 'Hunter.io API key' },
    ],
  },
  {
    title: 'Social Publishing',
    icon: '📱',
    fields: [
      { key: 'bufferAccessToken', label: 'Buffer Access Token', hint: 'From buffer.com/developers — for multi-platform scheduling', placeholder: 'Buffer access token' },
      { key: 'twitterBearerToken', label: 'Twitter Bearer Token', hint: 'App-level token for search — from developer.twitter.com', placeholder: 'Twitter Bearer Token' },
      { key: 'twitterAccessToken', label: 'Twitter Access Token', hint: 'User-level OAuth token for posting tweets — from developer.twitter.com', placeholder: 'Twitter Access Token' },
      { key: 'linkedinAccessToken', label: 'LinkedIn Access Token', hint: 'OAuth access token for posting — from LinkedIn developer portal', placeholder: 'LinkedIn Access Token' },
      { key: 'linkedinAuthorUrn', label: 'LinkedIn Author URN', hint: 'Your person or org URN — e.g. urn:li:person:ABC123 or urn:li:organization:123', placeholder: 'urn:li:person:...', type: 'text' },
      { key: 'youtubeApiKey', label: 'YouTube API Key', hint: 'For public video search — from console.cloud.google.com', placeholder: 'YouTube API Key', type: 'text' },
      { key: 'youtubeAccessToken', label: 'YouTube Access Token', hint: 'OAuth token for channel info — from Google OAuth consent flow', placeholder: 'YouTube Access Token' },
    ],
  },
  {
    title: 'Publishing',
    icon: '📝',
    fields: [
      { key: 'wpSiteUrl', label: 'WordPress Site URL', hint: 'e.g. https://yourblog.com (must have REST API enabled)', placeholder: 'https://yourblog.com', type: 'url' },
      { key: 'wpUsername', label: 'WordPress Username', hint: 'Your WordPress username', placeholder: 'admin', type: 'text' },
      { key: 'wpAppPassword', label: 'WordPress App Password', hint: 'Generate at Users → Profile → Application Passwords', placeholder: 'xxxx xxxx xxxx xxxx xxxx xxxx' },
      { key: 'ghostUrl', label: 'Ghost Site URL', hint: 'e.g. https://yourblog.ghost.io', placeholder: 'https://yourblog.ghost.io', type: 'url' },
      { key: 'ghostAdminKey', label: 'Ghost Admin API Key', hint: 'From Ghost Admin → Settings → Integrations', placeholder: 'Ghost admin key' },
    ],
  },
  {
    title: 'Payments',
    icon: '💳',
    fields: [
      { key: 'stripeSecretKey', label: 'Stripe Secret Key', hint: 'Keep this secret — never expose on frontend', placeholder: 'sk_live_... or sk_test_...' },
      { key: 'stripePublishableKey', label: 'Stripe Publishable Key', hint: 'Used on frontend (not secret)', placeholder: 'pk_live_... or pk_test_...', type: 'text' },
      { key: 'razorpayKeyId', label: 'Razorpay Key ID', hint: 'Safe to expose on frontend — from razorpay.com/app/keys', placeholder: 'rzp_live_...', type: 'text' },
      { key: 'razorpayKeySecret', label: 'Razorpay Key Secret', hint: 'Keep this secret — never expose on frontend', placeholder: 'Razorpay Key Secret' },
    ],
  },
  {
    title: 'Notifications',
    icon: '🔔',
    fields: [
      { key: 'slackBotToken', label: 'Slack Bot Token', hint: 'From api.slack.com — needs chat:write scope', placeholder: 'xoxb-...' },
      { key: 'slackChannelId', label: 'Slack Channel ID', hint: 'Channel ID (starts with C...) for approval notifications', placeholder: 'C0123456789', type: 'text' },
      { key: 'telegramBotToken', label: 'Telegram Bot Token', hint: 'From @BotFather on Telegram', placeholder: '123456789:AAF...' },
      { key: 'telegramChatId', label: 'Telegram Chat ID', hint: 'Your chat ID — send /start to your bot then get from getUpdates', placeholder: '-1001234567890', type: 'text' },
    ],
  },
  {
    title: 'Automation',
    icon: '⚙️',
    fields: [
      { key: 'n8nBaseUrl', label: 'n8n Base URL', hint: 'e.g. https://your-n8n.domain.com (self-hosted)', placeholder: 'https://your-n8n.domain.com', type: 'url' },
      { key: 'n8nApiKey', label: 'n8n API Key', hint: 'From n8n Settings → API', placeholder: 'n8n API key' },
      { key: 'calcomApiKey', label: 'Cal.com API Key', hint: 'From app.cal.com/settings/developer/api-keys', placeholder: 'cal_live_...' },
      { key: 'tallyApiKey', label: 'Tally API Key', hint: 'From tally.so/app → Settings → API', placeholder: 'Tally API key' },
    ],
  },
]

// ── Platforms (copied from integrations page) ─────────────────────────────────

const PLATFORMS = [
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
      { key: 'dv360CampaignId', label: 'DV360 Campaign ID', placeholder: '123456', hint: 'Create a Campaign in DV360 first, then enter its ID here.' },
    ],
  },
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
    publishSupports: 'Static Post, Ad Creative, Story Cover, Carousel',
    docsUrl: 'https://developers.facebook.com/docs/pages-api',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: '💼',
    color: 'from-blue-700 to-blue-500',
    badge: 'Social',
    fields: [
      { key: 'accountId', label: 'LinkedIn Person URN', placeholder: 'urn:li:person:AbCdEfGhIj', hint: 'LinkedIn Developer Portal → Auth → Person URN' },
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
    fields: [
      { key: 'accountId', label: 'Twitter Username', placeholder: '@yourbrand', hint: 'Your Twitter/X handle (used for display only — posting uses the Bearer Token)' },
      { key: 'accessToken', label: 'Bearer Token', placeholder: 'AAAAAAAAAA...', hint: 'Twitter Developer Portal → Your App → Keys and Tokens → Bearer Token' },
    ],
    publishSupports: 'Tweets from any text artifact (280 char limit auto-applied)',
    docsUrl: 'https://developer.twitter.com/en/portal',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    icon: '💬',
    color: 'from-green-600 to-emerald-500',
    badge: 'Messaging',
    fields: [
      { key: 'accountId', label: 'Phone Number ID', placeholder: '1234567890', hint: 'Meta for Developers → Your WhatsApp App → Phone Numbers → Phone Number ID (numeric).' },
      { key: 'accessToken', label: 'WhatsApp Access Token', placeholder: 'EAAxxxxxx...', hint: 'Meta for Developers → Your App → WhatsApp → API Setup → Permanent Token.' },
    ],
    publishSupports: 'Broadcast campaigns using pre-approved message templates.',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    extraFields: [
      { key: 'whatsappBusinessAccountId', label: 'WhatsApp Business Account ID (WABA ID)', placeholder: '987654321', hint: 'Meta Business Suite → WhatsApp → WABA ID. Used for template management.' },
    ],
  },
]

// ── Input style ───────────────────────────────────────────────────────────────

const inputCls = 'w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 font-mono'

// ── Main component ────────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const [activeTab, setActiveTab] = useState<'api-keys' | 'platforms'>('api-keys')

  // API Keys state
  const [workspaceId, setWorkspaceId] = useState('')
  const [modelSettings, setModelSettings] = useState<ModelSettings>(DEFAULT_MODEL_SETTINGS)
  const [fetching, setFetching] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Platforms state
  const [connected, setConnected] = useState<Integration[]>([])
  const [platformForm, setPlatformForm] = useState<Record<string, Record<string, string>>>({})
  const [platformSaving, setPlatformSaving] = useState<string | null>(null)
  const [platformDisconnecting, setPlatformDisconnecting] = useState<string | null>(null)
  const [platformError, setPlatformError] = useState<Record<string, string>>({})
  const [platformSuccess, setPlatformSuccess] = useState<Record<string, boolean>>({})

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadIntegrations = useCallback(async (wid: string) => {
    const res = await fetch(`/api/integrations?workspaceId=${wid}`)
    const data = await res.json()
    if (Array.isArray(data)) setConnected(data)
  }, [])

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (!wid) { setFetching(false); return }

    fetch(`/api/workspaces?id=${wid}`)
      .then(r => r.json())
      .then(d => {
        if (d && d.model_settings) {
          try {
            const ms = typeof d.model_settings === 'string' ? JSON.parse(d.model_settings) : d.model_settings
            if (ms && typeof ms === 'object') {
              setModelSettings(prev => ({ ...prev, ...ms }))
            }
          } catch { /* leave at defaults if JSON is malformed */ }
        }
      })
      .finally(() => setFetching(false))

    loadIntegrations(wid)
  }, [loadIntegrations])

  // ── API key helpers ─────────────────────────────────────────────────────────

  const updateKey = (field: keyof ModelSettings, value: string) =>
    setModelSettings(prev => ({ ...prev, [field]: value }))

  const saveKeys = async () => {
    if (!workspaceId) return
    setSaving(true); setSaveError(''); setSaved(false)
    try {
      const res = await fetch('/api/workspaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, modelSettings }),
      })
      const data = await res.json()
      if (data.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        setSaveError(data.error || 'Save failed')
      }
    } catch { setSaveError('Network error') } finally { setSaving(false) }
  }

  // ── Platform helpers ────────────────────────────────────────────────────────

  function setPlatformField(platform: string, key: string, value: string) {
    setPlatformForm(f => ({ ...f, [platform]: { ...(f[platform] || {}), [key]: value } }))
  }

  async function connectPlatform(platformId: string) {
    setPlatformSaving(platformId)
    setPlatformError(e => ({ ...e, [platformId]: '' }))
    setPlatformSuccess(s => ({ ...s, [platformId]: false }))
    const fields = platformForm[platformId] || {}
    const platform = PLATFORMS.find(p => p.id === platformId)
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
      if (data.error) { setPlatformError(e => ({ ...e, [platformId]: data.error })); return }
      setPlatformSuccess(s => ({ ...s, [platformId]: true }))
      setPlatformForm(f => ({ ...f, [platformId]: {} }))
      await loadIntegrations(workspaceId)
    } catch (err) {
      setPlatformError(e => ({ ...e, [platformId]: String(err) }))
    } finally {
      setPlatformSaving(null)
    }
  }

  async function disconnectPlatform(platformId: string) {
    setPlatformDisconnecting(platformId)
    try {
      await fetch(`/api/integrations?workspaceId=${workspaceId}&platform=${platformId}`, { method: 'DELETE' })
      await loadIntegrations(workspaceId)
    } finally { setPlatformDisconnecting(null) }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (fetching) return (
    <div className="p-8">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex items-center gap-4">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Loading connections...</p>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">🔗</div>
          <h1 className="text-2xl font-bold text-white">Connections</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">Manage API keys for AI services and connect your publishing platforms.</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-8 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {([['api-keys', '🔑 API Keys'], ['platforms', '🔗 Platforms']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── API Keys Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'api-keys' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-yellow-950 border border-yellow-800 text-yellow-300 text-sm">
            API keys are stored encrypted in your workspace and used by agents to call external services. Keys saved here take precedence over environment variables.
          </div>

          {saveError && (
            <div className="p-4 rounded-xl bg-red-950 border border-red-800 text-red-300 text-sm">{saveError}</div>
          )}
          {saved && (
            <div className="p-4 rounded-xl bg-green-950 border border-green-800 text-green-300 text-sm">API keys saved successfully.</div>
          )}

          {KEY_CATEGORIES.map(category => (
            <KeyCategorySection
              key={category.title}
              category={category}
              modelSettings={modelSettings}
              updateKey={updateKey}
            />
          ))}

          <button
            onClick={saveKeys}
            disabled={saving}
            className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save All API Keys'}
          </button>
        </div>
      )}

      {/* ── Platforms Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'platforms' && (
        <div>
          {/* Safety notice */}
          <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-xl p-4 mb-8 flex gap-3">
            <span className="text-yellow-400 text-lg mt-0.5">⚠️</span>
            <div>
              <p className="text-yellow-300 text-sm font-medium">HITL Safety: Nothing publishes automatically</p>
              <p className="text-yellow-600 text-xs mt-0.5">Every post requires your explicit approval in the Approvals page before publishing. Credentials are stored encrypted and never logged.</p>
            </div>
          </div>

          {/* Ad / DSP Platforms */}
          <div className="mb-3">
            <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Ad Platforms & DSPs</h2>
            <p className="text-gray-600 text-xs mt-0.5">Connect to publish campaigns, sync performance, and enable AI optimization</p>
          </div>

          <div className="space-y-6">
            {PLATFORMS.map((platform, idx) => {
              const prevPlatform = PLATFORMS[idx - 1]
              const showSocialHeader = platform.badge === 'Social' && prevPlatform?.badge === 'DSP'
              const showMessagingHeader = platform.badge === 'Messaging' && prevPlatform?.badge === 'Social'

              const isConnected = connected.some(c => c.platform === platform.id)
              const connectedData = connected.find(c => c.platform === platform.id)
              const f = platformForm[platform.id] || {}

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
                            {platform.badge === 'DSP' && (
                              <span className="text-xs bg-purple-900/40 text-purple-400 px-2 py-0.5 rounded-full font-medium">DSP</span>
                            )}
                            {platform.badge === 'Messaging' && (
                              <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full font-medium">Messaging</span>
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
                            onClick={() => disconnectPlatform(platform.id)}
                            disabled={platformDisconnecting === platform.id}
                            className="text-red-400 hover:text-red-300 text-xs border border-red-900 hover:border-red-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {platformDisconnecting === platform.id ? 'Disconnecting...' : 'Disconnect'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Connection form */}
                    <div className="p-5">
                      {isConnected && connectedData ? (
                        <div className="flex items-center gap-3 text-sm text-gray-400 flex-wrap">
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
                          {platform.fields.map(field => (
                            <div key={field.key}>
                              <label className="block text-gray-400 text-xs font-medium mb-1.5">{field.label}</label>
                              <input
                                type={field.key === 'accessToken' ? 'password' : 'text'}
                                value={f[field.key] || ''}
                                onChange={e => setPlatformField(platform.id, field.key, e.target.value)}
                                placeholder={field.placeholder}
                                className={inputCls}
                              />
                              <p className="text-gray-600 text-xs mt-1">{field.hint}</p>
                            </div>
                          ))}

                          {'extraFields' in platform && (platform.extraFields as Array<{ key: string; label: string; placeholder: string; hint: string }>).map(field => (
                            <div key={field.key}>
                              <label className="block text-gray-400 text-xs font-medium mb-1.5">{field.label}</label>
                              <input
                                type="text"
                                value={f[field.key] || ''}
                                onChange={e => setPlatformField(platform.id, field.key, e.target.value)}
                                placeholder={field.placeholder}
                                className={inputCls}
                              />
                              <p className="text-gray-600 text-xs mt-1">{field.hint}</p>
                            </div>
                          ))}

                          {platformError[platform.id] && (
                            <p className="text-red-400 text-sm">{platformError[platform.id]}</p>
                          )}
                          {platformSuccess[platform.id] && (
                            <p className="text-green-400 text-sm">Connected successfully!</p>
                          )}

                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => connectPlatform(platform.id)}
                              disabled={platformSaving === platform.id || !f.accessToken || !f.accountId}
                              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
                            >
                              {platformSaving === platform.id ? 'Connecting...' : `Connect ${platform.name}`}
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
                { icon: '📊', name: 'TikTok Ads' },
                { icon: '📺', name: 'YouTube Ads (direct)' },
                { icon: '🛒', name: 'Amazon DSP' },
                { icon: '🏷️', name: 'Snapchat Ads' },
                { icon: '📱', name: 'Pinterest Ads' },
              ].map(p => (
                <div key={p.name} className="border border-gray-800 rounded-xl p-4 opacity-40 flex items-center gap-3">
                  <span className="text-xl">{p.icon}</span>
                  <span className="text-gray-400 text-sm">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── KeyCategorySection sub-component ─────────────────────────────────────────

function KeyCategorySection({
  category,
  modelSettings,
  updateKey,
}: {
  category: KeyCategory
  modelSettings: ModelSettings
  updateKey: (field: keyof ModelSettings, value: string) => void
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Category header */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-800">
        <span className="text-lg">{category.icon}</span>
        <h2 className="text-white font-semibold text-sm">{category.title}</h2>
      </div>

      {/* Fields */}
      <div className="px-6 py-5 space-y-5">
        {category.fields.map(field => {
          const value = (modelSettings[field.key] as string) || ''
          const isSaved = value.length > 0
          const inputType = field.type === 'text' || field.type === 'url' || field.type === 'email' ? field.type : 'password'
          return (
            <div key={String(field.key)}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-200">{field.label}</label>
                {isSaved && (
                  <span className="text-xs text-green-400 bg-green-950 border border-green-900 px-2 py-0.5 rounded-full">Saved</span>
                )}
              </div>
              {field.hint && <p className="text-xs text-gray-500 mb-2">{field.hint}</p>}
              <input
                type={inputType}
                value={value}
                onChange={e => updateKey(field.key, e.target.value)}
                placeholder={field.placeholder}
                className={inputCls}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
