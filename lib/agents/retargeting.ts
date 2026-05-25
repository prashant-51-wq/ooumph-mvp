/**
 * lib/agents/retargeting.ts
 * Intelligence library for the Retargeting Supervisor.
 * All functions call Claude with expert performance-marketer prompts.
 */

import { runAgent } from '@/lib/claude'
import type { BrandProfile } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AudienceSegment {
  name: string
  description: string
  size: string
  signals: string[]
  platforms: string[]
  retargetingGoal: string
  messagingAngle: string
  urgency: 'high' | 'medium' | 'low'
  recommendedBudget: string
  pixelEvents: string[]
}

export interface RetargetingCampaign {
  name: string
  objective: 'conversions' | 'traffic' | 'leads' | 'catalog_sales' | 'app_events'
  targetSegments: AudienceSegment[]
  platforms: Array<'meta' | 'google' | 'linkedin' | 'tiktok'>
  adFormats: string[]
  budgetAllocation: Record<string, number>
  messagingStrategy: string
  creativeDirections: Array<{
    format: string
    headline: string
    bodyCopy: string
    cta: string
    visualConcept: string
  }>
  frequencyCap: string
  retargetingWindow: number
  exclusions: string[]
  estimatedRoas: string
  timeline: string
}

export interface LookalikeAudience {
  sourceName: string
  sourceSize: number
  sourceDescription: string
  lookalikePercentage: number
  estimatedReach: string
  platforms: string[]
  topCharacteristics: string[]
  recommendedBid: string
  expectedCpa: string
  implementation: Record<string, string>
}

export interface AbandonedJourneyMap {
  funnelStages: Array<{
    name: string
    url?: string
    dropoffRate: string
    estimatedUsersLost: number
    dropoffReasons: string[]
    retargetingStrategy: string
    adCopy: string
    urgencyLevel: 'high' | 'medium' | 'low'
  }>
  totalEstimatedRecovery: string
  topPriority: string
  quickWins: string[]
}

export interface RetargetingAdCopy {
  segment: string
  platform: string
  warmingTone: string
  variations: Array<{
    headline: string
    primaryText: string
    description: string
    cta: string
    angle: 'social_proof' | 'urgency' | 'value_reminder' | 'objection_crusher' | 'personalized'
  }>
  doNotUse: string[]
}

export interface PixelStrategy {
  platforms: string[]
  standardEvents: Array<{
    event: string
    trigger: string
    pagePath: string
    value?: string
    notes: string
  }>
  customEvents: Array<{
    name: string
    trigger: string
    parameters: Record<string, string>
    purpose: string
  }>
  implementation: string
  audienceBuilding: string[]
}

// ─── System prompt ──────────────────────────────────────────────────────────────

const BASE_SYSTEM = `You are a senior performance marketing strategist with 12+ years specializing in paid retargeting, audience psychology, and conversion rate optimization.

You have deep expertise in:
- Meta Ads (Facebook/Instagram) audience segmentation and creative strategy
- Google Ads remarketing lists, Customer Match, and RLSA
- LinkedIn Matched Audiences and Insight Tag strategies
- TikTok Pixel and custom audiences
- Funnel abandonment recovery (industry benchmark: 26-70% cart recovery rates)
- Lookalike modeling and seed audience quality
- Ad frequency management to prevent creative fatigue
- Warm-audience copywriting that acknowledges prior brand interaction

You think in terms of recency, frequency, and monetary value (RFM). You know that retargeting audiences convert 2-3x higher than cold traffic at 40-60% lower CPAs.

Always respond with valid JSON only. No markdown, no explanation outside the JSON.`

// ─── segmentAudiences ──────────────────────────────────────────────────────────

export async function segmentAudiences(
  brand: BrandProfile,
  leadsData: {
    total: number
    bySource: Record<string, number>
    byStatus: Record<string, number>
    byScoreTier: { hot: number; warm: number; cold: number; new: number }
    avgScore: number
  },
  websiteData?: { pageViews?: number; avgSessionDuration?: string; bounceRate?: string }
): Promise<AudienceSegment[]> {
  const SYSTEM = `${BASE_SYSTEM}

You are specifically analyzing lead data to create high-precision retargeting audience segments.
Your segments should be actionable — each segment gets a different message, bid strategy, and creative angle.
Think about the psychology of each group: what did they see, what stopped them, what would bring them back.`

  const prompt = `Segment the retargeting audiences for this business based on their real lead data.

BUSINESS: ${brand.business_name}
INDUSTRY: ${brand.industry || 'not specified'}
OFFER: ${brand.offer}
TARGET AUDIENCE: ${brand.target_audience}
CHANNELS: ${Array.isArray(brand.channels) ? brand.channels.join(', ') : brand.channels}
MONTHLY BUDGET: ${brand.monthly_budget}

LEAD DATA:
- Total leads in system: ${leadsData.total}
- By source: ${JSON.stringify(leadsData.bySource)}
- By status: ${JSON.stringify(leadsData.byStatus)}
- By score tier (hot=70+, warm=40-69, cold=1-39, new=0): ${JSON.stringify(leadsData.byScoreTier)}
- Average lead score: ${leadsData.avgScore}
${websiteData ? `
WEBSITE DATA:
- Page views: ${websiteData.pageViews || 'unknown'}
- Avg session: ${websiteData.avgSessionDuration || 'unknown'}
- Bounce rate: ${websiteData.bounceRate || 'unknown'}` : ''}

Create 5-8 precise retargeting segments. For each segment consider:
1. What behavioral signals define them (pixel events, lead score, source, status)
2. Where in the funnel they dropped off
3. Which platforms they're most reachable on
4. What single message would most likely convert them NOW
5. Budget priority based on segment size and conversion probability

Return a JSON array of AudienceSegment objects:
[{
  "name": "segment name",
  "description": "who these people are and what they did",
  "size": "estimated size range e.g. '200-500 users'",
  "signals": ["behavioral signal 1", "behavioral signal 2"],
  "platforms": ["meta", "google"],
  "retargetingGoal": "specific conversion goal",
  "messagingAngle": "the core message that resonates — be specific",
  "urgency": "high|medium|low",
  "recommendedBudget": "e.g. '$50/day' or '30% of retargeting budget'",
  "pixelEvents": ["ViewContent", "AddToCart"]
}]`

  return runAgent<AudienceSegment[]>(SYSTEM, prompt)
}

// ─── buildRetargetingCampaign ──────────────────────────────────────────────────

export async function buildRetargetingCampaign(
  brand: BrandProfile,
  segments: AudienceSegment[],
  budget: number,
  platforms: Array<'meta' | 'google' | 'linkedin' | 'tiktok'>
): Promise<RetargetingCampaign> {
  const SYSTEM = `${BASE_SYSTEM}

You are building a complete retargeting campaign blueprint. Think like a media buyer and creative director simultaneously.
Your campaign structures must reflect real platform capabilities:
- Meta: Campaign → Ad Set (audience) → Ads (creative)
- Google: Campaign → Ad Group (RLSA/custom intent) → Ads
- LinkedIn: Campaign Group → Campaign (audience) → Creatives
- TikTok: Campaign → Ad Group (audience) → Ads

Industry benchmarks for retargeting:
- Average retargeting CTR: 0.7% (vs 0.07% display)
- Average retargeting conversion rate: 3-5x higher than cold traffic
- Optimal frequency: 3-7 impressions/week before fatigue
- Recommended retargeting window: 30 days for most businesses, 7 days for high-intent`

  const prompt = `Build a complete retargeting campaign blueprint for this business.

BUSINESS: ${brand.business_name}
INDUSTRY: ${brand.industry || 'service business'}
OFFER: ${brand.offer}
UNIQUE VALUE: ${brand.unique_value || brand.unique_value_prop || ''}
TARGET AUDIENCE: ${brand.target_audience}
TONE: ${brand.tone}
MONTHLY BUDGET: $${budget}
PLATFORMS: ${platforms.join(', ')}

AUDIENCE SEGMENTS TO TARGET:
${JSON.stringify(segments, null, 2)}

BUDGET ALLOCATION GUIDANCE:
- Total monthly: $${budget}
- Allocate by platform performance potential for this industry
- Highest budget to highest-intent segments

Build a campaign that:
1. Has a clear primary objective based on the offer type
2. Addresses each segment with a tailored message
3. Uses the right ad formats per platform (single image, carousel, video, responsive)
4. Sets smart frequency caps to prevent burnout
5. Excludes the right people (recent buyers, unsubscribes)
6. Has 3-5 creative directions with real copy (not templates)
7. Provides realistic ROAS estimate based on industry benchmarks

Return a single RetargetingCampaign JSON object:
{
  "name": "campaign name",
  "objective": "conversions|traffic|leads|catalog_sales|app_events",
  "targetSegments": [/* subset of segments, highest priority */],
  "platforms": ["meta", "google"],
  "adFormats": ["single_image", "carousel", "video"],
  "budgetAllocation": { "meta": 60, "google": 40 },
  "messagingStrategy": "overarching message strategy across all segments",
  "creativeDirections": [
    {
      "format": "carousel",
      "headline": "actual headline text — be specific",
      "bodyCopy": "actual ad copy — warm audience aware",
      "cta": "Shop Now|Learn More|Book a Call|Get Started",
      "visualConcept": "describe the visual precisely"
    }
  ],
  "frequencyCap": "3 impressions/day, 10/week",
  "retargetingWindow": 30,
  "exclusions": ["recent purchasers (30 days)", "email unsubscribes"],
  "estimatedRoas": "2.5-4x based on industry benchmarks",
  "timeline": "2-week setup, 4-week optimization cycle"
}`

  return runAgent<RetargetingCampaign>(SYSTEM, prompt)
}

// ─── buildLookalikeAudience ────────────────────────────────────────────────────

export async function buildLookalikeAudience(
  brand: BrandProfile,
  sourceType: 'customers' | 'top_leads' | 'converters' | 'video_viewers',
  sourceSize: number
): Promise<LookalikeAudience> {
  const SYSTEM = `${BASE_SYSTEM}

You are a lookalike audience architect. You understand that seed audience quality beats size.
Key principles:
- 1% lookalike = highest similarity, smallest reach (~2M people on Meta US)
- 1-3% for B2C consumer goods, 1% for B2B or niche offers
- Minimum seed size: 100 for Meta, 300 for Google Customer Match, 500 for LinkedIn
- Customer LTV-weighted seeds outperform flat customer lists by 30-40%
- Video viewer audiences (75%+ completion) are high-quality seeds
- Platform differences: Meta uses behavioral signals, LinkedIn uses professional profile signals`

  const sourceDescriptions: Record<string, string> = {
    customers: 'people who have already purchased or subscribed',
    top_leads: 'leads with a score of 70+ indicating high intent and engagement',
    converters: 'people who completed a key conversion action (form, booking, purchase)',
    video_viewers: 'people who watched 75%+ of brand video content',
  }

  const prompt = `Build a lookalike audience strategy for this business.

BUSINESS: ${brand.business_name}
INDUSTRY: ${brand.industry || 'service business'}
OFFER: ${brand.offer}
TARGET AUDIENCE: ${brand.target_audience}
MONTHLY BUDGET: ${brand.monthly_budget}

SOURCE AUDIENCE TYPE: ${sourceType}
SOURCE DESCRIPTION: ${sourceDescriptions[sourceType]}
SOURCE SIZE: ${sourceSize} people

Build the optimal lookalike strategy including:
1. The recommended lookalike percentage (1-10%) with reasoning
2. Estimated reach per platform
3. The top 5-7 characteristics the algorithm will look for in this audience
4. Bid strategy recommendations
5. Expected CPA vs cold traffic
6. Platform-specific implementation steps (step-by-step instructions for each platform)

Return a LookalikeAudience JSON object:
{
  "sourceName": "descriptive name for this source audience",
  "sourceSize": ${sourceSize},
  "sourceDescription": "what makes this seed audience valuable",
  "lookalikePercentage": 2,
  "estimatedReach": "e.g. '4-8 million people (Meta US)'",
  "platforms": ["meta", "google", "linkedin"],
  "topCharacteristics": ["characteristic 1", "characteristic 2", ...],
  "recommendedBid": "e.g. '$15-25 CPM' or 'Target CPA: $45'",
  "expectedCpa": "e.g. '20-35% lower than cold traffic'",
  "implementation": {
    "meta": "Step 1: Go to Audiences... Step 2: ...",
    "google": "Step 1: In Google Ads...",
    "linkedin": "Step 1: In Campaign Manager..."
  }
}`

  return runAgent<LookalikeAudience>(SYSTEM, prompt)
}

// ─── analyzeAbandonedJourney ───────────────────────────────────────────────────

export async function analyzeAbandonedJourney(
  brand: BrandProfile,
  funnelData?: Array<{ name: string; dropoffRate: number; usersLost: number }>
): Promise<AbandonedJourneyMap> {
  const SYSTEM = `${BASE_SYSTEM}

You are a conversion funnel specialist who recovers lost revenue through hyper-targeted retargeting.
You know that:
- Average landing page conversion rate: 2.35% (top 25%: 5.31%)
- Email opt-in abandonment: 60-70% of visitors
- Pricing page bounce: 40-60% without retargeting
- Checkout abandonment: 68.8% industry average
- Demo/booking no-shows: 20-40%
- Each funnel stage needs different urgency, messaging, and creative format
- Recovery window: 24 hours = highest intent, 7 days = still warm, 30 days = cooling
- Prioritize recovery by: (% drop-off) × (users lost) × (estimated deal value)`

  const hasFunnelData = funnelData && funnelData.length > 0
  const avgDealValue = brand.monthly_budget ? `$${parseInt(brand.monthly_budget.replace(/\D/g, '') || '500') / 10}` : 'unknown'

  const prompt = `Analyze the abandoned journey and build a recovery retargeting map.

BUSINESS: ${brand.business_name}
INDUSTRY: ${brand.industry || 'service/SaaS business'}
OFFER: ${brand.offer}
TARGET AUDIENCE: ${brand.target_audience}
UNIQUE VALUE: ${brand.unique_value || brand.unique_value_prop || ''}
ESTIMATED DEAL VALUE: ${avgDealValue}
CHANNELS: ${Array.isArray(brand.channels) ? brand.channels.join(', ') : brand.channels}

${hasFunnelData ? `REAL FUNNEL DATA PROVIDED:
${JSON.stringify(funnelData, null, 2)}` : `NO FUNNEL DATA — infer the typical funnel for this type of business and estimate realistic drop-off rates based on industry benchmarks.`}

For each funnel stage:
1. Identify why people specifically drop off at that stage (psychology + friction)
2. Design a retargeting strategy that directly addresses that reason
3. Write actual ad copy for that stage (not a template — real words)
4. Assign urgency level based on recency and intent signal strength
5. Estimate users lost (if not provided, estimate from industry benchmarks)

Prioritize stages by recoverable value = (1 - dropoffRate) × usersLost × dealValue.

Return an AbandonedJourneyMap JSON:
{
  "funnelStages": [
    {
      "name": "Stage Name (e.g. Landing Page Visitor)",
      "url": "/pricing",
      "dropoffRate": "65%",
      "estimatedUsersLost": 650,
      "dropoffReasons": ["reason 1", "reason 2", "reason 3"],
      "retargetingStrategy": "specific strategy — platform, timing, message type",
      "adCopy": "actual ad copy for this stage — acknowledge where they are in the journey",
      "urgencyLevel": "high|medium|low"
    }
  ],
  "totalEstimatedRecovery": "e.g. '$8,500-15,000/month with proper retargeting'",
  "topPriority": "which single stage has the highest ROI to fix first and why",
  "quickWins": ["quick win 1 — implementable in 24 hours", "quick win 2"]
}`

  return runAgent<AbandonedJourneyMap>(SYSTEM, prompt)
}

// ─── writeRetargetingCopy ──────────────────────────────────────────────────────

export async function writeRetargetingCopy(
  brand: BrandProfile,
  segment: string,
  platform: string,
  previousMessaging?: string
): Promise<RetargetingAdCopy> {
  const platformSpecs: Record<string, string> = {
    meta: 'Primary text: 125 chars (preview), up to 500 chars. Headline: 40 chars. Description: 30 chars. Multiple variations for A/B testing.',
    google: 'Responsive Search Ads: 15 headlines (30 chars each), 4 descriptions (90 chars each). RLSA modifier: +20-50% bid adjustment.',
    linkedin: 'Introductory text: 150 chars preview (600 max). Headline: 70 chars. Description: 100 chars. Message Ads: 500-1000 chars.',
    tiktok: 'Ad name: 512 chars. Text: 100 chars. Hook in first 2 seconds is critical. Conversational, native-feeling tone.',
  }

  const SYSTEM = `${BASE_SYSTEM}

You are a direct-response copywriter who specializes in warm-audience retargeting copy.
Your copy operates on a different psychological frequency than cold advertising:
- The audience has ALREADY seen this brand — no need to introduce it
- They are evaluating, not discovering — address the specific hesitation
- Create implicit familiarity without being creepy ("we see you" vibes)
- The hook acknowledges their prior interaction subtly: "Still thinking about it?" / "Not sure yet?" / "Since you checked us out..."
- Each angle must be psychologically distinct — not just rephrased versions of the same message
- Social proof hits harder with warm audiences (they're in evaluation mode)
- Urgency must be real — manufactured FOMO burns warm audiences fast
- Never repeat the exact phrasing from cold campaigns — they've already been immune-trained

Platform specs for ${platform}: ${platformSpecs[platform] || 'standard ad platform specs'}`

  const prompt = `Write warm-audience retargeting ad copy for this segment.

BUSINESS: ${brand.business_name}
OFFER: ${brand.offer}
UNIQUE VALUE: ${brand.unique_value || brand.unique_value_prop || ''}
TONE: ${brand.tone}
TARGET AUDIENCE: ${brand.target_audience}
COMPETITORS: ${brand.competitors || 'not specified'}

TARGET SEGMENT: ${segment}
PLATFORM: ${platform}
${previousMessaging ? `PREVIOUS MESSAGING THEY SAW (DO NOT REPEAT):
${previousMessaging}` : ''}

Write 5-6 distinct copy variations, each with a different psychological angle:
1. social_proof — testimonial, case study hook, crowd wisdom
2. urgency — real scarcity, deadline, consequence of delay
3. value_reminder — re-surface the core benefit they forgot
4. objection_crusher — directly address the most likely hesitation
5. personalized — feels like it knows exactly who they are
6. (optional) additional angle relevant to this specific segment

Each variation must:
- Feel warm and familiar, not like a cold ad
- Never use generic phrases like "Check us out" or "Learn more about us"
- Use the specific benefit/pain point relevant to this segment
- Have a CTA that matches where they are in the journey

Also provide a "doNotUse" list: phrases/approaches they've already seen that would feel repetitive.

Return a RetargetingAdCopy JSON:
{
  "segment": "${segment}",
  "platform": "${platform}",
  "warmingTone": "describe the overall tone/energy for this segment",
  "variations": [
    {
      "headline": "actual headline — specific, not generic",
      "primaryText": "the main ad copy — warm, conversational, conversion-focused",
      "description": "supporting description line",
      "cta": "Get Started|Book Now|See Pricing|Claim Offer|Watch Demo",
      "angle": "social_proof|urgency|value_reminder|objection_crusher|personalized"
    }
  ],
  "doNotUse": ["phrase or approach to avoid 1", "phrase 2"]
}`

  return runAgent<RetargetingAdCopy>(SYSTEM, prompt)
}

// ─── designPixelStrategy ──────────────────────────────────────────────────────

export async function designPixelStrategy(
  brand: BrandProfile,
  platforms: string[],
  pages?: string[]
): Promise<PixelStrategy> {
  const SYSTEM = `${BASE_SYSTEM}

You are a marketing technology architect specializing in pixel implementation, tag management, and audience data infrastructure.
You know that pixel quality directly determines retargeting campaign performance.
Key principles:
- Fire events at the right moment (not too early, not too late)
- Pass value parameters wherever possible — enables value-based lookalikes
- Deduplicate server-side events to avoid double-counting
- Build audiences at every stage of the funnel
- CAPI (Conversions API) should mirror browser pixels for iOS 14.5+ signal recovery
- Custom events enable granular audience building (e.g., 'ReadMoreThan50%' vs just 'ViewContent')
- GTM is preferred over direct code injection for maintainability
- Test every event with Facebook Pixel Helper / Google Tag Assistant before going live`

  const inferredPages = pages || [
    '/',
    '/about',
    '/services',
    '/pricing',
    '/blog',
    '/contact',
    '/book',
    '/thank-you',
    '/checkout',
  ]

  const prompt = `Design a complete pixel and tracking strategy for this business.

BUSINESS: ${brand.business_name}
INDUSTRY: ${brand.industry || 'service business'}
OFFER: ${brand.offer}
TARGET AUDIENCE: ${brand.target_audience}
PLATFORMS REQUIRING PIXELS: ${platforms.join(', ')}

PAGES TO INSTRUMENT:
${inferredPages.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Design:
1. Standard events: map the right pixel event to each page/trigger
2. Custom events: business-specific events that enable better segmentation
3. Implementation: GTM container setup instructions OR direct code snippets
4. Audience building: which audiences to create from these events (with lookback windows)

For implementation code, provide actual JavaScript/GTM tag configurations.
For Meta: include fbq() calls. For Google: include gtag() calls. For LinkedIn: include lintrk() calls. For TikTok: include ttq.track() calls.

Return a PixelStrategy JSON:
{
  "platforms": ${JSON.stringify(platforms)},
  "standardEvents": [
    {
      "event": "PageView|ViewContent|Lead|Purchase|InitiateCheckout|AddToCart|CompleteRegistration|Schedule",
      "trigger": "when this fires e.g. 'Page load on /pricing'",
      "pagePath": "/pricing",
      "value": "optional monetary value e.g. '99'",
      "notes": "why this event matters and how it'll be used"
    }
  ],
  "customEvents": [
    {
      "name": "CustomEventName",
      "trigger": "specific trigger e.g. 'User scrolls 75% of blog post'",
      "parameters": { "content_name": "blog post title", "category": "educational" },
      "purpose": "enables audience of engaged readers for retargeting"
    }
  ],
  "implementation": "Full GTM setup instructions with actual code snippets for each platform",
  "audienceBuilding": [
    "All website visitors (30 days) — top-of-funnel retargeting pool",
    "Pricing page visitors who did not convert (14 days) — high-intent retargeting"
  ]
}`

  return runAgent<PixelStrategy>(SYSTEM, prompt)
}

// ─── optimizeAdFrequency ────────────────────────────────────────────────────────

export async function optimizeAdFrequency(
  brand: BrandProfile,
  currentFrequency: Record<string, number>,
  performanceData: {
    platform: string
    impressions: number
    clicks: number
    conversions: number
    spend: number
    ctr: number
    cpa: number
  }[]
): Promise<{
  recommendations: string[]
  optimalFrequency: Record<string, string>
  burnoutWarnings: string[]
}> {
  const SYSTEM = `${BASE_SYSTEM}

You are a media buying optimization expert who prevents ad fatigue before it tanks campaign performance.
You know that:
- Optimal retargeting frequency: 3-5 impressions/week for most audiences
- Frequency >7/week increases CPA by 30-50% and destroys brand sentiment
- Different segments have different fatigue thresholds: hot leads fatigue at 2x the rate of cold
- Creative refresh cycle: every 2-3 weeks for warm audiences
- Early warning signs: CTR drops >25%, CPA increases >30%, frequency >10
- Platform-specific benchmarks: Meta optimal 1.8-4 frequency, Google Display 3-7 weekly
- Solution: audience exclusion rules, frequency caps at ad set level, creative rotation schedules`

  const prompt = `Analyze ad frequency and provide optimization recommendations.

BUSINESS: ${brand.business_name}
OFFER: ${brand.offer}

CURRENT FREQUENCY (impressions per person per week):
${JSON.stringify(currentFrequency, null, 2)}

PERFORMANCE DATA:
${JSON.stringify(performanceData, null, 2)}

Analyze for:
1. Which platforms/audiences are showing burnout signals
2. Optimal frequency caps per platform based on this performance data
3. Warning signs that require immediate action
4. Creative refresh recommendations

Return JSON:
{
  "recommendations": [
    "Specific, actionable recommendation with expected impact"
  ],
  "optimalFrequency": {
    "meta": "3 impressions/week, cap at 5/week",
    "google": "4 impressions/week per display, 2/week for RLSA"
  },
  "burnoutWarnings": [
    "WARNING: Meta frequency at X.X — CTR has dropped Y% — reduce immediately"
  ]
}`

  return runAgent<{ recommendations: string[]; optimalFrequency: Record<string, string>; burnoutWarnings: string[] }>(
    SYSTEM,
    prompt
  )
}
