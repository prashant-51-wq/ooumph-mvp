/**
 * lib/agents/scheduling.ts
 * Core scheduling intelligence library for the Ooumph Scheduling Supervisor.
 *
 * Provides AI-powered functions for:
 *  - Optimal time slot analysis per platform + audience
 *  - Publishing calendar audits
 *  - Recurring schedule templates
 *  - Intelligent batch scheduling with conflict avoidance
 *  - Multi-timezone optimization
 *  - Conflict detection
 */

import { runAgent } from '@/lib/claude'
import type { BrandProfile } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OptimalTimeSlot {
  platform: string
  dayOfWeek: string        // 'Monday', 'Tuesday', etc.
  time: string             // '09:00', '17:30', etc.
  timezone: string
  reason: string           // why this time works for this audience
  engagementScore: number  // 0-100 estimated engagement
  competition: 'low' | 'medium' | 'high'
}

export interface ScheduleAudit {
  totalScheduled: number
  totalPublished: number
  totalFailed: number
  gapDays: string[]                           // dates with no scheduled content
  overloadedDays: string[]                    // dates with too much content
  platformBalance: Record<string, number>     // platform → post count
  contentTypeBalance: Record<string, number>  // type → count
  issues: Array<{ severity: 'critical' | 'warning' | 'info'; message: string }>
  recommendations: string[]
  overallScore: number   // 0-100 schedule health
}

export interface RecurringSchedule {
  name: string
  description: string
  platforms: string[]
  frequency: 'daily' | 'weekdays' | 'mwf' | 'weekly' | 'biweekly' | 'monthly'
  times: string[]        // e.g. ['09:00', '17:00']
  contentTypes: string[] // what types of content to slot here
  notes: string
  startDate: string
  endDate?: string
  totalPostsPerMonth: number
}

export interface ScheduledBatch {
  posts: Array<{
    platform: string
    content: string
    scheduledFor: string  // ISO
    contentType: string
    hashtags?: string[]
    mediaNote?: string    // creative brief for the visuals
  }>
  totalPosts: number
  platforms: string[]
  dateRange: { from: string; to: string }
  cadenceSummary: string
}

export interface TimezoneOptimization {
  primaryTimezone: string
  targetTimezones: string[]
  optimalWindows: Array<{
    utcTime: string
    coverage: string        // e.g. "Covers US East + UK morning"
    platforms: string[]
    audiencePercent: number
  }>
  recommendations: string[]
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const SCHEDULING_SYSTEM = `You are an expert social media scheduling strategist for Ooumph AI Marketing OS.
You have deep knowledge of platform algorithms, audience behavior patterns, content performance timing,
and multi-timezone audience optimization.
Your recommendations are grounded in current best practices and industry data.
Always respond with valid JSON only — no markdown, no commentary outside the JSON object.`

/** Clamp a number between min and max. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * Platform-aware minimum gap in hours between posts on the same platform
 * to avoid algorithm suppression and audience fatigue.
 */
const PLATFORM_MIN_GAP_HOURS: Record<string, number> = {
  instagram: 12,
  twitter: 2,
  x: 2,
  linkedin: 18,
  facebook: 8,
  tiktok: 8,
  youtube: 24,
  pinterest: 4,
  threads: 6,
  default: 12,
}

function platformGap(platform: string): number {
  return PLATFORM_MIN_GAP_HOURS[platform.toLowerCase()] ?? PLATFORM_MIN_GAP_HOURS.default
}

// ─── Public functions ─────────────────────────────────────────────────────────

/**
 * analyzeOptimalTimes
 * Returns 3-5 evidence-based optimal posting slots per requested platform.
 * Factors in platform algorithm patterns, brand audience timezone, and industry timing.
 */
export async function analyzeOptimalTimes(
  brand: BrandProfile,
  targetPlatforms: string[],
  audienceLocation?: string,
  workspaceId: string = '',
): Promise<OptimalTimeSlot[]> {
  const platforms = targetPlatforms.length > 0
    ? targetPlatforms
    : (Array.isArray(brand.channels) ? brand.channels : ['instagram', 'linkedin'])

  const prompt = `Analyze the optimal posting times for this brand on the specified social media platforms.

Business: ${brand.business_name}
Industry: ${brand.industry || 'General'}
Target audience: ${brand.target_audience}
Brand channels: ${Array.isArray(brand.channels) ? brand.channels.join(', ') : brand.channels}
Audience location / primary timezone: ${audienceLocation || 'United States (EST/PST)'}
Platforms to analyze: ${platforms.join(', ')}
Current year: ${new Date().getFullYear()}

Based on current platform algorithm research, industry benchmarks for ${brand.industry || 'this industry'},
and the audience profile described above, return the 3-5 best time slots per platform.

Factor in:
- When the target audience is most active (commute, lunch, evening, etc.)
- Platform-specific algorithm preferences (e.g. LinkedIn weights morning weekday posts)
- Industry-specific patterns (B2B vs B2C peak hours differ significantly)
- Competition density (low-competition windows beat peak times for emerging brands)

Respond with a JSON array of OptimalTimeSlot objects:
[
  {
    "platform": "instagram",
    "dayOfWeek": "Tuesday",
    "time": "09:00",
    "timezone": "America/New_York",
    "reason": "why this works",
    "engagementScore": 85,
    "competition": "medium"
  }
]

Return 3-5 slots per platform, sorted by engagementScore descending within each platform.`

  return runAgent<OptimalTimeSlot[]>(SCHEDULING_SYSTEM, prompt, workspaceId)
}

/**
 * auditPublishingCalendar
 * Deep analysis of scheduled + published content to surface health issues,
 * gaps, overloading, and platform imbalance.
 */
export async function auditPublishingCalendar(
  brand: BrandProfile,
  scheduledPosts: Array<Record<string, unknown>>,
  publishedPosts: Array<Record<string, unknown>>,
  dateRange?: { from: string; to: string },
  workspaceId: string = '',
): Promise<ScheduleAudit> {
  const range = dateRange ?? {
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  }

  // Pre-compute platform balances from raw data
  const platformCounts: Record<string, number> = {}
  for (const post of [...scheduledPosts, ...publishedPosts]) {
    const p = String(post.platform || 'unknown')
    platformCounts[p] = (platformCounts[p] || 0) + 1
  }

  // Identify dates with posts
  const datePostCounts: Record<string, number> = {}
  for (const post of scheduledPosts) {
    const d = String(post.scheduled_for || '').slice(0, 10)
    if (d) datePostCounts[d] = (datePostCounts[d] || 0) + 1
  }

  const prompt = `Audit the publishing calendar for this brand and return a complete health assessment.

Business: ${brand.business_name}
Industry: ${brand.industry || 'General'}
Active channels: ${Array.isArray(brand.channels) ? brand.channels.join(', ') : brand.channels}
Date range being audited: ${range.from} to ${range.to}

Scheduled posts (pending): ${scheduledPosts.length} total
Published posts: ${publishedPosts.length} total

Platform distribution so far:
${JSON.stringify(platformCounts, null, 2)}

Per-date post counts (scheduled only):
${JSON.stringify(datePostCounts, null, 2)}

Scheduled post sample (first 20):
${JSON.stringify(scheduledPosts.slice(0, 20).map(p => ({
  platform: p.platform,
  date: String(p.scheduled_for || '').slice(0, 10),
  status: p.status,
})), null, 2)}

Analyze and return a ScheduleAudit JSON object:
{
  "totalScheduled": number,
  "totalPublished": number,
  "totalFailed": number,
  "gapDays": ["YYYY-MM-DD", ...],
  "overloadedDays": ["YYYY-MM-DD", ...],
  "platformBalance": { "instagram": 12, "linkedin": 8, ... },
  "contentTypeBalance": { "educational": 5, "promotional": 3, ... },
  "issues": [
    { "severity": "critical|warning|info", "message": "description" }
  ],
  "recommendations": ["action1", "action2", ...],
  "overallScore": 72
}

A gap day is any weekday in the date range with zero scheduled or published content.
An overloaded day has more than 3 posts scheduled across all platforms.
Score the health 0-100 where 100 = perfectly consistent, balanced, conflict-free calendar.`

  return runAgent<ScheduleAudit>(SCHEDULING_SYSTEM, prompt, workspaceId)
}

/**
 * buildRecurringSchedule
 * Design a sustainable, platform-balanced recurring posting rhythm for the brand.
 */
export async function buildRecurringSchedule(
  brand: BrandProfile,
  platforms: string[],
  postsPerWeek: number,
  contentMix?: Record<string, number>,
  workspaceId: string = '',
): Promise<RecurringSchedule> {
  const resolvedPlatforms = platforms.length > 0
    ? platforms
    : (Array.isArray(brand.channels) ? brand.channels : ['instagram', 'linkedin'])

  const resolvedMix = contentMix || { educational: 40, promotional: 20, entertaining: 30, ugc: 10 }
  const resolvedPostsPerWeek = clamp(postsPerWeek || 5, 1, 21)

  const prompt = `Design a sustainable recurring posting schedule for this brand.

Business: ${brand.business_name}
Industry: ${brand.industry || 'General'}
Target audience: ${brand.target_audience}
Brand tone: ${brand.tone}
Platforms: ${resolvedPlatforms.join(', ')}
Desired posts per week (all platforms combined): ${resolvedPostsPerWeek}
Content type mix (percentages):
${JSON.stringify(resolvedMix, null, 2)}

Design a schedule that:
- Distributes posts evenly across the week (avoid clustering on single days)
- Allocates platform-appropriate cadences (LinkedIn max 1/day, Twitter up to 3/day, etc.)
- Matches the content mix percentages to specific content type slots
- Is realistic and maintainable for a small team
- Picks specific times of day matching known optimal windows for each platform

Return a RecurringSchedule JSON object:
{
  "name": "string — a catchy name for this schedule",
  "description": "string — 1-2 sentence description",
  "platforms": ["instagram", "linkedin"],
  "frequency": "weekdays",
  "times": ["09:00", "17:00"],
  "contentTypes": ["educational", "promotional", "entertaining"],
  "notes": "important scheduling notes",
  "startDate": "YYYY-MM-DD (today)",
  "totalPostsPerMonth": number
}`

  return runAgent<RecurringSchedule>(SCHEDULING_SYSTEM, prompt, workspaceId)
}

/**
 * autoScheduleBatch
 * Takes content items and produces a fully scheduled batch with ISO timestamps,
 * respecting platform minimum gaps and applying optimal time-of-day windows.
 */
export async function autoScheduleBatch(
  brand: BrandProfile,
  contentItems: Array<{ platform: string; content: string; type?: string }>,
  startDate: string,
  platforms: string[],
  workspaceId: string = '',
): Promise<ScheduledBatch> {
  const resolvedPlatforms = platforms.length > 0
    ? platforms
    : [...new Set(contentItems.map(i => i.platform))]

  const prompt = `You are scheduling ${contentItems.length} content pieces for automatic publishing.

Business: ${brand.business_name}
Industry: ${brand.industry || 'General'}
Target audience: ${brand.target_audience}
Start date: ${startDate}
Platforms in this batch: ${resolvedPlatforms.join(', ')}

Content items to schedule:
${JSON.stringify(contentItems.map((item, idx) => ({
  index: idx,
  platform: item.platform,
  type: item.type || 'general',
  contentPreview: item.content.slice(0, 80) + (item.content.length > 80 ? '...' : ''),
})), null, 2)}

Scheduling rules:
- Never post to the same platform twice within the minimum gap hours:
  ${JSON.stringify(PLATFORM_MIN_GAP_HOURS, null, 2)}
- Use optimal time-of-day windows for each platform and audience
- Spread posts evenly — no more than 3 posts per day across all platforms
- Start from: ${startDate}
- Assign specific ISO 8601 datetime strings for scheduledFor
- Include relevant hashtag suggestions (3-7) based on industry and content type
- Include a mediaNote (brief visual direction, 1 sentence) for each post

Return a ScheduledBatch JSON object:
{
  "posts": [
    {
      "platform": "instagram",
      "content": "full content text",
      "scheduledFor": "2024-01-15T09:00:00.000Z",
      "contentType": "educational",
      "hashtags": ["#tag1", "#tag2"],
      "mediaNote": "clean flat-lay image of..."
    }
  ],
  "totalPosts": number,
  "platforms": ["instagram", "linkedin"],
  "dateRange": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "cadenceSummary": "one-sentence summary of the posting cadence"
}

IMPORTANT: The content field in each post must be the FULL original content from the input, not a preview.`

  const result = await runAgent<ScheduledBatch>(SCHEDULING_SYSTEM, prompt, workspaceId)

  // Hydrate full content back from original items if AI truncated it
  const hydrated = result.posts.map((post, idx) => {
    const original = contentItems[idx]
    return {
      ...post,
      content: original?.content || post.content,
      platform: original?.platform || post.platform,
    }
  })

  return { ...result, posts: hydrated }
}

/**
 * optimizeForTimezones
 * Find UTC posting windows that maximize simultaneous audience coverage
 * across multiple target markets.
 */
export async function optimizeForTimezones(
  brand: BrandProfile,
  targetMarkets: string[],
  workspaceId: string = '',
): Promise<TimezoneOptimization> {
  const channels = Array.isArray(brand.channels) ? brand.channels : ['instagram', 'linkedin']

  const prompt = `Optimize posting times for maximum audience reach across multiple timezones.

Business: ${brand.business_name}
Industry: ${brand.industry || 'General'}
Primary brand timezone: inferred from audience description — ${brand.target_audience}
Target markets / timezones to cover: ${targetMarkets.join(', ')}
Active platforms: ${channels.join(', ')}

Find UTC time windows that:
- Hit active hours in as many target markets as possible simultaneously
- Weight by estimated audience distribution (note which markets likely have more followers)
- Account for platform peak hour variations
- Suggest 3-5 optimal UTC windows with coverage explanation

Return a TimezoneOptimization JSON object:
{
  "primaryTimezone": "America/New_York",
  "targetTimezones": ["America/Los_Angeles", "Europe/London", "Asia/Singapore"],
  "optimalWindows": [
    {
      "utcTime": "14:00",
      "coverage": "US East morning + UK afternoon",
      "platforms": ["instagram", "linkedin"],
      "audiencePercent": 72
    }
  ],
  "recommendations": [
    "Post at 14:00 UTC for maximum US + UK overlap",
    "Schedule APAC content separately at 01:00 UTC"
  ]
}`

  return runAgent<TimezoneOptimization>(SCHEDULING_SYSTEM, prompt, workspaceId)
}

/**
 * detectSchedulingConflicts
 * Scans pending scheduled posts for conflicts: same-platform proximity,
 * topic duplication, and per-day overloading.
 */
export async function detectSchedulingConflicts(
  scheduledPosts: Array<Record<string, unknown>>,
  workspaceId: string = '',
): Promise<Array<{ conflictType: string; posts: string[]; suggestion: string }>> {
  if (scheduledPosts.length === 0) return []

  const conflicts: Array<{ conflictType: string; posts: string[]; suggestion: string }> = []

  // ── 1. Same platform within minimum gap ──────────────────────────────────────
  const byPlatform: Record<string, Array<{ id: string; scheduledFor: Date }>> = {}
  for (const post of scheduledPosts) {
    if (post.status !== 'pending') continue
    const p = String(post.platform || '').toLowerCase()
    if (!byPlatform[p]) byPlatform[p] = []
    byPlatform[p].push({
      id: String(post.id),
      scheduledFor: new Date(String(post.scheduled_for)),
    })
  }
  for (const [platform, posts] of Object.entries(byPlatform)) {
    const sorted = posts.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
    const gapHours = platformGap(platform)
    for (let i = 1; i < sorted.length; i++) {
      const diffHours = (sorted[i].scheduledFor.getTime() - sorted[i - 1].scheduledFor.getTime()) / 3_600_000
      if (diffHours < gapHours) {
        conflicts.push({
          conflictType: 'platform_proximity',
          posts: [sorted[i - 1].id, sorted[i].id],
          suggestion: `Move post ${sorted[i].id} at least ${gapHours}h after previous ${platform} post to avoid algorithm suppression.`,
        })
      }
    }
  }

  // ── 2. Daily overload (>3 posts in a single calendar day) ────────────────────
  const byDay: Record<string, string[]> = {}
  for (const post of scheduledPosts) {
    if (post.status !== 'pending') continue
    const day = String(post.scheduled_for || '').slice(0, 10)
    if (day) {
      if (!byDay[day]) byDay[day] = []
      byDay[day].push(String(post.id))
    }
  }
  for (const [day, ids] of Object.entries(byDay)) {
    if (ids.length > 3) {
      conflicts.push({
        conflictType: 'daily_overload',
        posts: ids,
        suggestion: `${day} has ${ids.length} posts scheduled. Spread ${ids.length - 3} post(s) to adjacent days to avoid audience fatigue.`,
      })
    }
  }

  // ── 3. Use AI to detect topic/content duplication across close posts ──────────
  if (scheduledPosts.length > 1) {
    const sample = scheduledPosts
      .filter(p => p.status === 'pending')
      .slice(0, 30)
      .map(p => ({
        id: String(p.id),
        platform: String(p.platform),
        scheduledFor: String(p.scheduled_for || '').slice(0, 16),
        contentPreview: String(p.content || '').slice(0, 100),
      }))

    if (sample.length > 1) {
      const aiConflicts = await runAgent<Array<{ conflictType: string; posts: string[]; suggestion: string }>>(
        SCHEDULING_SYSTEM,
        `Detect topic or content duplication conflicts in these scheduled posts.

Posts (showing id, platform, time, content preview):
${JSON.stringify(sample, null, 2)}

Look for:
- Posts with very similar topics or hooks scheduled within 3 days of each other
- Same promotional message repeated too close together
- Identical hashtag clusters that signal audience saturation

Return a JSON array of conflicts (empty array if none):
[
  {
    "conflictType": "content_duplication",
    "posts": ["id1", "id2"],
    "suggestion": "what to change"
  }
]`,
        workspaceId,
      ).catch(() => [] as Array<{ conflictType: string; posts: string[]; suggestion: string }>)

      conflicts.push(...aiConflicts)
    }
  }

  return conflicts
}
