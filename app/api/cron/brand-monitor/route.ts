/**
 * GET /api/cron/brand-monitor
 *
 * Vercel cron entrypoint. Scans for recent public brand mentions per
 * workspace, grades sentiment via Claude, ingests into `brand_mentions`,
 * and trips the PR Circuit Breaker on any `critical` severity sample
 * whose sentiment_score falls below the danger threshold.
 *
 * Lifecycle per workspace:
 *   1. Load brand_profiles → derive search keywords (business_name + competitors)
 *   2. braveSearch() last-N hits per keyword
 *   3. De-dupe against existing brand_mentions by source_url
 *   4. Claude scores each new mention: sentiment_score + severity_level
 *   5. INSERT rows
 *   6. If any (severity='critical' AND sentiment<0.30) → atomic UPDATE
 *      workspaces SET crisis_status='tripped', crisis_tripped_at=NOW()
 *      WHERE crisis_status='clear'   ← CAS lock prevents repeated trips
 *
 * Auth: Bearer ${CRON_SECRET} (Vercel cron) OR x-internal-secret with ADMIN_SECRET.
 *
 * Designed to be safe to run frequently (every 5-10 minutes). Skips
 * gracefully when BRAVE_SEARCH_API_KEY is unset — no fake data injected.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { braveSearch } from '@/lib/tools/brave-search'

export const runtime = 'nodejs'
export const maxDuration = 300

// Critical-mention threshold — below this sentiment, a 'critical' severity
// mention will trip the workspace into crisis mode.
const CRISIS_TRIGGER_SENTIMENT_MAX = 0.30
// Per-workspace cap so a runaway scan can't generate hundreds of mentions
// in a single cron tick.
const MAX_NEW_MENTIONS_PER_WORKSPACE_PER_RUN = 25
// Brave search count per keyword — kept small so the cron stays under
// maxDuration on workspaces with many keywords.
const SEARCH_HITS_PER_KEYWORD = 8

interface SentimentGrade {
  sentiment_score: number   // 0.00 - 1.00
  severity_level: 'low' | 'medium' | 'high' | 'critical'
  reason: string
}

interface ScanOutcome {
  workspaceId: string
  businessName: string
  keywords: string[]
  hitsFound: number
  newMentions: number
  duplicatesSkipped: number
  triggeredCrisis: boolean
  criticalCount: number
  errors: string[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractKeywords(brandRow: Record<string, unknown> | undefined): string[] {
  if (!brandRow) return []
  const keywords: string[] = []
  const name = (brandRow.business_name as string | null)?.trim()
  if (name) keywords.push(name)
  // competitors is stored as either CSV or JSON array
  const compRaw = brandRow.competitors as string | null
  if (compRaw) {
    try {
      const parsed = JSON.parse(compRaw)
      if (Array.isArray(parsed)) {
        for (const c of parsed.slice(0, 4)) if (typeof c === 'string' && c.trim()) keywords.push(c.trim())
      }
    } catch {
      for (const c of compRaw.split(',').slice(0, 4)) {
        const t = c.trim()
        if (t) keywords.push(t)
      }
    }
  }
  return keywords.filter(Boolean).slice(0, 5)  // hard cap to keep search budget tight
}

const SCORE_SYSTEM_PROMPT = `You are a Brand Sentiment Grading Agent for a marketing operations system.

You will receive a brand name + the title and snippet of a web result. Your task: classify the snippet's tone and produce a structured JSON record.

═══════════════════════════════════════════════════════════════════════════
GRADING SCALE
═══════════════════════════════════════════════════════════════════════════
sentiment_score: 0.00 = most negative · 0.50 = neutral · 1.00 = most positive
severity_level:
  • 'critical' — direct allegation, scandal, lawsuit, safety issue, public outage, data breach, executive misconduct, or viral negative framing
  • 'high'     — sharp criticism, vocal complaints, churn warnings, well-amplified negative reviews
  • 'medium'   — mild dissatisfaction, mixed reviews, comparison to a competitor's favor
  • 'low'      — neutral mention, positive coverage, generic discussion, press release pickups

Be CONSERVATIVE about critical/high — only assign them when the snippet describes a real public-facing incident. Routine discussion is 'low'.

═══════════════════════════════════════════════════════════════════════════
OUTPUT CONTRACT
═══════════════════════════════════════════════════════════════════════════
Return ONLY JSON. No markdown fences. No preamble.

{
  "sentiment_score":  number,   // 0.00 - 1.00, two decimal places
  "severity_level":   "low" | "medium" | "high" | "critical",
  "reason":           string    // 1 sentence justification
}`

async function gradeSnippet(brandName: string, title: string, description: string, workspaceId: string): Promise<SentimentGrade> {
  try {
    const out = await runAgent<SentimentGrade>(
      SCORE_SYSTEM_PROMPT,
      `BRAND: ${brandName}
TITLE: ${title}
SNIPPET: ${description.slice(0, 1200)}

Grade this mention per the OUTPUT CONTRACT.`,
      workspaceId,
    )
    // Clamp the score to 0..1 in case the LLM returns out-of-range
    const score = Math.max(0, Math.min(1, Number(out?.sentiment_score) || 0.5))
    const sev: SentimentGrade['severity_level'] = ['low','medium','high','critical'].includes(out?.severity_level as string)
      ? out.severity_level
      : 'low'
    return {
      sentiment_score: Math.round(score * 100) / 100,
      severity_level: sev,
      reason: String(out?.reason || ''),
    }
  } catch {
    // LLM failed — treat as a neutral, low-severity mention so we don't lose the row
    return { sentiment_score: 0.5, severity_level: 'low', reason: 'sentiment grading failed; default neutral' }
  }
}

// ─── Cron entrypoint ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth — same dual-mode used by /api/cron/publish-scheduled
  const cronSecret = process.env.CRON_SECRET || ''
  const adminSecret = process.env.ADMIN_SECRET || ''
  const auth = req.headers.get('authorization') || ''
  const internal = req.headers.get('x-internal-secret') || ''
  const cronOk = cronSecret && auth === `Bearer ${cronSecret}`
  const adminOk = adminSecret && (internal === adminSecret || auth === `Bearer ${adminSecret}`)
  if (!cronOk && !adminOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const startedAt = Date.now()

  // Workspaces to scan — only those with a brand_profiles row (i.e. onboarding finished)
  const wsRes = await sql`
    SELECT bp.workspace_id, bp.business_name, bp.competitors, w.crisis_status
    FROM brand_profiles bp
    LEFT JOIN workspaces w ON w.id = bp.workspace_id
    LIMIT 200
  `
  const workspaces = wsRes.rows as unknown as Array<{
    workspace_id: string
    business_name: string | null
    competitors: string | null
    crisis_status: string | null
  }>

  const outcomes: ScanOutcome[] = []

  for (const w of workspaces) {
    const workspaceId = w.workspace_id
    const businessName = (w.business_name || '').trim()
    const outcome: ScanOutcome = {
      workspaceId, businessName,
      keywords: [],
      hitsFound: 0, newMentions: 0, duplicatesSkipped: 0,
      triggeredCrisis: false, criticalCount: 0,
      errors: [],
    }

    if (!businessName) {
      outcome.errors.push('No business_name set')
      outcomes.push(outcome); continue
    }
    const keywords = extractKeywords(w as unknown as Record<string, unknown>)
    outcome.keywords = keywords

    try {
      // ── 1. Scrape across all keywords in parallel ────────────────────────
      const searchTasks = keywords.map(kw => braveSearch(`"${kw}" review OR complaint OR news`, SEARCH_HITS_PER_KEYWORD).catch(() => []))
      const searchResults = await Promise.all(searchTasks)
      const allHits = searchResults.flat()
      outcome.hitsFound = allHits.length

      // ── 2. De-dupe vs existing brand_mentions ────────────────────────────
      if (allHits.length === 0) { outcomes.push(outcome); continue }

      const urls = Array.from(new Set(allHits.map(h => h.url).filter(Boolean)))
      // Single SELECT to find which URLs already exist
      const existingUrls = new Set<string>()
      if (urls.length > 0) {
        // Postgres supports ANY; SQLite needs a list. Stay portable with
        // a few small parallel selects — limit≤8*5=40 so this is cheap.
        const checks = await Promise.all(urls.map(u => sql`
          SELECT id FROM brand_mentions WHERE workspace_id = ${workspaceId} AND source_url = ${u} LIMIT 1
        `))
        checks.forEach((c, i) => { if (c.rows[0]) existingUrls.add(urls[i]) })
      }
      const newHits = allHits.filter(h => h.url && !existingUrls.has(h.url))
        .slice(0, MAX_NEW_MENTIONS_PER_WORKSPACE_PER_RUN)
      outcome.duplicatesSkipped = allHits.length - newHits.length

      // ── 3. Grade each new hit + INSERT ───────────────────────────────────
      let triggerCrisis = false
      for (const hit of newHits) {
        const grade = await gradeSnippet(businessName, hit.title, hit.description, workspaceId)
        if (grade.severity_level === 'critical' && grade.sentiment_score < CRISIS_TRIGGER_SENTIMENT_MAX) {
          triggerCrisis = true
          outcome.criticalCount++
        }
        try {
          await sql`
            INSERT INTO brand_mentions (
              id, workspace_id, source_platform, source_url, author_handle,
              content_text, sentiment_score, severity_level, status,
              detected_at, created_at
            ) VALUES (
              ${newId()}, ${workspaceId}, 'brave_search', ${hit.url}, NULL,
              ${`${hit.title}\n\n${hit.description}`.slice(0, 5000)},
              ${grade.sentiment_score}, ${grade.severity_level},
              ${grade.severity_level === 'critical' ? 'flagged_crisis' : 'unread'},
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
          `
          outcome.newMentions++
        } catch (e) {
          outcome.errors.push(`insert failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      // ── 4. Trip the PR Circuit Breaker if needed ─────────────────────────
      // Atomic CAS update — only trips if currently 'clear', so repeated
      // critical mentions don't keep resetting crisis_tripped_at.
      if (triggerCrisis && w.crisis_status === 'clear') {
        await sql`
          UPDATE workspaces
          SET crisis_status = 'tripped', crisis_tripped_at = CURRENT_TIMESTAMP
          WHERE id = ${workspaceId} AND crisis_status = 'clear'
        `
        outcome.triggeredCrisis = true
        // Drop a notification row so the bell + crisis banner light up immediately
        try {
          await sql`
            INSERT INTO notifications (id, workspace_id, type, title, body, severity, created_at)
            VALUES (
              ${newId()}, ${workspaceId}, 'crisis_tripped',
              ${'⚠ PR Circuit Breaker tripped'},
              ${`A critical brand mention with sentiment ${outcome.newMentions ? '<' + CRISIS_TRIGGER_SENTIMENT_MAX : 'low'} was detected. All outbound dispatch (publishing, ads, email, PR) is now paused. Review /dashboard/brand-monitor.`},
              'critical', CURRENT_TIMESTAMP
            )
          `
        } catch { /* non-fatal */ }
      }
    } catch (err) {
      outcome.errors.push(err instanceof Error ? err.message : String(err))
    }

    outcomes.push(outcome)
  }

  return NextResponse.json({
    processedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    workspacesScanned: outcomes.length,
    triggeredCrises: outcomes.filter(o => o.triggeredCrisis).length,
    totalNewMentions: outcomes.reduce((s, o) => s + o.newMentions, 0),
    outcomes,
  })
}
