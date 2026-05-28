'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SUPPORTED_MODELS } from '@/lib/models'

// ─── constants ───────────────────────────────────────────────────────────────
const CHANNELS = ['Instagram', 'LinkedIn', 'Twitter/X', 'YouTube', 'WhatsApp', 'Email', 'Google Ads', 'Meta Ads'] as const
const TONES = ['Professional', 'Friendly & Conversational', 'Bold & Direct', 'Educational', 'Inspirational', 'Witty & Playful', 'Founder-led / Personal']
const INDUSTRIES = ['SaaS / Tech', 'E-commerce', 'Consulting / Coaching', 'Agency / Services', 'Healthcare', 'Education / EdTech', 'Finance / FinTech', 'Real Estate', 'Food & Beverage', 'Other']
const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'SGD', 'AUD', 'CAD', 'JPY']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ACCENT_COLORS = [
  { name: 'Indigo', cls: 'bg-indigo-500', ring: 'ring-indigo-400' },
  { name: 'Purple', cls: 'bg-purple-500', ring: 'ring-purple-400' },
  { name: 'Blue', cls: 'bg-blue-500', ring: 'ring-blue-400' },
  { name: 'Teal', cls: 'bg-teal-500', ring: 'ring-teal-400' },
  { name: 'Green', cls: 'bg-green-500', ring: 'ring-green-400' },
  { name: 'Orange', cls: 'bg-orange-500', ring: 'ring-orange-400' },
]

// ─── nav sections ─────────────────────────────────────────────────────────────
type SectionKey = 'profile' | 'workspace' | 'api-keys' | 'ai-models' | 'notifications' | 'security' | 'appearance' | 'usage' | 'integrations' | 'billing' | 'danger'
const NAV_ITEMS: { key: SectionKey; icon: string; label: string; link?: string }[] = [
  { key: 'profile', icon: '👤', label: 'Profile' },
  { key: 'workspace', icon: '🏢', label: 'Workspace' },
  { key: 'api-keys', icon: '🔑', label: 'API Keys (BYOK)' },
  { key: 'ai-models', icon: '🤖', label: 'AI Models' },
  { key: 'notifications', icon: '🔔', label: 'Notifications' },
  { key: 'security', icon: '🔒', label: 'Security' },
  { key: 'appearance', icon: '🎨', label: 'Appearance' },
  { key: 'usage', icon: '📊', label: 'Usage & Limits' },
  { key: 'integrations', icon: '🔗', label: 'Integrations', link: '/dashboard/integrations' },
  { key: 'billing', icon: '💳', label: 'Billing', link: '/dashboard/billing' },
  { key: 'danger', icon: '🗑', label: 'Danger Zone' },
]

// ─── style helpers ────────────────────────────────────────────────────────────
const inp = 'w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'
const inpSm = 'px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'
const ta = 'w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm resize-none'
const btn = 'bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const btnGhost = 'border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const btnSm = 'px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors whitespace-nowrap'
const btnDanger = 'border border-red-800 text-red-400 hover:bg-red-950 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

// ─── interfaces ───────────────────────────────────────────────────────────────
interface ModelSettings {
  defaultModel: string
  braveSearchApiKey: string
  hubspotAccessToken: string
  ga4PropertyId: string
  ga4AccessToken: string
  metaWebhookVerifyToken: string
  resendApiKey: string
  firecrawlApiKey: string
  unsplashAccessKey: string
  pexelsApiKey: string
  groqApiKey: string
  openaiApiKey: string
  anthropicApiKey: string
  elevenLabsApiKey: string
  elevenLabsVoiceId: string
  elevenLabsVoiceModel: string
  stabilityApiKey: string
  replicateApiToken: string
  geminiApiKey: string
  geminiModel: string
  klingAccessKey: string
  klingSecretKey: string
  runwayApiKey: string
  lumaApiKey: string
  pikaApiKey: string
  heygenApiKey: string
  vapiApiKey: string
  openaiModel: string
  claudeModel: string
  slackBotToken: string
  slackChannelId: string
  telegramBotToken: string
  telegramChatId: string
  wpSiteUrl: string
  wpUsername: string
  wpAppPassword: string
  ghostUrl: string
  ghostAdminKey: string
  bufferAccessToken: string
  calcomApiKey: string
  tallyApiKey: string
  n8nBaseUrl: string
  n8nApiKey: string
  searchConsoleSiteUrl: string
  searchConsoleAccessToken: string
  cloudinaryCloudName: string
  cloudinaryApiKey: string
  cloudinaryApiSecret: string
  apolloApiKey: string
  hunterApiKey: string
  mailchimpApiKey: string
  mailchimpServer: string
  brevoApiKey: string
  brevoFromEmail: string
  deepgramApiKey: string
  twitterAccessToken: string
  twitterBearerToken: string
  linkedinAccessToken: string
  linkedinAuthorUrn: string
  youtubeApiKey: string
  youtubeAccessToken: string
  metaAccessToken: string
  metaAdAccountId: string
  googleAdsDeveloperToken: string
  googleAdsCustomerId: string
  googleAdsAccessToken: string
  linkedinAdsAccessToken: string
  linkedinAdsAccountId: string
  stripeSecretKey: string
  stripePublishableKey: string
  razorpayKeyId: string
  razorpayKeySecret: string
}

// Sprint 7C: shapes returned by /api/account/sessions + login-history.
interface Session {
  id: string
  workspaceId: string | null
  device: string
  browser: string
  ip: string
  createdAt: string
  lastSeenAt: string
  current: boolean
}
interface LoginRecord {
  id: string
  createdAt: string
  ip: string
  device: string
  success: boolean
  failureReason: string | null
}

// ─── Sprint 8F: BYOK organised by USAGE, not by provider ──────────────────────
//
// Previous structure listed ~25 cards alphabetically by vendor name (OpenAI,
// Anthropic, ElevenLabs, …). For a non-technical operator that meant: "I want
// the dashboard to send emails — which one of these 25 do I need?" Now the
// section groups providers by the FEATURE they unlock, with plain-English
// "Why this matters" copy and an honest "✅ tested" vs "📋 paste-only" badge.
//
// Adding a new provider:
//   1. Make sure the ModelSettings interface already has the field(s).
//   2. Add a UseCaseProvider entry under the matching use case below.
//   3. If the provider has a live test endpoint, set testProvider — must
//      match a key in PROVIDER_MAP inside testConnection() (api-keys
//      handler). Otherwise leave undefined and the card renders a
//      "paste-only — no live test yet" disclosure instead of a Test button.

interface UseCaseField {
  /** key on ModelSettings to read/write. */
  field: keyof ModelSettings
  /** Human-readable label shown above the input. */
  label: string
  /** Placeholder shown inside the input (e.g. `sk-proj-…`). */
  placeholder?: string
  /** Optional one-liner under the label explaining where to get the value. */
  hint?: string
  /** 'password' → MaskedInput with show/hide + copy. 'text' → plain input.
   *  Defaults to 'password' when the label contains "Key" or "Token" or
   *  "Secret"; otherwise 'text'. */
  type?: 'password' | 'text'
  /** Optional list of <option>s for a <select>. When provided, the field
   *  renders as a dropdown instead of a text input. */
  options?: string[]
}

interface UseCaseProvider {
  /** Stable id — also used as the React key. */
  id: string
  /** Display name (e.g. "OpenAI"). */
  name: string
  /** One-line plain-English description of what this provider does for you. */
  whatFor: string
  /** All the fields belonging to this provider. Most have one; ElevenLabs
   *  has three (key + voice model + voice id), etc. */
  fields: UseCaseField[]
  /** If set, "Test Connection" button is rendered and dispatches to the
   *  existing testConnection() helper with this slug. Must match an entry
   *  in PROVIDER_MAP inside that helper. */
  testProvider?: string
  /** Link to where the user finds their key. */
  docUrl?: string
  /** Reduces visual weight — used for "you only need this if you already
   *  use $tool" providers (e.g. n8n, Buffer, Ghost). */
  optional?: boolean
  /** If set, ProviderCard renders a "Send Test Notification" button that
   *  dispatches via testNotification(). Distinct from testProvider because
   *  Slack/Telegram require both a token AND a target channel/chat id —
   *  we test the full path, not just credential validity. */
  notifyTest?: 'slack' | 'telegram'
}

interface UseCase {
  /** Section id — used in URL hash too so we can deep-link to a section. */
  id: string
  emoji: string
  /** Plain-English title — "Generate AI text" not "LLM providers". */
  title: string
  /** 1-2 sentence "why a normal user would care" explanation. */
  why: string
  /** Concrete features this group of keys unlocks, rendered as a bullet
   *  list above the provider cards. */
  unlocks: string[]
  providers: UseCaseProvider[]
  /** When true, the section header carries a "Pick at least one" hint —
   *  e.g. AI text models (OpenAI OR Anthropic OR Gemini). */
  pickOne?: boolean
  /** Optional override line — "We recommend Anthropic for best quality." */
  recommendation?: string
}

const KEY_USE_CASES: UseCase[] = [
  {
    id: 'ai-text',
    emoji: '🧠',
    title: 'Generate AI text (drafts, strategy, replies)',
    why: 'Every agent that writes content — post drafts, strategy briefs, email replies, ad copy — needs at least one text model. Without this, the agents fall back to error states.',
    unlocks: ['Content drafting (CMO agent)', 'Strategy generation', 'Email reply drafts', 'Brand-voice scoring on /dashboard/approvals'],
    pickOne: true,
    recommendation: 'Anthropic (Claude) is the default model the agents are tuned for. OpenAI works as a backup. Groq is the cheapest option for bulk tasks.',
    providers: [
      {
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        whatFor: 'Default brain for every agent. Required for strategy, content drafts, brand-voice scoring.',
        testProvider: 'anthropic',
        docUrl: 'https://console.anthropic.com/settings/keys',
        fields: [
          { field: 'anthropicApiKey', label: 'API Key', placeholder: 'sk-ant-…', hint: 'Get one at console.anthropic.com/settings/keys', type: 'password' },
          { field: 'claudeModel', label: 'Default model', type: 'text', options: ['claude-sonnet-4-6', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'] },
        ],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        whatFor: 'Backup brain when Claude is unavailable. Also powers DALL-E image generation (next section).',
        testProvider: 'openai',
        docUrl: 'https://platform.openai.com/api-keys',
        fields: [
          { field: 'openaiApiKey', label: 'API Key', placeholder: 'sk-proj-…', hint: 'Get one at platform.openai.com/api-keys', type: 'password' },
          { field: 'openaiModel', label: 'Default model', type: 'text', options: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
        ],
      },
      {
        id: 'gemini',
        name: 'Google Gemini',
        whatFor: 'Alternative brain — free tier available. Good for bulk classification tasks.',
        testProvider: 'gemini',
        docUrl: 'https://aistudio.google.com/app/apikey',
        optional: true,
        fields: [
          { field: 'geminiApiKey', label: 'API Key', placeholder: 'AIza…', hint: 'Free at aistudio.google.com/app/apikey', type: 'password' },
          { field: 'geminiModel', label: 'Default model', type: 'text', options: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'] },
        ],
      },
      {
        id: 'groq',
        name: 'Groq',
        whatFor: 'Cheapest option for bulk text tasks (lead scoring, summarisation). Free tier is generous.',
        docUrl: 'https://console.groq.com/keys',
        optional: true,
        fields: [
          { field: 'groqApiKey', label: 'API Key', placeholder: 'gsk_…', hint: 'Free at console.groq.com/keys', type: 'password' },
        ],
      },
    ],
  },
  {
    id: 'image-gen',
    emoji: '🖼️',
    title: 'Generate images',
    why: 'AI-generated images for posts, ads, hero shots. Without these, the Image Studio shows a "no providers connected" empty state.',
    unlocks: ['/dashboard/image-gen', 'Auto-generated post visuals in CMO drafts', 'Ad creative generation in /dashboard/ads'],
    pickOne: true,
    recommendation: 'OpenAI (DALL-E 3) is wired most thoroughly. Stability is cheapest per image. Stock libraries (Unsplash/Pexels) are free but not AI-generated.',
    providers: [
      {
        id: 'openai-images',
        name: 'OpenAI DALL-E 3',
        whatFor: 'Highest quality general-purpose images. Uses the OpenAI key you set above.',
        docUrl: 'https://platform.openai.com/api-keys',
        fields: [
          { field: 'openaiApiKey', label: 'OpenAI API Key', placeholder: 'sk-proj-…', hint: 'Same key as the AI text section above. Setting it here also unlocks DALL-E.', type: 'password' },
        ],
        testProvider: 'openai',
      },
      {
        id: 'stability',
        name: 'Stability AI (SDXL)',
        whatFor: 'Stable Diffusion XL — cheapest per image. Good for stylised art.',
        testProvider: 'stability',
        docUrl: 'https://platform.stability.ai/account/keys',
        fields: [
          { field: 'stabilityApiKey', label: 'API Key', placeholder: 'sk-…', hint: 'Get one at platform.stability.ai/account/keys', type: 'password' },
        ],
      },
      {
        id: 'replicate',
        name: 'Replicate',
        whatFor: 'Run open-source models (FLUX, SDXL fine-tunes, etc.) via API.',
        testProvider: 'replicate',
        docUrl: 'https://replicate.com/account/api-tokens',
        optional: true,
        fields: [
          { field: 'replicateApiToken', label: 'API Token', placeholder: 'r8_…', hint: 'Get one at replicate.com/account/api-tokens', type: 'password' },
        ],
      },
      {
        id: 'unsplash',
        name: 'Unsplash (stock photos)',
        whatFor: 'Free real photography. Not AI-generated. Good for blog headers and lifestyle shots.',
        docUrl: 'https://unsplash.com/developers',
        optional: true,
        fields: [
          { field: 'unsplashAccessKey', label: 'Access Key', placeholder: 'Unsplash access key', hint: 'Free at unsplash.com/developers', type: 'password' },
        ],
      },
      {
        id: 'pexels',
        name: 'Pexels (stock photos)',
        whatFor: 'Alternative free stock photo library.',
        docUrl: 'https://www.pexels.com/api/',
        optional: true,
        fields: [
          { field: 'pexelsApiKey', label: 'API Key', placeholder: 'Pexels API key', hint: 'Free at pexels.com/api', type: 'password' },
        ],
      },
    ],
  },
  {
    id: 'video-gen',
    emoji: '🎬',
    title: 'Generate videos',
    why: 'AI-generated videos for ads, short-form social, avatar talking heads.',
    unlocks: ['/dashboard/video-gen', 'Short-form ads with motion'],
    pickOne: true,
    providers: [
      {
        id: 'runway',
        name: 'Runway ML',
        whatFor: 'Gen-3 video generation. Best quality general-purpose AI video.',
        testProvider: 'runway',
        docUrl: 'https://app.runwayml.com/account/api-keys',
        fields: [
          { field: 'runwayApiKey', label: 'API Key', placeholder: 'key_…', hint: 'Get one at app.runwayml.com/account/api-keys', type: 'password' },
        ],
      },
      {
        id: 'kling',
        name: 'Kling AI',
        whatFor: 'Real Kuaishou Kling 2.0 API. Strong on character consistency. Needs both access + secret key — used to mint a JWT for each request.',
        testProvider: 'kling',
        docUrl: 'https://klingai.com',
        optional: true,
        fields: [
          { field: 'klingAccessKey', label: 'Access Key', placeholder: 'Access key', type: 'password' },
          { field: 'klingSecretKey', label: 'Secret Key', placeholder: 'Secret key', type: 'password' },
        ],
      },
      {
        id: 'luma',
        name: 'Luma Dream Machine',
        whatFor: 'Real Luma Dream Machine API. Photorealistic motion + cinematic shots. Single bearer token from lumalabs.ai.',
        docUrl: 'https://lumalabs.ai/dream-machine/api/keys',
        optional: true,
        fields: [
          { field: 'lumaApiKey', label: 'API Key', placeholder: 'luma-...', hint: 'Get one at lumalabs.ai/dream-machine/api/keys', type: 'password' },
        ],
      },
      {
        id: 'pika',
        name: 'Pika Labs',
        whatFor: 'Stylised cartoon + animation generation. Public API is limited-access; if you have it, paste your key here and the dispatcher will use Pika when selected.',
        docUrl: 'https://pika.art',
        optional: true,
        fields: [
          { field: 'pikaApiKey', label: 'API Key', placeholder: 'pika-...', hint: 'Pika API access is invitation-only as of writing; check pika.art for current status.', type: 'password' },
        ],
      },
      {
        id: 'heygen',
        name: 'HeyGen (avatar video)',
        whatFor: 'AI avatar talking-head videos. Use for explainers and ads with a face.',
        docUrl: 'https://app.heygen.com/settings/api',
        optional: true,
        fields: [
          { field: 'heygenApiKey', label: 'API Key', placeholder: 'HeyGen API Key', type: 'password' },
        ],
      },
    ],
  },
  {
    id: 'voice',
    emoji: '🎙️',
    title: 'Voice & audio',
    why: 'Text-to-speech for video voiceovers, transcription for sales calls, voice agents for phone follow-up.',
    unlocks: ['/dashboard/voiceover', '/dashboard/voice-ai', 'Auto-transcription of uploaded sales calls'],
    providers: [
      {
        id: 'elevenlabs',
        name: 'ElevenLabs',
        whatFor: 'Highest-quality AI voices. Used by /voiceover and /voice-ai.',
        testProvider: 'elevenLabs',
        docUrl: 'https://elevenlabs.io/app/settings/api-keys',
        fields: [
          { field: 'elevenLabsApiKey', label: 'API Key', placeholder: 'sk_…', hint: 'Free tier at elevenlabs.io', type: 'password' },
          { field: 'elevenLabsVoiceModel', label: 'Voice model', options: ['eleven_multilingual_v2', 'eleven_english_v1', 'eleven_turbo_v2'] },
          { field: 'elevenLabsVoiceId', label: 'Default voice id (optional)', placeholder: '21m00Tcm4TlvDq8ikWAM' },
        ],
      },
      {
        id: 'deepgram',
        name: 'Deepgram',
        whatFor: 'Fast audio transcription. Used when you upload sales calls or podcast audio.',
        docUrl: 'https://console.deepgram.com/',
        optional: true,
        fields: [
          { field: 'deepgramApiKey', label: 'API Key', placeholder: 'Deepgram API key', type: 'password' },
        ],
      },
      {
        id: 'vapi',
        name: 'Vapi (voice agents)',
        whatFor: 'Phone-based AI voice agents. Only if you want the agents to make outbound calls.',
        docUrl: 'https://vapi.ai/',
        optional: true,
        fields: [
          { field: 'vapiApiKey', label: 'API Key', placeholder: 'Vapi API Key', type: 'password' },
        ],
      },
    ],
  },
  {
    id: 'social',
    emoji: '📤',
    title: 'Post to social media',
    why: 'These let the publishing engine actually push your approved drafts live to your channels. Without them, posts stay as drafts in /dashboard/approvals.',
    unlocks: ['/dashboard/publishing', 'Auto-publish on approval', 'Scheduled posts cron'],
    providers: [
      {
        id: 'linkedin',
        name: 'LinkedIn',
        whatFor: 'Post text + images to your LinkedIn profile or company page.',
        docUrl: 'https://www.linkedin.com/developers/apps',
        fields: [
          { field: 'linkedinAccessToken', label: 'Access Token', placeholder: 'LinkedIn Access Token', hint: 'Generate from LinkedIn Developer Portal. We will add a one-click OAuth flow soon.', type: 'password' },
          { field: 'linkedinAuthorUrn', label: 'Person/Company URN', placeholder: 'urn:li:person:…' },
        ],
      },
      {
        id: 'twitter',
        name: 'X (Twitter)',
        whatFor: 'Post tweets, including media. Bearer or User Access Token.',
        docUrl: 'https://developer.x.com/en/portal/dashboard',
        fields: [
          { field: 'twitterAccessToken', label: 'User Access Token (preferred — can post)', placeholder: 'Twitter Access Token', type: 'password' },
          { field: 'twitterBearerToken', label: 'Bearer Token (read-only)', placeholder: 'Twitter Bearer Token', type: 'password' },
        ],
      },
      {
        id: 'youtube',
        name: 'YouTube',
        whatFor: 'Read analytics and (later) upload Shorts.',
        docUrl: 'https://console.cloud.google.com/apis/credentials',
        optional: true,
        fields: [
          { field: 'youtubeApiKey', label: 'API Key', placeholder: 'YouTube API Key', type: 'password' },
          { field: 'youtubeAccessToken', label: 'OAuth Access Token', placeholder: 'YouTube Access Token', type: 'password' },
        ],
      },
      {
        id: 'meta',
        name: 'Meta (Facebook + Instagram)',
        whatFor: 'Post to Facebook Pages and Instagram Business accounts.',
        docUrl: 'https://developers.facebook.com/apps',
        fields: [
          { field: 'metaAccessToken', label: 'Page Access Token', placeholder: 'EAA…', hint: 'Get a long-lived Page token from your Meta App.', type: 'password' },
          { field: 'metaWebhookVerifyToken', label: 'Webhook verify token (any string you choose)', placeholder: 'Your chosen verify token' },
        ],
      },
      {
        id: 'wordpress',
        name: 'WordPress',
        whatFor: 'Publish blog drafts directly to your WP site.',
        docUrl: 'https://wordpress.org/documentation/article/application-passwords/',
        optional: true,
        fields: [
          { field: 'wpSiteUrl', label: 'Site URL', placeholder: 'https://yourblog.com' },
          { field: 'wpUsername', label: 'Username', placeholder: 'admin' },
          { field: 'wpAppPassword', label: 'Application Password', placeholder: 'xxxx xxxx xxxx xxxx', hint: 'Generate inside WP Admin → Users → Profile → Application Passwords.', type: 'password' },
        ],
      },
      {
        id: 'ghost',
        name: 'Ghost',
        whatFor: 'Alternative blog publishing platform.',
        docUrl: 'https://ghost.org/docs/admin-api/',
        optional: true,
        fields: [
          { field: 'ghostUrl', label: 'Site URL', placeholder: 'https://yourblog.ghost.io' },
          { field: 'ghostAdminKey', label: 'Admin API Key', placeholder: 'Ghost admin key', type: 'password' },
        ],
      },
      {
        id: 'buffer',
        name: 'Buffer (legacy scheduler)',
        whatFor: 'Old scheduling fallback. Skip if you set up direct LinkedIn/X above.',
        docUrl: 'https://buffer.com/developers/api',
        optional: true,
        fields: [
          { field: 'bufferAccessToken', label: 'Access Token', placeholder: 'Buffer access token', type: 'password' },
        ],
      },
    ],
  },
  {
    id: 'ads',
    emoji: '📢',
    title: 'Run paid ads',
    why: 'These let the Ads agent create, launch, and optimise paid campaigns on Meta / Google / LinkedIn.',
    unlocks: ['/dashboard/ads', 'Campaign sync cron (every 6am)'],
    providers: [
      {
        id: 'meta-ads',
        name: 'Meta Ads',
        whatFor: 'Facebook + Instagram ads. Uses the Meta access token from the social section.',
        docUrl: 'https://developers.facebook.com/docs/marketing-api',
        fields: [
          { field: 'metaAccessToken', label: 'Access Token (same as social)', placeholder: 'EAA…', type: 'password' },
          { field: 'metaAdAccountId', label: 'Ad Account ID', placeholder: 'act_123456789' },
        ],
      },
      {
        id: 'google-ads',
        name: 'Google Ads',
        whatFor: 'Search + Display ads. Most complex setup — needs OAuth access token from Google OAuth Playground.',
        docUrl: 'https://developers.google.com/google-ads/api/docs/get-started/dev-token',
        fields: [
          { field: 'googleAdsDeveloperToken', label: 'Developer Token', placeholder: 'Google Ads Developer Token', type: 'password' },
          { field: 'googleAdsCustomerId', label: 'Customer ID', placeholder: '123-456-7890' },
          { field: 'googleAdsAccessToken', label: 'OAuth Access Token', placeholder: 'ya29.…', type: 'password' },
        ],
      },
      {
        id: 'linkedin-ads',
        name: 'LinkedIn Ads',
        whatFor: 'B2B-focused paid LinkedIn campaigns.',
        docUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/',
        optional: true,
        fields: [
          { field: 'linkedinAdsAccessToken', label: 'Access Token', placeholder: 'LinkedIn Ads Access Token', type: 'password' },
          { field: 'linkedinAdsAccountId', label: 'Ad Account URN', placeholder: 'urn:li:sponsoredAccount:…' },
        ],
      },
    ],
  },
  {
    id: 'email',
    emoji: '📧',
    title: 'Send emails (transactional + marketing)',
    why: 'Without an email sender, approvals confirmations, lead nurture sequences, and the auto-approve cron emails all silently no-op.',
    unlocks: ['/dashboard/email-marketing', 'Lead nurture workflows', 'Approval confirmation emails'],
    providers: [
      {
        id: 'resend',
        name: 'Resend (recommended)',
        whatFor: 'Used by every internal email path (approvals, calendar reminders, etc.).',
        docUrl: 'https://resend.com/api-keys',
        fields: [
          { field: 'resendApiKey', label: 'API Key', placeholder: 're_…', hint: 'Free at resend.com/api-keys', type: 'password' },
        ],
      },
      {
        id: 'mailchimp',
        name: 'Mailchimp',
        whatFor: 'Large list marketing campaigns. Only if you already use Mailchimp.',
        docUrl: 'https://mailchimp.com/help/about-api-keys/',
        optional: true,
        fields: [
          { field: 'mailchimpApiKey', label: 'API Key', placeholder: 'Mailchimp API key', type: 'password' },
          { field: 'mailchimpServer', label: 'Server prefix', placeholder: 'us18', hint: 'The bit after the dash in your API key.' },
        ],
      },
      {
        id: 'brevo',
        name: 'Brevo (Sendinblue)',
        whatFor: 'Alternative email marketing platform.',
        docUrl: 'https://app.brevo.com/settings/keys/api',
        optional: true,
        fields: [
          { field: 'brevoApiKey', label: 'API Key', placeholder: 'Brevo API key', type: 'password' },
          { field: 'brevoFromEmail', label: 'From email', placeholder: 'hello@yourcompany.com' },
        ],
      },
    ],
  },
  {
    id: 'analytics',
    emoji: '📊',
    title: 'Pull website analytics',
    why: 'Lets the Analytics agent read your real GA4 and Search Console data instead of showing empty charts.',
    unlocks: ['/dashboard/analytics traffic + SEO panels', 'Strategy briefs that reference real traffic'],
    providers: [
      {
        id: 'ga4',
        name: 'Google Analytics 4',
        whatFor: 'Read traffic, conversion, audience data from your GA4 property.',
        docUrl: 'https://analytics.google.com/',
        fields: [
          { field: 'ga4PropertyId', label: 'GA4 Property ID', placeholder: '1234567890', hint: 'In GA4 Admin → Property Settings.' },
          { field: 'ga4AccessToken', label: 'OAuth Access Token', placeholder: 'ya29.…', type: 'password' },
        ],
      },
      {
        id: 'search-console',
        name: 'Google Search Console',
        whatFor: 'Track which keywords your site ranks for and click-through rates.',
        docUrl: 'https://search.google.com/search-console',
        optional: true,
        fields: [
          { field: 'searchConsoleSiteUrl', label: 'Site URL', placeholder: 'https://yourdomain.com' },
          { field: 'searchConsoleAccessToken', label: 'OAuth Access Token', placeholder: 'ya29.…', type: 'password' },
        ],
      },
    ],
  },
  {
    id: 'research',
    emoji: '🔎',
    title: 'Research & lead enrichment',
    why: 'These let the Research and Lead Enrichment agents pull real web data — competitor scans, trend signals, contact info — instead of working from Claude\'s memory alone.',
    unlocks: ['/dashboard/research', 'Auto-enrichment of captured leads', 'Brand-monitor trend scans'],
    providers: [
      {
        id: 'brave',
        name: 'Brave Search',
        whatFor: 'Web search results for trend scanning and competitive intelligence.',
        docUrl: 'https://brave.com/search/api/',
        fields: [
          { field: 'braveSearchApiKey', label: 'API Key', placeholder: 'BSA…', hint: 'Free tier at brave.com/search/api', type: 'password' },
        ],
      },
      {
        id: 'firecrawl',
        name: 'Firecrawl',
        whatFor: 'Crawl websites into clean markdown. Used for competitor analysis.',
        docUrl: 'https://firecrawl.dev/',
        optional: true,
        fields: [
          { field: 'firecrawlApiKey', label: 'API Key', placeholder: 'fc-…', type: 'password' },
        ],
      },
      {
        id: 'apollo',
        name: 'Apollo.io',
        whatFor: 'B2B contact enrichment — turn an email into a full prospect profile.',
        docUrl: 'https://app.apollo.io/#/settings/integrations/api',
        optional: true,
        fields: [
          { field: 'apolloApiKey', label: 'API Key', placeholder: 'Apollo.io API key', type: 'password' },
        ],
      },
      {
        id: 'hunter',
        name: 'Hunter.io',
        whatFor: 'Find email addresses by domain. Lighter weight than Apollo.',
        docUrl: 'https://hunter.io/api-keys',
        optional: true,
        fields: [
          { field: 'hunterApiKey', label: 'API Key', placeholder: 'Hunter.io API key', type: 'password' },
        ],
      },
    ],
  },
  {
    id: 'crm',
    emoji: '🤝',
    title: 'Sync with external CRM',
    why: 'Only needed if your sales team uses HubSpot/Salesforce and you want leads captured by the agents to flow there. Without this, leads stay in /dashboard/leads-crm only.',
    unlocks: ['Two-way sync with HubSpot deals', 'Capture-to-CRM workflows'],
    providers: [
      {
        id: 'hubspot',
        name: 'HubSpot',
        whatFor: 'Push captured leads + activities into HubSpot.',
        docUrl: 'https://developers.hubspot.com/docs/api/private-apps',
        optional: true,
        fields: [
          { field: 'hubspotAccessToken', label: 'Private App Access Token', placeholder: 'pat-…', type: 'password' },
        ],
      },
    ],
  },
  {
    id: 'billing',
    emoji: '💳',
    title: 'Accept payments from your customers',
    why: 'Only relevant if your agency or product charges customers through the Ooumph platform. Without this, billing flows on /dashboard/billing show "configure your payment provider" prompts.',
    unlocks: ['/dashboard/billing subscribe flow', '/super-admin commission payouts via Stripe Connect'],
    providers: [
      {
        id: 'stripe',
        name: 'Stripe',
        whatFor: 'Most common option. Powers subscriptions, one-off charges, and agency-to-client payouts.',
        docUrl: 'https://dashboard.stripe.com/apikeys',
        optional: true,
        fields: [
          { field: 'stripeSecretKey', label: 'Secret Key', placeholder: 'sk_live_… or sk_test_…', hint: 'NEVER paste a live key into a test environment.', type: 'password' },
          { field: 'stripePublishableKey', label: 'Publishable Key', placeholder: 'pk_live_…' },
        ],
      },
      {
        id: 'razorpay',
        name: 'Razorpay (India)',
        whatFor: 'India-first alternative to Stripe.',
        docUrl: 'https://dashboard.razorpay.com/app/keys',
        optional: true,
        fields: [
          { field: 'razorpayKeyId', label: 'Key ID', placeholder: 'rzp_live_…' },
          { field: 'razorpayKeySecret', label: 'Key Secret', placeholder: 'Razorpay Key Secret', type: 'password' },
        ],
      },
    ],
  },
  {
    id: 'booking',
    emoji: '📅',
    title: 'Booking & form intake',
    why: 'Hook your existing booking + form tools so leads captured there flow into the agents.',
    unlocks: ['Auto-capture from Cal.com bookings', 'Tally form → lead workflow'],
    providers: [
      {
        id: 'calcom',
        name: 'Cal.com',
        whatFor: 'Booking platform — sync booked meetings into /dashboard/calendar.',
        docUrl: 'https://cal.com/settings/developer/api-keys',
        optional: true,
        fields: [
          { field: 'calcomApiKey', label: 'API Key', placeholder: 'cal_live_…', type: 'password' },
        ],
      },
      {
        id: 'tally',
        name: 'Tally',
        whatFor: 'Form builder. Pipes form submissions into captured leads.',
        docUrl: 'https://tally.so/help/api-keys',
        optional: true,
        fields: [
          { field: 'tallyApiKey', label: 'API Key', placeholder: 'Tally API key', type: 'password' },
        ],
      },
    ],
  },
  {
    id: 'storage',
    emoji: '🗃️',
    title: 'Store generated media',
    why: 'Only if you want generated images / videos uploaded to your own Cloudinary account instead of relying on provider-hosted URLs (which can expire).',
    unlocks: ['Persistent media URLs', 'Custom CDN'],
    providers: [
      {
        id: 'cloudinary',
        name: 'Cloudinary',
        whatFor: 'Hosts and transforms generated media.',
        docUrl: 'https://console.cloudinary.com/settings/api-keys',
        optional: true,
        fields: [
          { field: 'cloudinaryCloudName', label: 'Cloud Name', placeholder: 'mycloud' },
          { field: 'cloudinaryApiKey', label: 'API Key', placeholder: 'Cloudinary API Key' },
          { field: 'cloudinaryApiSecret', label: 'API Secret', placeholder: 'Cloudinary API Secret', type: 'password' },
        ],
      },
    ],
  },
  {
    id: 'notifications',
    emoji: '🔔',
    title: 'Send notifications to your team',
    why: 'Internal alerts — when an approval is overdue, a campaign budget is hit, or the brand monitor trips. Routed to Slack/Telegram instead of email.',
    unlocks: ['Slack notifications when KPIs miss', 'Telegram alerts for crisis events'],
    providers: [
      {
        id: 'slack',
        name: 'Slack',
        whatFor: 'Post messages into your team\'s Slack channel.',
        docUrl: 'https://api.slack.com/apps',
        optional: true,
        notifyTest: 'slack',
        fields: [
          { field: 'slackBotToken', label: 'Bot Token', placeholder: 'xoxb-…', hint: 'Needs the chat:write scope.', type: 'password' },
          { field: 'slackChannelId', label: 'Channel ID', placeholder: 'C0123456789' },
        ],
      },
      {
        id: 'telegram',
        name: 'Telegram',
        whatFor: 'Send alerts to a Telegram chat (DM or group).',
        docUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
        optional: true,
        notifyTest: 'telegram',
        fields: [
          { field: 'telegramBotToken', label: 'Bot Token', placeholder: '123456789:AAF…', hint: 'Create with @BotFather on Telegram.', type: 'password' },
          { field: 'telegramChatId', label: 'Chat ID', placeholder: '-1001234567890' },
        ],
      },
    ],
  },
  {
    id: 'automation',
    emoji: '🔌',
    title: 'Connect to n8n automation hub',
    why: 'Only if you already run an n8n instance and want it to trigger / be triggered by Ooumph workflows.',
    unlocks: ['Custom workflow triggers'],
    providers: [
      {
        id: 'n8n',
        name: 'n8n',
        whatFor: 'Bridge to external automation flows you already maintain.',
        docUrl: 'https://docs.n8n.io/api/authentication/',
        optional: true,
        fields: [
          { field: 'n8nBaseUrl', label: 'Base URL', placeholder: 'https://your-n8n.domain.com' },
          { field: 'n8nApiKey', label: 'API Key', placeholder: 'n8n API key', type: 'password' },
        ],
      },
    ],
  },
]

// ─── masked key input ─────────────────────────────────────────────────────────
function MaskedInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)
  const copy = () => {
    if (value) { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  }
  return (
    <div className="flex gap-2 items-center">
      <div className="relative flex-1">
        <input
          type={show ? 'text' : 'password'}
          className={className || inp}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
      <button type="button" onClick={() => setShow(s => !s)} className={btnSm} title={show ? 'Hide' : 'Show'}>{show ? '🙈' : '👁'}</button>
      <button type="button" onClick={copy} className={btnSm} title="Copy">{copied ? '✅' : '📋'}</button>
    </div>
  )
}

// ─── section wrapper ──────────────────────────────────────────────────────────
function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
      {title && (
        <div className="border-b border-gray-800 pb-3">
          <h2 className="text-white font-semibold text-sm">{title}</h2>
          {subtitle && <p className="text-gray-500 text-xs mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-200 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-gray-500 mb-2">{hint}</p>}
      {children}
    </div>
  )
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        onClick={onToggle}
        className={`relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-indigo-600' : 'bg-gray-700'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
      </button>
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  )
}

function UsageBar({ label, used, total, unit }: { label: string; used: number; total: number; unit?: string }) {
  const pct = Math.min((used / total) * 100, 100)
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-400">{fmt(used)} / {fmt(total)}{unit ? ` ${unit}` : ''}</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-gray-600 text-xs text-right">{pct.toFixed(1)}% used</p>
    </div>
  )
}

// ─── Sprint 8F: BYOK provider card, rendered from KEY_USE_CASES ───────────────
//
// Pure presentation. Receives the live modelSettings + setter + testResults
// from the page-level state. Renders one provider's worth of fields with
// honest disclosure about whether a real "Test Connection" exists or whether
// the field is paste-only (status badge is just "has value" in the latter
// case, never the false "✅ Verified" we used to lie about).

function ProviderCard({
  provider, ms, update, onTest, testResult, onNotifyTest, notifyResult,
}: {
  provider: UseCaseProvider
  ms: ModelSettings
  update: (field: keyof ModelSettings, value: string) => void
  onTest: (testProvider: string) => void
  testResult?: string
  /** Optional handler for Slack/Telegram-style notify tests (full delivery
   *  loop, not just credential validation). */
  onNotifyTest?: (service: 'slack' | 'telegram') => void
  notifyResult?: string
}) {
  // A provider is "filled in" if its FIRST field has a value. Subsequent
  // fields (model, voice id, etc.) are configuration not authentication —
  // missing them doesn't mean the connection is broken.
  const primaryField = provider.fields[0]
  const filled = !!(ms as unknown as Record<string, string>)[primaryField.field as string]?.trim()

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${provider.optional ? 'bg-gray-900/40 border-gray-800' : 'bg-gray-900 border-gray-800'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white text-sm font-semibold">{provider.name}</h3>
            {provider.optional && (
              <span className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded">Optional</span>
            )}
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${filled ? 'bg-green-900/60 text-green-300 border border-green-800/60' : 'bg-gray-800 text-yellow-400 border border-yellow-900/40'}`}>
              {filled ? '✓ Filled in' : 'Not set'}
            </span>
            {provider.testProvider
              ? <span className="text-[10px] text-indigo-300 bg-indigo-950/60 border border-indigo-900/60 px-1.5 py-0.5 rounded" title="The Test Connection button pings the live provider before saving.">Live test</span>
              : <span className="text-[10px] text-gray-500 bg-gray-800/60 border border-gray-700 px-1.5 py-0.5 rounded" title="No live test endpoint yet — this card just stores the value. We can't tell you whether the key actually works until something uses it.">Paste only</span>
            }
          </div>
          <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">{provider.whatFor}</p>
        </div>
        {provider.docUrl && (
          <a href={provider.docUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 text-xs whitespace-nowrap" title="Open the provider's key-management page">
            Get key ↗
          </a>
        )}
      </div>

      {provider.fields.map(f => {
        const value = (ms as unknown as Record<string, string>)[f.field as string] || ''
        const useMask = (f.type ?? (/Key|Token|Secret|Password/i.test(f.label) ? 'password' : 'text')) === 'password'
        return (
          <Field key={f.field as string} label={f.label} hint={f.hint}>
            {f.options
              ? (
                <select className={inp} value={value} onChange={e => update(f.field, e.target.value)}>
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )
              : useMask
                ? <MaskedInput value={value} onChange={v => update(f.field, v)} placeholder={f.placeholder} />
                : <input className={inp} value={value} onChange={e => update(f.field, e.target.value)} placeholder={f.placeholder} />
            }
          </Field>
        )
      })}

      {provider.testProvider && (
        <div className="flex items-center gap-3 pt-1 flex-wrap">
          <button onClick={() => onTest(provider.testProvider!)} className={btnSm}>
            Test Connection
          </button>
          {testResult && <span className="text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded">{testResult}</span>}
          <span className="text-[11px] text-gray-500">On a successful test, this key is auto-saved (encrypted).</span>
        </div>
      )}

      {provider.notifyTest && onNotifyTest && (
        <div className="flex items-center gap-3 pt-1 flex-wrap">
          <button onClick={() => onNotifyTest(provider.notifyTest!)} className={btnSm}>
            Send Test Notification
          </button>
          {notifyResult && (
            <span className={`text-xs px-2 py-0.5 rounded ${notifyResult.startsWith('✅') ? 'text-green-400 bg-green-950/40' : 'text-red-400 bg-red-950/40'}`}>
              {notifyResult}
            </span>
          )}
          <span className="text-[11px] text-gray-500">Sends a real message to your configured channel.</span>
        </div>
      )}
    </div>
  )
}

// ─── modal ─────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<SectionKey>('profile')
  const [fetching, setFetching] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [unsaved, setUnsaved] = useState<Set<SectionKey>>(new Set())

  // ── brand / workspace form ─────────────────────────────────────────────────
  const [form, setForm] = useState({
    businessName: '', industry: '', website: '', tagline: '',
    offer: '', uniqueValue: '', targetAudience: '', tone: '',
    competitors: '', channels: [] as string[], goals: '',
    monthlyBudget: '', prohibitedClaims: '', approvalEmail: '',
  })

  // ── profile state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState({
    fullName: '', email: '', jobTitle: '', phone: '',
    timezone: 'UTC', language: 'English', avatar: '',
  })

  // ── workspace state ────────────────────────────────────────────────────────
  const [workspace, setWorkspace] = useState({
    name: '', logo: '', industry: '', businessType: 'B2B',
    website: '', description: '', currency: 'USD',
    fiscalMonth: 'January', teamSize: '1–5',
    workspaceId: 'ws_abc123def456', createdAt: '2025-01-15',
  })

  // ── notification state ─────────────────────────────────────────────────────
  const [notifInApp, setNotifInApp] = useState({ approvals: true, agentTasks: true, campaigns: true, errors: true, newLeads: false, weeklySummary: true })
  const [notifEmail, setNotifEmail] = useState({ approvals: true, agentTasks: false, campaigns: true, errors: true, newLeads: false, weeklySummary: true })
  const [notifEmail2, setNotifEmail2] = useState('')
  const [notifFrequency, setNotifFrequency] = useState<'realtime' | 'hourly' | 'daily' | 'off'>('realtime')
  const [dndFrom, setDndFrom] = useState('22:00')
  const [dndTo, setDndTo] = useState('08:00')
  const [dndEnabled, setDndEnabled] = useState(false)

  // ── security state ─────────────────────────────────────────────────────────
  // Sprint 7C: hardcoded demo arrays purged. Sessions + login history now
  // come from /api/account/sessions and /api/account/login-history,
  // populated by the login route's audit writes. The previous version
  // showed fake "MacBook Pro · Mumbai · 2 mins ago" rows on every
  // workspace, regardless of actual logins.
  const [twoFAEnabled, setTwoFAEnabled] = useState(false)
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [loginHistory, setLoginHistory] = useState<LoginRecord[] | null>(null)
  const [sessionActing, setSessionActing] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  // ── appearance state ───────────────────────────────────────────────────────
  const [appearance, setAppearance] = useState({
    theme: 'dark', accentColor: 'Indigo', sidebar: 'expanded',
    density: 'comfortable', fontSize: 'medium', animations: true, language: 'English',
  })

  // ── model settings ─────────────────────────────────────────────────────────
  const defaultModelSettings: ModelSettings = {
    defaultModel: 'claude-sonnet-4-6',
    braveSearchApiKey: '', hubspotAccessToken: '', ga4PropertyId: '', ga4AccessToken: '',
    metaWebhookVerifyToken: '', resendApiKey: '', firecrawlApiKey: '',
    unsplashAccessKey: '', pexelsApiKey: '',
    groqApiKey: '', openaiApiKey: '', anthropicApiKey: '',
    openaiModel: 'gpt-4o', claudeModel: 'claude-sonnet-4-6',
    elevenLabsApiKey: '', elevenLabsVoiceId: '', elevenLabsVoiceModel: 'eleven_multilingual_v2',
    stabilityApiKey: '', replicateApiToken: '',
    geminiApiKey: '', geminiModel: 'gemini-1.5-pro',
    klingAccessKey: '', klingSecretKey: '', runwayApiKey: '', lumaApiKey: '', pikaApiKey: '',
    heygenApiKey: '', vapiApiKey: '',
    slackBotToken: '', slackChannelId: '',
    telegramBotToken: '', telegramChatId: '',
    wpSiteUrl: '', wpUsername: '', wpAppPassword: '',
    ghostUrl: '', ghostAdminKey: '', bufferAccessToken: '',
    calcomApiKey: '', tallyApiKey: '',
    n8nBaseUrl: '', n8nApiKey: '',
    searchConsoleSiteUrl: '', searchConsoleAccessToken: '',
    cloudinaryCloudName: '', cloudinaryApiKey: '', cloudinaryApiSecret: '',
    apolloApiKey: '', hunterApiKey: '',
    mailchimpApiKey: '', mailchimpServer: '', brevoApiKey: '', brevoFromEmail: '',
    deepgramApiKey: '',
    twitterAccessToken: '', twitterBearerToken: '',
    linkedinAccessToken: '', linkedinAuthorUrn: '',
    youtubeApiKey: '', youtubeAccessToken: '',
    metaAccessToken: '', metaAdAccountId: '',
    googleAdsDeveloperToken: '', googleAdsCustomerId: '', googleAdsAccessToken: '',
    linkedinAdsAccessToken: '', linkedinAdsAccountId: '',
    stripeSecretKey: '', stripePublishableKey: '',
    razorpayKeyId: '', razorpayKeySecret: '',
  }
  const [modelSettings, setModelSettings] = useState<ModelSettings>(defaultModelSettings)
  const [testResults, setTestResults] = useState<Record<string, string>>({})
  const [sharedKeyFallback, setSharedKeyFallback] = useState(true)
  const [keyRotationReminder, setKeyRotationReminder] = useState(true)

  // ── AI model routing ───────────────────────────────────────────────────────
  const [modelRouting, setModelRouting] = useState([
    { task: 'Content Generation', model: 'Claude 3.5 Sonnet', provider: 'Anthropic', cost: '$0.003/req' },
    { task: 'Strategy', model: 'Claude 3.5 Sonnet', provider: 'Anthropic', cost: '$0.008/req' },
    { task: 'Image Generation', model: 'DALL-E 3', provider: 'OpenAI', cost: '$0.040/img' },
    { task: 'Video Generation', model: 'Kling 2.0', provider: 'Kling', cost: '$0.45/vid' },
    { task: 'Voice Synthesis', model: 'ElevenLabs v3', provider: 'ElevenLabs', cost: '$0.002/char' },
    { task: 'Email Campaigns', model: 'Claude 3.5 Haiku', provider: 'Anthropic', cost: '$0.001/req' },
    { task: 'Research', model: 'Claude 3.5 Sonnet', provider: 'Anthropic', cost: '$0.005/req' },
  ])
  const [smartRouting, setSmartRouting] = useState(false)
  const [costCap, setCostCap] = useState('100')
  const [qualitySpeed, setQualitySpeed] = useState(70)

  // ── danger zone state ──────────────────────────────────────────────────────
  const [dangerInput, setDangerInput] = useState<Record<string, string>>({})

  // ── modal state ────────────────────────────────────────────────────────────
  const [modal, setModal] = useState<string | null>(null)
  const [modalData, setModalData] = useState<Record<string, string>>({})

  // ── test notification ──────────────────────────────────────────────────────
  const [notifyTestResult, setNotifyTestResult] = useState<Record<string, string>>({})

  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    fetch(`/api/workspaces?id=${wid}`)
      .then(r => r.json())
      .then(d => {
        if (d) {
          let parsedChannels: string[] = []
          if (Array.isArray(d.channels)) parsedChannels = d.channels
          else if (typeof d.channels === 'string' && d.channels) {
            try { const c = JSON.parse(d.channels); parsedChannels = Array.isArray(c) ? c : [] }
            catch { parsedChannels = d.channels.split(',').map((s: string) => s.trim()).filter(Boolean) }
          }
          setForm({
            businessName: d.business_name || d.name || '',
            industry: d.industry || '', website: d.website || '', tagline: d.tagline || '',
            offer: d.offer || '', uniqueValue: d.unique_value || '',
            targetAudience: d.target_audience || '', tone: d.tone || '',
            competitors: d.competitors || '', channels: parsedChannels,
            goals: d.goals || '', monthlyBudget: d.monthly_budget || '',
            prohibitedClaims: d.prohibited_claims || '', approvalEmail: d.approval_email || '',
          })
          setWorkspace(prev => ({ ...prev, name: d.business_name || d.name || '', industry: d.industry || '', website: d.website || '' }))
          if (d.model_settings) {
            try {
              const ms = typeof d.model_settings === 'string' ? JSON.parse(d.model_settings) : d.model_settings
              if (ms && typeof ms === 'object') setModelSettings(prev => ({ ...prev, ...ms }))
            } catch { /* ignore */ }
          }
        }
      })
      .finally(() => setFetching(false))
    const email = localStorage.getItem('userEmail') || ''
    const name = localStorage.getItem('userName') || ''
    setProfile(prev => ({ ...prev, fullName: name, email }))
  }, [router])

  // Sprint 7C: load Security tab data when it becomes active. Sessions
  // and login history come from the audit tables — login_events &
  // user_sessions — populated whenever the user logs in.
  const loadSessions = useCallback(async () => {
    try {
      const r = await fetch('/api/account/sessions')
      if (!r.ok) { setSessions([]); return }
      const j = await r.json() as { sessions?: Session[] }
      setSessions(j.sessions || [])
    } catch { setSessions([]) }
  }, [])
  const loadLoginHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/account/login-history')
      if (!r.ok) { setLoginHistory([]); return }
      const j = await r.json() as { events?: LoginRecord[] }
      setLoginHistory(j.events || [])
    } catch { setLoginHistory([]) }
  }, [])

  useEffect(() => {
    if (activeSection === 'security') {
      void loadSessions()
      void loadLoginHistory()
    }
  }, [activeSection, loadSessions, loadLoginHistory])

  async function revokeSession(id: string) {
    setSessionActing(id)
    try {
      await fetch(`/api/account/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      await loadSessions()
    } finally { setSessionActing(null) }
  }
  async function revokeAllOtherSessions() {
    setSessionActing('all')
    try {
      await fetch('/api/account/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke-others' }),
      })
      await loadSessions()
    } finally { setSessionActing(null) }
  }

  // Sprint 7C: real GDPR-style export — was previously alert('demo').
  async function exportData() {
    setExportError(null)
    try {
      const workspaceId = localStorage.getItem('workspaceId')
      const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
      const r = await fetch(`/api/account/export${qs}`)
      if (!r.ok) {
        const j = await r.json().catch(() => ({})) as { error?: string }
        setExportError(j.error || `Export failed (${r.status})`)
        return
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ooumph-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    }
  }

  const markUnsaved = (sec: SectionKey) => setUnsaved(prev => new Set(prev).add(sec))

  const save = async (section?: SectionKey) => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/workspaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...form, modelSettings }),
      })
      const data = await res.json()
      if (data.ok) {
        localStorage.setItem('businessName', form.businessName)
        localStorage.setItem('userName', profile.fullName)
        localStorage.setItem('userEmail', profile.email)
        setSaved(true)
        if (section) setUnsaved(prev => { const s = new Set(prev); s.delete(section); return s })
        setTimeout(() => setSaved(false), 3000)
      } else setError(data.error || 'Save failed')
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  const testConnection = async (provider: string) => {
    // Map UI provider slug → BYOK provider name + ModelSettings field
    const PROVIDER_MAP: Record<string, { byok: string; field: keyof ModelSettings }> = {
      openai:     { byok: 'openai',     field: 'openaiApiKey' },
      anthropic:  { byok: 'anthropic',  field: 'anthropicApiKey' },
      elevenLabs: { byok: 'elevenlabs', field: 'elevenLabsApiKey' },
      stability:  { byok: 'stability',  field: 'stabilityApiKey' },
      replicate:  { byok: 'replicate',  field: 'replicateApiToken' },
      gemini:     { byok: 'gemini',     field: 'geminiApiKey' },
      kling:      { byok: 'kling',      field: 'klingAccessKey' },
      runway:     { byok: 'runway',     field: 'runwayApiKey' },
    }
    const map = PROVIDER_MAP[provider]
    if (!map) {
      setTestResults(prev => ({ ...prev, [provider]: '⚠ Unknown provider' }))
      return
    }
    const ms = modelSettings as unknown as Record<string, string>
    const key = ms[map.field as string] || ''
    if (!key) {
      setTestResults(prev => ({ ...prev, [provider]: '⚠ No API key set' }))
      setTimeout(() => setTestResults(prev => { const s = { ...prev }; delete s[provider]; return s }), 4000)
      return
    }
    setTestResults(prev => ({ ...prev, [provider]: 'Testing…' }))
    try {
      const workspaceId = localStorage.getItem('workspaceId') || ''
      const res = await fetch('/api/workspace-secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, provider: map.byok, action: 'test', key }),
      })
      const data = await res.json()
      if (data?.ok) {
        // Also persist to encrypted store on a successful test
        try {
          await fetch('/api/workspace-secrets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId, provider: map.byok, key }),
          })
        } catch { /* save failure is non-blocking */ }
        setTestResults(prev => ({ ...prev, [provider]: `✅ ${data.message || 'Connected'}` }))
      } else {
        setTestResults(prev => ({ ...prev, [provider]: `❌ ${data?.message || data?.error || 'Connection failed'}` }))
      }
    } catch (err) {
      setTestResults(prev => ({ ...prev, [provider]: `❌ ${err instanceof Error ? err.message : 'Network error'}` }))
    }
    setTimeout(() => setTestResults(prev => { const s = { ...prev }; delete s[provider]; return s }), 8000)
  }

  const testNotification = async (service: 'slack' | 'telegram') => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    setNotifyTestResult(prev => ({ ...prev, [service]: 'Testing...' }))
    await save()
    try {
      const res = await fetch(`/api/agents/notify/${service}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, type: 'test' }),
      })
      const data = await res.json()
      setNotifyTestResult(prev => ({ ...prev, [service]: (data.sent || data.ok) ? '✅ Connected!' : `❌ ${data.error || 'Failed'}` }))
    } catch (e) {
      setNotifyTestResult(prev => ({ ...prev, [service]: `❌ ${String(e)}` }))
    }
    setTimeout(() => setNotifyTestResult(prev => { const s = { ...prev }; delete s[service]; return s }), 5000)
  }

  const updateMs = (field: keyof ModelSettings, value: string) => {
    setModelSettings(prev => ({ ...prev, [field]: value }))
    markUnsaved('api-keys')
  }

  if (fetching) return (
    <div className="p-8">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex items-center gap-4">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Loading settings...</p>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-screen">
      {/* ── Left Sidebar ── */}
      <aside className="w-64 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col py-6 px-3 gap-1 sticky top-0 h-screen overflow-y-auto">
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider px-3 mb-2">Settings</p>
        {NAV_ITEMS.map(item => (
          item.link ? (
            <a key={item.key} href={item.link}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
              <span>{item.icon}</span>
              <span>{item.label}</span>
              <span className="ml-auto text-gray-600 text-xs">↗</span>
            </a>
          ) : (
            <button key={item.key} onClick={() => setActiveSection(item.key)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left w-full ${activeSection === item.key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'} ${item.key === 'danger' ? 'text-red-400 hover:text-red-300' : ''}`}>
              <span>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {unsaved.has(item.key) && <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" title="Unsaved changes" />}
            </button>
          )
        ))}
      </aside>

      {/* ── Right Content ── */}
      <main className="flex-1 p-8 overflow-y-auto max-w-3xl">
        {error && <div className="mb-6 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>}
        {saved && <div className="mb-6 p-4 rounded-lg bg-green-950 border border-green-800 text-green-300 text-sm">Changes saved successfully.</div>}

        {/* ════════════════ PROFILE ════════════════ */}
        {activeSection === 'profile' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">👤 Profile</h1>
              <p className="text-gray-400 text-sm mt-1">Manage your personal information and preferences.</p>
            </div>
            <Card title="Personal Information">
              {/* Avatar */}
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-full bg-indigo-700 flex items-center justify-center text-2xl font-bold text-white shrink-0 border-2 border-indigo-500">
                  {profile.avatar ? <img src={profile.avatar} className="w-full h-full rounded-full object-cover" alt="avatar" /> : profile.fullName.slice(0, 2).toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-white text-sm font-medium mb-1">Profile Photo</p>
                  <p className="text-gray-500 text-xs mb-2">Drag &amp; drop an image or click to upload. Max 2MB.</p>
                  <label className={btnSm + ' cursor-pointer'}>
                    Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const f = e.target.files?.[0]; if (!f) return
                      const r = new FileReader(); r.onload = ev => setProfile(p => ({ ...p, avatar: ev.target?.result as string })); r.readAsDataURL(f)
                    }} />
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Full Name"><input className={inp} value={profile.fullName} onChange={e => { setProfile(p => ({ ...p, fullName: e.target.value })); markUnsaved('profile') }} /></Field>
                <Field label="Job Title"><input className={inp} value={profile.jobTitle} onChange={e => { setProfile(p => ({ ...p, jobTitle: e.target.value })); markUnsaved('profile') }} placeholder="e.g. Marketing Manager" /></Field>
              </div>
              <Field label="Email Address">
                <div className="flex gap-2">
                  <input className={inp} value={profile.email} readOnly />
                  <button className={btnSm} onClick={() => setModal('changeEmail')}>Change Email</button>
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone Number"><input className={inp} value={profile.phone} onChange={e => { setProfile(p => ({ ...p, phone: e.target.value })); markUnsaved('profile') }} placeholder="+91 98765 43210" /></Field>
                <Field label="Timezone">
                  <select className={inp} value={profile.timezone} onChange={e => { setProfile(p => ({ ...p, timezone: e.target.value })); markUnsaved('profile') }}>
                    {TIMEZONES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Language">
                <select className={inp} value={profile.language} onChange={e => { setProfile(p => ({ ...p, language: e.target.value })); markUnsaved('profile') }}>
                  {['English', 'Hindi', 'Spanish', 'French', 'German', 'Portuguese', 'Japanese', 'Chinese'].map(l => <option key={l}>{l}</option>)}
                </select>
              </Field>
              <button onClick={() => save('profile')} disabled={saving} className={btn + ' disabled:opacity-40'}>{saving ? 'Saving…' : 'Save Profile'}</button>
            </Card>
          </div>
        )}

        {/* ════════════════ WORKSPACE ════════════════ */}
        {activeSection === 'workspace' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">🏢 Workspace</h1>
              <p className="text-gray-400 text-sm mt-1">Configure your business workspace details.</p>
            </div>
            <Card title="Workspace Details">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl shrink-0">🏢</div>
                <div>
                  <p className="text-white text-sm font-medium mb-1">Workspace Logo</p>
                  <p className="text-gray-500 text-xs mb-2">PNG or SVG, max 1MB</p>
                  <label className={btnSm + ' cursor-pointer'}>Upload Logo<input type="file" accept="image/*" className="hidden" /></label>
                </div>
              </div>
              <Field label="Workspace Name"><input className={inp} value={workspace.name} onChange={e => { setWorkspace(w => ({ ...w, name: e.target.value })); setForm(f => ({ ...f, businessName: e.target.value })); markUnsaved('workspace') }} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Industry">
                  <select className={inp} value={workspace.industry} onChange={e => { setWorkspace(w => ({ ...w, industry: e.target.value })); setForm(f => ({ ...f, industry: e.target.value })); markUnsaved('workspace') }}>
                    <option value="">Select industry</option>
                    {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                  </select>
                </Field>
                <Field label="Business Type">
                  <select className={inp} value={workspace.businessType} onChange={e => { setWorkspace(w => ({ ...w, businessType: e.target.value })); markUnsaved('workspace') }}>
                    {['B2B', 'B2C', 'Agency', 'E-commerce'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Website URL"><input className={inp} value={workspace.website} placeholder="https://" onChange={e => { setWorkspace(w => ({ ...w, website: e.target.value })); setForm(f => ({ ...f, website: e.target.value })); markUnsaved('workspace') }} /></Field>
              <Field label="Business Description"><textarea className={ta} rows={3} value={workspace.description} onChange={e => { setWorkspace(w => ({ ...w, description: e.target.value })); markUnsaved('workspace') }} placeholder="What does your business do?" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Default Currency">
                  <select className={inp} value={workspace.currency} onChange={e => { setWorkspace(w => ({ ...w, currency: e.target.value })); markUnsaved('workspace') }}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Fiscal Year Start">
                  <select className={inp} value={workspace.fiscalMonth} onChange={e => { setWorkspace(w => ({ ...w, fiscalMonth: e.target.value })); markUnsaved('workspace') }}>
                    {MONTHS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Team Size">
                <select className={inp} value={workspace.teamSize} onChange={e => { setWorkspace(w => ({ ...w, teamSize: e.target.value })); markUnsaved('workspace') }}>
                  {['1–5', '6–15', '16–50', '51–200', '200+'].map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <button onClick={() => save('workspace')} disabled={saving} className={btn + ' disabled:opacity-40'}>{saving ? 'Saving…' : 'Save Workspace'}</button>
            </Card>
            <Card title="Workspace Info">
              <div className="flex items-center justify-between py-1">
                <span className="text-gray-400 text-sm">Workspace ID</span>
                <div className="flex items-center gap-2">
                  <code className="text-white text-xs bg-gray-800 px-3 py-1.5 rounded-lg">{workspace.workspaceId}</code>
                  <button className={btnSm} onClick={() => navigator.clipboard.writeText(workspace.workspaceId)}>📋 Copy</button>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-t border-gray-800">
                <span className="text-gray-400 text-sm">Created</span>
                <span className="text-gray-300 text-sm">{workspace.createdAt}</span>
              </div>
            </Card>
          </div>
        )}

        {/* ════════════════ API KEYS (BYOK) — Sprint 8F: by usage ════════════════ */}
        {activeSection === 'api-keys' && (
          <div className="space-y-8">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold text-white">🔑 API Keys & Connections</h1>
              <p className="text-gray-400 text-sm mt-1 max-w-2xl leading-relaxed">
                Add the keys for the providers whose features you want to use. We&apos;ve grouped them by what they unlock — not by vendor name — so you only need to add keys for the parts you actually use.
              </p>
            </div>

            {/* Trust + safety banner */}
            <div className="rounded-xl border border-amber-900/40 bg-amber-950/30 p-4 text-amber-300 text-xs space-y-2">
              <p><strong>How we store your keys:</strong> Keys tagged <span className="bg-indigo-950 border border-indigo-900 px-1.5 py-0.5 rounded text-indigo-300">Live test</span> are AES-256-GCM encrypted at rest once you hit Test Connection. Keys tagged <span className="bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded text-gray-300">Paste only</span> are saved as plaintext JSON on your workspace row — equivalent encryption is on our roadmap.</p>
              <p>Ooumph staff will never ask you for any API key. Never paste a production key into a test environment.</p>
            </div>

            {/* Sprint 11C: prominent Quick Start hero. The previous version
                was a small 3-card row that non-technical users skimmed
                past. This treatment makes the 3-key setup feel like
                a guided onboarding step: numbered actions, time estimate
                per provider, direct "Get key ↗" link, progress meter, and
                a celebratory CTA once all 3 are in. */}
            {(() => {
              const ess = [
                {
                  key: 'anthropicApiKey',
                  label: 'Anthropic (Claude)',
                  why: 'Powers every AI agent — CMO chat, content drafts, strategy, brand voice scoring',
                  uc: 'ai-text',
                  signupUrl: 'https://console.anthropic.com/settings/keys',
                  timeMin: 2,
                },
                {
                  key: 'openaiApiKey',
                  label: 'OpenAI',
                  why: 'Unlocks DALL-E image generation + GPT-4o as a backup for Claude',
                  uc: 'image-gen',
                  signupUrl: 'https://platform.openai.com/api-keys',
                  timeMin: 2,
                },
                {
                  key: 'resendApiKey',
                  label: 'Resend',
                  why: 'Sends approval confirmations, reminders, and lead nurture emails',
                  uc: 'email',
                  signupUrl: 'https://resend.com/api-keys',
                  timeMin: 1,
                },
              ]
              const filledCount = ess.filter(e => !!(modelSettings as unknown as Record<string, string>)[e.key]?.trim()).length
              const allDone = filledCount === ess.length
              return (
                <div className={`rounded-2xl border p-6 ${allDone ? 'border-green-700 bg-gradient-to-br from-green-950/40 to-emerald-950/30' : 'border-indigo-800 bg-gradient-to-br from-indigo-950/40 to-purple-950/30'}`}>
                  <div className="flex items-start justify-between gap-4 mb-1">
                    <div>
                      <p className="text-white font-bold text-lg">
                        {allDone ? '🎉 You\'re ready to use Ooumph' : '🚀 Unlock the demo in 3 keys'}
                      </p>
                      <p className={`text-sm mt-1 ${allDone ? 'text-green-300' : 'text-indigo-300'}`}>
                        {allDone
                          ? 'All essential providers are connected. Open the CMO chat and try a real prompt.'
                          : 'Paste these three API keys and the AI agents start working end-to-end. ~5 minutes total.'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-3xl font-bold text-white">{filledCount}<span className="text-base text-gray-500">/3</span></p>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mt-0.5">complete</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-800 rounded-full h-2 my-4 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-indigo-500'}`}
                      style={{ width: `${(filledCount / ess.length) * 100}%` }}
                    />
                  </div>

                  {/* Step cards */}
                  <div className="space-y-2.5">
                    {ess.map((e, idx) => {
                      const filled = !!(modelSettings as unknown as Record<string, string>)[e.key]?.trim()
                      return (
                        <div
                          key={e.key}
                          className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                            filled
                              ? 'border-green-800/60 bg-green-950/30'
                              : 'border-gray-700 bg-gray-900/60 hover:border-indigo-700'
                          }`}
                        >
                          <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            filled ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'
                          }`}>
                            {filled ? '✓' : idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                              <p className="text-white text-sm font-semibold">{e.label}</p>
                              <span className="text-[11px] text-gray-500">~{e.timeMin} min</span>
                            </div>
                            <p className="text-gray-400 text-xs mt-0.5">{e.why}</p>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <a
                              href={`#uc-${e.uc}`}
                              className={`text-xs font-medium ${filled ? 'text-green-400' : 'text-indigo-300 hover:text-indigo-200'}`}
                            >
                              {filled ? 'Connected' : 'Paste key ↓'}
                            </a>
                            {!filled && (
                              <a
                                href={e.signupUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-gray-500 hover:text-gray-300"
                              >
                                Get key ↗
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {allDone && (
                    <a
                      href="/dashboard"
                      className="mt-5 inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      Try the CMO chat now →
                    </a>
                  )}

                  <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
                    Beyond these 3, you can connect OAuth platforms (LinkedIn / Twitter / WordPress) for publishing,
                    and dozens of other providers grouped by use case below. The 3 above are the minimum to unlock
                    the core AI agency demo.
                  </p>
                </div>
              )
            })()}

            {/* Jump-to navigation */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Jump to a section</p>
              <div className="flex flex-wrap gap-1.5">
                {KEY_USE_CASES.map(uc => {
                  const total = uc.providers.length
                  const filled = uc.providers.filter(p => {
                    const f = p.fields[0].field as string
                    return !!(modelSettings as unknown as Record<string, string>)[f]?.trim()
                  }).length
                  return (
                    <a key={uc.id} href={`#uc-${uc.id}`} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:border-indigo-600 hover:text-white transition-colors">
                      <span className="mr-1">{uc.emoji}</span>
                      {uc.title.replace(/^Generate /, '').replace(/^Run /, '')}
                      <span className={`ml-1.5 text-[10px] ${filled === 0 ? 'text-gray-500' : filled === total ? 'text-green-400' : 'text-yellow-400'}`}>
                        {filled}/{total}
                      </span>
                    </a>
                  )
                })}
              </div>
            </div>

            {/* Use case sections */}
            {KEY_USE_CASES.map(uc => {
              const filledCount = uc.providers.filter(p => {
                const f = p.fields[0].field as string
                return !!(modelSettings as unknown as Record<string, string>)[f]?.trim()
              }).length
              return (
                <section key={uc.id} id={`uc-${uc.id}`} className="scroll-mt-6 space-y-4">
                  {/* Section header */}
                  <div className="border-b border-gray-800 pb-3">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h2 className="text-white font-semibold text-lg">
                        <span className="mr-1.5">{uc.emoji}</span>
                        {uc.title}
                      </h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${filledCount === 0 ? 'bg-gray-800 text-gray-500' : filledCount === uc.providers.length ? 'bg-green-900/60 text-green-300' : 'bg-yellow-900/30 text-yellow-300'}`}>
                        {filledCount} of {uc.providers.length} filled in
                      </span>
                      {uc.pickOne && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-950/60 border border-indigo-900 text-indigo-300">
                          Pick at least one
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm mt-2 max-w-3xl leading-relaxed">{uc.why}</p>
                    <div className="mt-2 flex items-start gap-2 text-xs">
                      <span className="text-gray-500 mt-0.5">Unlocks:</span>
                      <span className="text-gray-400 flex-1">{uc.unlocks.join(' · ')}</span>
                    </div>
                    {uc.recommendation && (
                      <p className="text-indigo-300 text-xs mt-2">💡 {uc.recommendation}</p>
                    )}
                  </div>

                  {/* Provider cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {uc.providers.map(p => (
                      <ProviderCard
                        key={p.id}
                        provider={p}
                        ms={modelSettings}
                        update={updateMs}
                        onTest={testConnection}
                        testResult={p.testProvider ? testResults[p.testProvider] : undefined}
                        onNotifyTest={testNotification}
                        notifyResult={p.notifyTest ? notifyTestResult[p.notifyTest] : undefined}
                      />
                    ))}
                  </div>
                </section>
              )
            })}

            {/* Save (for paste-only fields — Live-test fields auto-save on success) */}
            <div className="sticky bottom-4 z-10 rounded-xl border border-gray-700 bg-gray-900/95 backdrop-blur p-4 flex items-center justify-between gap-4">
              <div className="text-xs text-gray-400">
                Live-test providers save automatically when Test Connection succeeds. Paste-only providers need a manual save.
              </div>
              <button onClick={() => save('api-keys')} disabled={saving} className={btn + ' disabled:opacity-40 whitespace-nowrap'}>
                {saving ? 'Saving…' : 'Save paste-only keys'}
              </button>
            </div>

            {/* Fallback / governance toggles — moved to bottom, less prominent */}
            <Card title="Key management">
              <Toggle on={sharedKeyFallback} onToggle={() => setSharedKeyFallback(v => !v)} label="Use Ooumph shared keys when your key hits rate limits" />
              <Toggle on={keyRotationReminder} onToggle={() => setKeyRotationReminder(v => !v)} label="Remind me to rotate keys every 90 days" />
            </Card>
          </div>
        )}

        {/* ════════════════ AI MODELS ════════════════ */}
        {activeSection === 'ai-models' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">🤖 AI Models</h1>
              <p className="text-gray-400 text-sm mt-1">Configure model routing, cost caps, and quality preferences.</p>
            </div>
            <Card title="Default Model">
              <p className="text-gray-400 text-sm mb-4">The primary Claude model powering all agents.</p>
              <div className="space-y-2">
                {SUPPORTED_MODELS.map(m => (
                  <label key={m.id} className={`flex items-start gap-4 p-3 rounded-xl border cursor-pointer transition-colors ${modelSettings.defaultModel === m.id ? 'bg-indigo-950 border-indigo-700' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                    <input type="radio" name="model" value={m.id} checked={modelSettings.defaultModel === m.id} onChange={() => { setModelSettings(prev => ({ ...prev, defaultModel: m.id })); markUnsaved('ai-models') }} className="mt-0.5 accent-indigo-500" />
                    <div><p className="text-white font-medium text-sm">{m.name}</p><p className="text-gray-400 text-xs mt-0.5">{m.description}</p></div>
                  </label>
                ))}
              </div>
            </Card>
            <Card title="Task → Model Routing">
              <p className="text-gray-500 text-xs mb-4">Configure which model is used per task type. Cost estimates update based on average task size.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-400 font-medium pb-2">Task</th>
                      <th className="text-left text-gray-400 font-medium pb-2">Model</th>
                      <th className="text-left text-gray-400 font-medium pb-2">Provider</th>
                      <th className="text-right text-gray-400 font-medium pb-2">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelRouting.map((row, i) => (
                      <tr key={i} className="border-b border-gray-800/50">
                        <td className="py-2.5 text-gray-300 pr-3">{row.task}</td>
                        <td className="py-2.5 pr-3">
                          <select className={inpSm} value={row.model} onChange={e => {
                            const next = [...modelRouting]; next[i] = { ...next[i], model: e.target.value }; setModelRouting(next); markUnsaved('ai-models')
                          }}>
                            {['Claude 3.5 Sonnet', 'Claude 3.5 Haiku', 'Claude 3 Opus', 'GPT-4o', 'GPT-4o mini', 'Gemini 1.5 Pro', 'DALL-E 3', 'Kling 2.0', 'ElevenLabs v3'].map(m => <option key={m}>{m}</option>)}
                          </select>
                        </td>
                        <td className="py-2.5 text-gray-400 pr-3">{row.provider}</td>
                        <td className="py-2.5 text-right text-green-400 font-mono text-xs">{row.cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Smart Routing & Cost Controls">
              <Toggle on={smartRouting} onToggle={() => { setSmartRouting(v => !v); markUnsaved('ai-models') }} label="Automatically use cheaper models for simple tasks" />
              <Field label="Monthly Cost Cap (USD)" hint="AI generation pauses if this threshold is reached">
                <div className="flex gap-2 items-center">
                  <span className="text-gray-400 text-sm">$</span>
                  <input className={inp} type="number" min="0" value={costCap} onChange={e => { setCostCap(e.target.value); markUnsaved('ai-models') }} placeholder="100" />
                </div>
              </Field>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-300">Quality vs Speed</span>
                  <span className="text-gray-500">{qualitySpeed}% Quality</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">⚡ Speed</span>
                  <input type="range" min="0" max="100" value={qualitySpeed} onChange={e => { setQualitySpeed(Number(e.target.value)); markUnsaved('ai-models') }}
                    className="flex-1 accent-indigo-500" />
                  <span className="text-xs text-gray-500">Quality 🎯</span>
                </div>
              </div>
            </Card>
            <button onClick={() => save('ai-models')} disabled={saving} className={btn + ' disabled:opacity-40'}>{saving ? 'Saving…' : 'Save Model Settings'}</button>
          </div>
        )}

        {/* ════════════════ NOTIFICATIONS ════════════════ */}
        {activeSection === 'notifications' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">🔔 Notifications</h1>
              <p className="text-gray-400 text-sm mt-1">Choose what you get notified about and how.</p>
            </div>
            <Card title="In-App Notifications">
              {([['approvals', 'Approval requests'], ['agentTasks', 'Agent task completions'], ['campaigns', 'Campaign published'], ['errors', 'Error alerts'], ['newLeads', 'New leads'], ['weeklySummary', 'Weekly summary']] as const).map(([k, label]) => (
                <Toggle key={k} on={notifInApp[k]} onToggle={() => setNotifInApp(p => ({ ...p, [k]: !p[k] }))} label={label} />
              ))}
            </Card>
            <Card title="Email Notifications">
              <Field label="Notification Email">
                <input className={inp} type="email" value={notifEmail2} onChange={e => setNotifEmail2(e.target.value)} placeholder="you@example.com" />
              </Field>
              {([['approvals', 'Approval requests'], ['agentTasks', 'Agent task completions'], ['campaigns', 'Campaign published'], ['errors', 'Error alerts'], ['newLeads', 'New leads'], ['weeklySummary', 'Weekly summary']] as const).map(([k, label]) => (
                <Toggle key={k} on={notifEmail[k]} onToggle={() => setNotifEmail(p => ({ ...p, [k]: !p[k] }))} label={label} />
              ))}
            </Card>
            <Card title="Frequency & Schedule">
              <Field label="Notification Frequency">
                <div className="flex gap-2 flex-wrap">
                  {([['realtime', 'Real-time'], ['hourly', 'Batched (hourly)'], ['daily', 'Daily digest'], ['off', 'Off']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setNotifFrequency(v)}
                      className={`px-4 py-2 rounded-lg text-sm border transition-colors ${notifFrequency === v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="space-y-2">
                <Toggle on={dndEnabled} onToggle={() => setDndEnabled(v => !v)} label="Enable Do Not Disturb" />
                {dndEnabled && (
                  <div className="flex items-center gap-3 pl-13">
                    <input type="time" className={inpSm} value={dndFrom} onChange={e => setDndFrom(e.target.value)} />
                    <span className="text-gray-500 text-sm">to</span>
                    <input type="time" className={inpSm} value={dndTo} onChange={e => setDndTo(e.target.value)} />
                  </div>
                )}
              </div>
            </Card>
            <button onClick={() => save('notifications')} disabled={saving} className={btn + ' disabled:opacity-40'}>{saving ? 'Saving…' : 'Save Notification Settings'}</button>
          </div>
        )}

        {/* ════════════════ SECURITY ════════════════ */}
        {activeSection === 'security' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">🔒 Security</h1>
              <p className="text-gray-400 text-sm mt-1">Manage authentication, sessions, and access control.</p>
            </div>

            {/* Active sessions — Sprint 7C: real data from /api/account/sessions.
                Previous version showed two fake "MacBook Pro · Mumbai" rows
                on every workspace. Revoke buttons now hit the real endpoint;
                the "current" badge marks whichever session matches this
                browser's cookie. */}
            <Card
              title="Active Sessions"
              subtitle="Every device currently signed in to your account. Revoke any session you don't recognise."
            >
              {sessions === null && (
                <p className="text-gray-500 text-sm">Loading sessions…</p>
              )}
              {sessions && sessions.length === 0 && (
                <p className="text-gray-500 text-sm">No active sessions found. (You must be the current session if you're seeing this — try refreshing.)</p>
              )}
              {sessions && sessions.length > 0 && (
                <div className="space-y-3">
                  {sessions.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                      <div>
                        <p className="text-white text-sm font-medium">
                          {s.device}{s.browser ? ` — ${s.browser}` : ''}
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {s.ip} · last seen {new Date(s.lastSeenAt).toLocaleString()}
                        </p>
                      </div>
                      {s.current
                        ? <span className="px-2 py-0.5 bg-green-900 text-green-300 text-xs rounded">Current</span>
                        : (
                          <button
                            disabled={sessionActing === s.id}
                            onClick={() => revokeSession(s.id)}
                            className={btnDanger + ' text-xs py-1 disabled:opacity-40'}
                          >
                            {sessionActing === s.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        )}
                    </div>
                  ))}
                </div>
              )}
              {sessions && sessions.filter(s => !s.current).length > 0 && (
                <button
                  disabled={sessionActing === 'all'}
                  onClick={revokeAllOtherSessions}
                  className={btnDanger + ' disabled:opacity-40'}
                >
                  {sessionActing === 'all' ? 'Revoking…' : 'Revoke All Other Sessions'}
                </button>
              )}
              <p className="text-[11px] text-gray-600 mt-3 leading-relaxed">
                Note: revoking a session removes it from this list immediately. Full enforcement
                across every API route ships when the auth middleware is upgraded; for a
                hard sign-out everywhere right now, change your password to rotate the token secret.
              </p>
            </Card>

            {/* 2FA — kept as the existing client-side toggle. Real 2FA
                enrolment requires a TOTP secret store + verification flow
                that's out of scope for this sprint. The badge accurately
                reflects whatever the user toggled this session; the next
                refresh resets it to disabled. */}
            <Card title="Two-Factor Authentication">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">Authenticator App</p>
                  <p className="text-gray-500 text-xs mt-0.5">{twoFAEnabled ? '2FA is enabled on your account.' : '2FA is not enabled. Add an extra layer of security.'}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${twoFAEnabled ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-yellow-400'}`}>{twoFAEnabled ? '✅ Enabled' : '⚠ Disabled'}</span>
              </div>
              <button onClick={() => { setTwoFAEnabled(v => !v); setModal('2fa') }} className={twoFAEnabled ? btnDanger : btn}>{twoFAEnabled ? 'Disable 2FA' : 'Enable 2FA'}</button>
              {twoFAEnabled && (
                <div className="pt-2 border-t border-gray-800">
                  <p className="text-white text-sm font-medium mb-2">Backup Codes</p>
                  <button className={btnGhost} onClick={() => setModal('backupCodes')}>View Backup Codes</button>
                </div>
              )}
            </Card>

            {/* API Access Tokens — moved to the canonical Developer API
                surface. The previous hardcoded "CI/CD Pipeline" row was a
                fabricated demo. The /dashboard/developer-api page is wired
                to the real developer_tokens table with proper scopes,
                revocation, and last-used tracking. */}
            <Card
              title="API Access Tokens"
              subtitle="Manage your Ooumph API keys, scopes, and revocation"
            >
              <p className="text-gray-400 text-sm">
                Developer tokens are managed on the dedicated Developer API page,
                which is wired to the real <code className="text-gray-300">developer_tokens</code> table.
              </p>
              <a
                href="/dashboard/developer-api"
                className={btn + ' inline-block text-center no-underline'}
              >
                Open Developer API
              </a>
            </Card>

            {/* Login History — Sprint 7C: real data from /api/account/login-history,
                backed by the login_events table. Surfaces both successful
                logins and failed attempts so suspicious activity is
                visible. */}
            <Card
              title="Login History"
              subtitle="Last 20 successful and failed sign-in attempts on your account"
            >
              {loginHistory === null && (
                <p className="text-gray-500 text-sm">Loading history…</p>
              )}
              {loginHistory && loginHistory.length === 0 && (
                <p className="text-gray-500 text-sm">
                  No login events recorded yet. (This list will populate from your next sign-in onward.)
                </p>
              )}
              {loginHistory && loginHistory.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-left">
                        <th className="pb-2 text-gray-400 font-medium">Date</th>
                        <th className="pb-2 text-gray-400 font-medium">Device</th>
                        <th className="pb-2 text-gray-400 font-medium">IP</th>
                        <th className="pb-2 text-gray-400 font-medium text-right">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loginHistory.map(r => (
                        <tr key={r.id} className="border-b border-gray-800/50">
                          <td className="py-2 text-gray-300 pr-3 text-xs">{new Date(r.createdAt).toLocaleString()}</td>
                          <td className="py-2 text-gray-300 pr-3">{r.device}</td>
                          <td className="py-2 text-gray-400 pr-3 font-mono text-xs">{r.ip}</td>
                          <td className={`py-2 text-right text-xs font-medium ${r.success ? 'text-green-400' : 'text-red-400'}`}>
                            {r.success ? 'Success' : `Failed${r.failureReason ? ` (${r.failureReason})` : ''}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Password */}
            <Card title="Password">
              <p className="text-gray-400 text-sm">Last changed 30 days ago.</p>
              <button className={btnGhost} onClick={() => setModal('changePassword')}>Change Password</button>
            </Card>
          </div>
        )}

        {/* ════════════════ APPEARANCE ════════════════ */}
        {activeSection === 'appearance' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">🎨 Appearance</h1>
              <p className="text-gray-400 text-sm mt-1">Customise how the dashboard looks and feels.</p>
            </div>
            <Card title="Theme">
              {/* Sprint 5 fix: Light + System themes are not implemented —
                  the entire dashboard CSS uses dark-only Tailwind classes
                  (bg-gray-950, text-white, etc.) with no `light:` variants.
                  Previously clicking "Light" highlighted the button but
                  nothing visually changed, which violated the No Fake
                  Success rule. Disabled with a "Coming soon" badge until
                  a real CSS variable / theme-token system ships. */}
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => setAppearance(a => ({ ...a, theme: 'dark' }))}
                  className={`px-5 py-2.5 rounded-lg text-sm border transition-colors ${appearance.theme === 'dark' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600'}`}>
                  🌙 Dark
                </button>
                <button
                  disabled
                  title="Light mode is on the roadmap — the dashboard CSS needs theme-token refactoring first"
                  className="px-5 py-2.5 rounded-lg text-sm border bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed flex items-center gap-2">
                  ☀ Light
                  <span className="text-[10px] text-amber-400 bg-amber-900/20 border border-amber-800/40 px-1.5 py-0.5 rounded">Coming soon</span>
                </button>
                <button
                  disabled
                  title="System theme follows OS preference — requires Light mode first"
                  className="px-5 py-2.5 rounded-lg text-sm border bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed flex items-center gap-2">
                  💻 System
                  <span className="text-[10px] text-amber-400 bg-amber-900/20 border border-amber-800/40 px-1.5 py-0.5 rounded">Coming soon</span>
                </button>
              </div>
            </Card>
            <Card title="Accent Color">
              <div className="flex gap-3 flex-wrap">
                {ACCENT_COLORS.map(c => (
                  <button key={c.name} onClick={() => setAppearance(a => ({ ...a, accentColor: c.name }))} title={c.name}
                    className={`w-8 h-8 rounded-full ${c.cls} transition-all ${appearance.accentColor === c.name ? `ring-2 ring-offset-2 ring-offset-gray-900 ${c.ring} scale-110` : 'hover:scale-105'}`} />
                ))}
              </div>
            </Card>
            <Card title="Layout & Density">
              <Field label="Sidebar">
                <div className="flex gap-3">
                  {(['collapsed', 'expanded'] as const).map(v => (
                    <button key={v} onClick={() => setAppearance(a => ({ ...a, sidebar: v }))}
                      className={`px-4 py-2 rounded-lg text-sm border capitalize transition-colors ${appearance.sidebar === v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Content Density">
                <div className="flex gap-3">
                  {(['comfortable', 'compact', 'spacious'] as const).map(v => (
                    <button key={v} onClick={() => setAppearance(a => ({ ...a, density: v }))}
                      className={`px-4 py-2 rounded-lg text-sm border capitalize transition-colors ${appearance.density === v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Font Size">
                <div className="flex gap-3">
                  {(['small', 'medium', 'large'] as const).map(v => (
                    <button key={v} onClick={() => setAppearance(a => ({ ...a, fontSize: v }))}
                      className={`px-4 py-2 rounded-lg text-sm border capitalize transition-colors ${appearance.fontSize === v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </Field>
              <Toggle on={appearance.animations} onToggle={() => setAppearance(a => ({ ...a, animations: !a.animations }))} label="Show animations and transitions" />
            </Card>
            <button onClick={() => save('appearance')} disabled={saving} className={btn + ' disabled:opacity-40'}>{saving ? 'Saving…' : 'Save Appearance'}</button>
          </div>
        )}

        {/* ════════════════ USAGE & LIMITS ════════════════ */}
        {activeSection === 'usage' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">📊 Usage &amp; Limits</h1>
              <p className="text-gray-400 text-sm mt-1">Monitor your resource consumption and plan limits.</p>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-indigo-950 border border-indigo-800">
              <div>
                <p className="text-indigo-300 text-xs font-medium uppercase tracking-wider">Current Plan</p>
                <p className="text-white text-lg font-bold mt-0.5">Growth</p>
              </div>
              <button className={btn}>Upgrade Plan</button>
            </div>
            <Card title="Resource Usage — May 2026">
              <UsageBar label="AI Requests" used={4230} total={10000} unit="req" />
              <UsageBar label="Image Generations" used={847} total={2000} unit="img" />
              <UsageBar label="Video Generations" used={12} total={50} unit="vid" />
              <UsageBar label="Voice Minutes" used={34} total={120} unit="min" />
              <UsageBar label="Storage" used={4.2} total={10} unit="GB" />
              <UsageBar label="Team Members" used={3} total={5} unit="seats" />
              <UsageBar label="API Calls" used={12400} total={50000} unit="calls" />
            </Card>
            <Card title="Usage History — Last 6 Months">
              <div className="space-y-4">
                {[
                  { month: 'Dec 2025', req: 3100, img: 620 },
                  { month: 'Jan 2026', req: 4200, img: 780 },
                  { month: 'Feb 2026', req: 3800, img: 710 },
                  { month: 'Mar 2026', req: 5100, img: 890 },
                  { month: 'Apr 2026', req: 4900, img: 1020 },
                  { month: 'May 2026', req: 4230, img: 847 },
                ].map(row => (
                  <div key={row.month} className="flex items-center gap-4">
                    <span className="text-gray-400 text-xs w-20 shrink-0">{row.month}</span>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                        <div className="flex-1 bg-gray-800 rounded h-1.5"><div className="bg-indigo-500 h-1.5 rounded" style={{ width: `${(row.req / 10000) * 100}%` }} /></div>
                        <span className="text-gray-500 text-xs w-14 text-right">{row.req.toLocaleString()} req</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                        <div className="flex-1 bg-gray-800 rounded h-1.5"><div className="bg-purple-500 h-1.5 rounded" style={{ width: `${(row.img / 2000) * 100}%` }} /></div>
                        <span className="text-gray-500 text-xs w-14 text-right">{row.img} img</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ════════════════ DANGER ZONE ════════════════ */}
        {activeSection === 'danger' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-red-400">🗑 Danger Zone</h1>
              <p className="text-gray-400 text-sm mt-1">These actions are permanent and cannot be undone.</p>
            </div>
            <div className="bg-red-950/30 border border-red-900 rounded-xl p-6 space-y-6">

              {/* Delete All Content */}
              <div className="flex items-start justify-between gap-6 pb-5 border-b border-red-900/50">
                <div>
                  <p className="text-red-300 font-medium text-sm">Delete All Content</p>
                  <p className="text-gray-500 text-xs mt-1">Permanently removes all generated content, campaigns, and assets. Agents and settings are preserved.</p>
                </div>
                <button className={btnDanger + ' shrink-0'} onClick={() => setModal('deleteContent')}>Delete Content</button>
              </div>

              {/* Reset Workspace */}
              <div className="flex items-start justify-between gap-6 pb-5 border-b border-red-900/50">
                <div>
                  <p className="text-red-300 font-medium text-sm">Reset Workspace</p>
                  <p className="text-gray-500 text-xs mt-1">Clears all agents, content, strategies, and data. Cannot be reversed.</p>
                </div>
                <button className={btnDanger + ' shrink-0'} onClick={() => setModal('resetWorkspace')}>Reset Workspace</button>
              </div>

              {/* Export Data — Sprint 7C: real GDPR-style download via
                  /api/account/export. Streams a JSON archive of every row
                  tied to the user + their workspace (artifacts, leads,
                  deals, sessions, login events, etc.). Caps at 1000 rows
                  per table to keep the file portable. */}
              <div className="flex items-start justify-between gap-6 pb-5 border-b border-red-900/50">
                <div>
                  <p className="text-white font-medium text-sm">Export All Data</p>
                  <p className="text-gray-500 text-xs mt-1">Download a JSON archive of your workspace data, content, leads, and account history. Generated media binaries are not included.</p>
                  {exportError && (
                    <p className="text-red-400 text-xs mt-1.5">Export failed: {exportError}</p>
                  )}
                </div>
                <button className={btn + ' shrink-0'} onClick={exportData}>Export Data</button>
              </div>

              {/* Delete Workspace */}
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-red-300 font-medium text-sm">Delete Workspace</p>
                  <p className="text-gray-500 text-xs mt-1">Permanently deletes your workspace, all data, billing, and account access. This cannot be undone.</p>
                </div>
                <button className="border border-red-600 bg-red-950 text-red-300 hover:bg-red-900 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0" onClick={() => setModal('deleteWorkspace')}>Delete Workspace</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ════════════════ MODALS ════════════════ */}

      {/* Change Email */}
      <Modal open={modal === 'changeEmail'} onClose={() => setModal(null)} title="Change Email Address">
        <Field label="Current Password"><input type="password" className={inp} value={modalData.currentPassword || ''} onChange={e => setModalData(p => ({ ...p, currentPassword: e.target.value }))} placeholder="Your current password" /></Field>
        <Field label="New Email Address"><input type="email" className={inp} value={modalData.newEmail || ''} onChange={e => setModalData(p => ({ ...p, newEmail: e.target.value }))} placeholder="newemail@example.com" /></Field>
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Cancel</button>
          <button className={btn} onClick={() => { setProfile(p => ({ ...p, email: modalData.newEmail || p.email })); setModal(null) }}>Change Email</button>
        </div>
      </Modal>

      {/* Change Password */}
      <Modal open={modal === 'changePassword'} onClose={() => setModal(null)} title="Change Password">
        <Field label="Current Password"><input type="password" className={inp} value={modalData.cp || ''} onChange={e => setModalData(p => ({ ...p, cp: e.target.value }))} /></Field>
        <Field label="New Password"><input type="password" className={inp} value={modalData.np || ''} onChange={e => setModalData(p => ({ ...p, np: e.target.value }))} placeholder="Min. 8 characters" /></Field>
        <Field label="Confirm New Password"><input type="password" className={inp} value={modalData.cnp || ''} onChange={e => setModalData(p => ({ ...p, cnp: e.target.value }))} /></Field>
        {modalData.np && modalData.cnp && modalData.np !== modalData.cnp && <p className="text-red-400 text-xs">Passwords do not match.</p>}
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Cancel</button>
          <button className={btn} disabled={!modalData.cp || !modalData.np || modalData.np !== modalData.cnp} onClick={() => { setModal(null); setModalData({}) }}>Update Password</button>
        </div>
      </Modal>

      {/* 2FA Setup */}
      <Modal open={modal === '2fa'} onClose={() => setModal(null)} title={twoFAEnabled ? '2FA Disabled' : 'Set Up Two-Factor Authentication'}>
        {twoFAEnabled ? (
          <p className="text-gray-400 text-sm">Two-factor authentication has been disabled. Your account is now less secure.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
            <div className="w-40 h-40 bg-white rounded-xl mx-auto flex items-center justify-center text-4xl">📱</div>
            <p className="text-gray-500 text-xs text-center">Manual key: JBSWY3DPEHPK3PXP</p>
            <Field label="Enter 6-digit code to confirm"><input className={inp} maxLength={6} placeholder="000000" value={modalData.totp || ''} onChange={e => setModalData(p => ({ ...p, totp: e.target.value }))} /></Field>
          </div>
        )}
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Close</button>
          {!twoFAEnabled && <button className={btn} onClick={() => setModal(null)}>Verify &amp; Enable</button>}
        </div>
      </Modal>

      {/* Backup Codes */}
      <Modal open={modal === 'backupCodes'} onClose={() => setModal(null)} title="Backup Codes">
        <p className="text-gray-400 text-sm">Store these in a safe place. Each code can only be used once.</p>
        <div className="grid grid-cols-2 gap-2">
          {['a1b2c3d4', 'e5f6g7h8', 'i9j0k1l2', 'm3n4o5p6', 'q7r8s9t0', 'u1v2w3x4', 'y5z6a7b8', 'c9d0e1f2'].map(c => (
            <code key={c} className="px-3 py-1.5 bg-gray-800 rounded text-green-300 text-xs text-center">{c}</code>
          ))}
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => navigator.clipboard.writeText('a1b2c3d4 e5f6g7h8 i9j0k1l2 m3n4o5p6 q7r8s9t0 u1v2w3x4 y5z6a7b8 c9d0e1f2')}>Copy All</button>
          <button className={btn} onClick={() => setModal(null)}>Done</button>
        </div>
      </Modal>

      {/* Sprint 7C: removed orphan New Token modal. Token generation now
          lives on /dashboard/developer-api, which is wired to the real
          developer_tokens table with proper scope grammar, revocation,
          and last-used tracking. The Card on the Security tab links there. */}

      {/* Delete Content */}
      <Modal open={modal === 'deleteContent'} onClose={() => setModal(null)} title="Delete All Content">
        <p className="text-gray-400 text-sm">This will permanently delete all generated content, campaigns, and assets. Type <strong className="text-white">DELETE</strong> to confirm.</p>
        <input className={inp} placeholder='Type "DELETE" to confirm' value={dangerInput.deleteContent || ''} onChange={e => setDangerInput(p => ({ ...p, deleteContent: e.target.value }))} />
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Cancel</button>
          <button className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors" disabled={dangerInput.deleteContent !== 'DELETE'} onClick={() => { setModal(null); setDangerInput(p => ({ ...p, deleteContent: '' })) }}>Delete All Content</button>
        </div>
      </Modal>

      {/* Reset Workspace */}
      <Modal open={modal === 'resetWorkspace'} onClose={() => setModal(null)} title="Reset Workspace">
        <p className="text-gray-400 text-sm">This will clear all agents, content, strategies, and data. Type <strong className="text-white">RESET</strong> to confirm.</p>
        <input className={inp} placeholder='Type "RESET" to confirm' value={dangerInput.resetWorkspace || ''} onChange={e => setDangerInput(p => ({ ...p, resetWorkspace: e.target.value }))} />
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Cancel</button>
          <button className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors" disabled={dangerInput.resetWorkspace !== 'RESET'} onClick={() => { setModal(null); setDangerInput(p => ({ ...p, resetWorkspace: '' })) }}>Reset Workspace</button>
        </div>
      </Modal>

      {/* Delete Workspace */}
      <Modal open={modal === 'deleteWorkspace'} onClose={() => setModal(null)} title="Delete Workspace — Permanent">
        <p className="text-gray-400 text-sm">This will permanently delete your entire workspace. Type your workspace name <strong className="text-white">{workspace.name || 'my workspace'}</strong> to confirm.</p>
        <input className={inp} placeholder={`Type "${workspace.name || 'my workspace'}" to confirm`} value={dangerInput.deleteWorkspace || ''} onChange={e => setDangerInput(p => ({ ...p, deleteWorkspace: e.target.value }))} />
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Cancel</button>
          <button className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors"
            disabled={dangerInput.deleteWorkspace !== (workspace.name || 'my workspace')}
            onClick={() => { localStorage.clear(); window.location.href = '/login' }}>
            Delete Workspace Permanently
          </button>
        </div>
      </Modal>
    </div>
  )
}
