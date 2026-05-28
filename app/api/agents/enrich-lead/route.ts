/**
 * POST /api/agents/enrich-lead
 *
 * Parallel Multi-Source Synthesis enrichment agent. Races four data
 * providers concurrently, captures each raw response into `enrichment_logs`,
 * then asks Claude to merge the results under a strict Chronological
 * Priority Rule before writing the canonical fields back to `leads_captured`.
 *
 * Flow
 * ────
 *   1. Workspace ownership                                  401 / 403
 *   2. Atomic CAS lock: pending → enriching                 409 if not pending
 *   3. Promise.allSettled across [Brave, Apollo, Clearbit, Hunter]
 *      ├─ Each settled promise → INSERT enrichment_logs row
 *      └─ Failures don't kill the synthesis — partial data is fine
 *   4. Claude merge with Chronological Priority Rule:
 *      newer textual web signals override older structured snapshots
 *   5. UPDATE leads_captured with merged fields + status='completed'
 *   6. INSERT lead_activities row with activity_type='agent_enrichment'
 *
 * If the merge step itself fails, the lead is reset to 'failed' so the
 * user can retry from the UI. Per-provider failures are non-fatal.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { runAgent } from '@/lib/claude'
import { braveSearch } from '@/lib/tools/brave-search'
import { enrichPerson, enrichCompany, isApolloAvailable } from '@/lib/tools/apollo'
import { verifyEmail, domainSearch, isHunterAvailable } from '@/lib/tools/hunter'

export const runtime = 'nodejs'
export const maxDuration = 60

// ─── Types ────────────────────────────────────────────────────────────────

interface LeadRow {
  id: string
  workspace_id: string
  name: string | null
  email: string | null
  phone: string | null
  company_name: string | null
  enrichment_status: string | null
}

interface ProviderOutcome {
  provider: 'brave_search' | 'apollo' | 'clearbit' | 'hunter'
  ok: boolean
  durationMs: number
  /** Best-guess timestamp of the source data, ISO 8601 if known. Used by
   *  the Chronological Priority Rule. Structured DBs (Apollo/Clearbit) tend
   *  to be stale; live search hits are usually within minutes of the crawl. */
  capturedAt: string
  isLiveSignal: boolean
  payload: Record<string, unknown>
  error?: string
}

interface MergeResult {
  company_name?: string
  company_size?: string
  estimated_revenue?: string
  industry?: string
  linkedin_url?: string
  twitter_url?: string
  tech_stack?: string[]
  enrichment_summary?: string
  conflicts_resolved?: string[]
}

// ─── Provider dispatchers ─────────────────────────────────────────────────

function extractDomain(email: string | null): string | null {
  if (!email || !email.includes('@')) return null
  return email.split('@')[1].toLowerCase().trim() || null
}

async function timedProvider<T>(
  provider: ProviderOutcome['provider'],
  isLiveSignal: boolean,
  fn: () => Promise<T>,
): Promise<ProviderOutcome> {
  const startedAt = Date.now()
  const capturedAt = new Date().toISOString()
  try {
    const payload = await fn() as Record<string, unknown>
    return {
      provider,
      ok: payload !== null && payload !== undefined && Object.keys(payload).length > 0,
      durationMs: Date.now() - startedAt,
      capturedAt,
      isLiveSignal,
      payload: payload || {},
    }
  } catch (err) {
    return {
      provider,
      ok: false,
      durationMs: Date.now() - startedAt,
      capturedAt,
      isLiveSignal,
      payload: {},
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function runBraveSearch(lead: LeadRow): Promise<Record<string, unknown>> {
  // Query strategy: name + company OR just domain → catches recent press
  const domain = extractDomain(lead.email)
  const query = lead.name && domain
    ? `"${lead.name}" "${domain}" company OR funding OR hiring`
    : domain
    ? `"${domain}" company size industry funding`
    : lead.name
    ? `"${lead.name}" company linkedin`
    : ''
  if (!query) return {}
  const results = await braveSearch(query, 6)
  return { query, results }
}

async function runApollo(lead: LeadRow): Promise<Record<string, unknown>> {
  if (!isApolloAvailable() || !lead.email) return {}
  const [person, company] = await Promise.all([
    enrichPerson(lead.email).catch(() => null),
    extractDomain(lead.email) ? enrichCompany(extractDomain(lead.email)!).catch(() => null) : Promise.resolve(null),
  ])
  return { person: person || null, company: company || null }
}

interface ClearbitCompanyPayload {
  name?: string
  domain?: string
  metrics?: { employees?: number; estimatedAnnualRevenue?: string }
  category?: { industry?: string; sector?: string }
  tech?: string[]
  twitter?: { handle?: string }
  linkedin?: { handle?: string }
}

async function runClearbit(lead: LeadRow): Promise<Record<string, unknown>> {
  // Clearbit doesn't have an existing wrapper. Hit the API directly if a
  // key is present; otherwise return an empty result so the synthesis
  // pipeline gracefully continues with the other three sources.
  const apiKey = process.env.CLEARBIT_API_KEY
  const domain = extractDomain(lead.email)
  if (!apiKey || !domain) return {}
  try {
    const res = await fetch(
      `https://company.clearbit.com/v2/companies/find?domain=${encodeURIComponent(domain)}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8_000) },
    )
    if (!res.ok) return { error: `clearbit ${res.status}` }
    const data = await res.json() as ClearbitCompanyPayload
    return { domain, company: data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

async function runHunter(lead: LeadRow): Promise<Record<string, unknown>> {
  if (!isHunterAvailable() || !lead.email) return {}
  const domain = extractDomain(lead.email)
  const [verify, dom] = await Promise.all([
    verifyEmail(lead.email).catch(() => null),
    domain ? domainSearch(domain).catch(() => null) : Promise.resolve(null),
  ])
  return { email_verify: verify || null, domain_search: dom || null }
}

// ─── Claude merge prompt ───────────────────────────────────────────────────

const MERGE_SYSTEM_PROMPT = `You are a B2B Sales Intelligence Synthesis Agent.

You will be given partial enrichment data about a single lead from up to four
different sources, each tagged with:
  - provider (brave_search / apollo / clearbit / hunter)
  - captured_at (ISO 8601 timestamp when this data was retrieved)
  - is_live_signal (true for fresh web crawls, false for structured DB lookups)
  - payload (the actual raw response)

Your task: resolve discrepancies, merge the data, and produce a clean JSON
record describing the lead's company.

═══════════════════════════════════════════════════════════════════════════
CHRONOLOGICAL PRIORITY RULE — read carefully
═══════════════════════════════════════════════════════════════════════════
Structured database sources (Apollo, Clearbit, Hunter) hold ground-truth
firmographic data but their snapshots can be MONTHS stale. Brave Search
returns live web signals that are usually within minutes of being indexed.

Therefore:
  • If a LIVE textual signal (brave_search) is NEWER than a structured
    snapshot AND they disagree, the LIVE signal wins. Example:
       - apollo says: "Acme Corp · 50 employees"     (captured 2024-08)
       - brave finds: "Acme Corp announces layoffs to 30 employees" (2026-05)
       → company_size = "30" (the newer signal)
  • If structured sources agree with each other, prefer them over loose
    web text scraping.
  • If sources disagree and you cannot tell which is newer, prefer the
    most precise / specific value and note the conflict.

═══════════════════════════════════════════════════════════════════════════
OUTPUT CONTRACT
═══════════════════════════════════════════════════════════════════════════
Return ONLY a JSON object. No markdown fences. No preamble.

{
  "company_name":       string | null,    // canonical name
  "company_size":       string | null,    // e.g. "51-200" or "30 employees"
  "estimated_revenue":  string | null,    // e.g. "$10M-$50M ARR"
  "industry":           string | null,    // e.g. "B2B SaaS"
  "linkedin_url":       string | null,    // full URL or null
  "twitter_url":        string | null,    // full URL or null
  "tech_stack":         string[],         // array of identified tools, max 12
  "enrichment_summary": string,           // 2-4 sentence narrative, plain prose
  "conflicts_resolved": string[]          // brief notes on any chronological overrides
}

Be concise. Be honest about uncertainty. Empty array / null is acceptable.`

function buildMergeUserPrompt(lead: LeadRow, outcomes: ProviderOutcome[]): string {
  const blocks = outcomes.map(o => {
    return `─── ${o.provider} ─── (captured_at=${o.capturedAt}, is_live_signal=${o.isLiveSignal}, ok=${o.ok}${o.error ? `, error=${o.error}` : ''})
${JSON.stringify(o.payload, null, 2).slice(0, 6000)}`
  }).join('\n\n')

  return `LEAD: ${JSON.stringify({
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    existing_company_name: lead.company_name,
  })}

ENRICHMENT SOURCES (apply Chronological Priority Rule when merging):

${blocks}

Synthesize and return the JSON record per the OUTPUT CONTRACT.`
}

// ─── POST handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { workspaceId?: string; leadId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { workspaceId, leadId } = body
  if (!workspaceId || !leadId) {
    return NextResponse.json({ error: 'workspaceId and leadId are required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

  // ── 1. Atomic CAS lock: pending → enriching ─────────────────────────────
  // The WHERE predicate makes this race-safe. Two parallel enrich clicks on
  // the same lead → only one UPDATE actually changes the row. We re-read
  // afterwards to confirm we own the lock.
  await sql`
    UPDATE leads_captured
    SET enrichment_status = 'enriching'
    WHERE id = ${leadId} AND workspace_id = ${workspaceId} AND enrichment_status = 'pending'
  `
  const leadRes = await sql`
    SELECT id, workspace_id, name, email, phone, company_name, enrichment_status
    FROM leads_captured
    WHERE id = ${leadId} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  const lead = leadRes.rows[0] as unknown as LeadRow | undefined
  if (!lead) {
    return NextResponse.json({ error: 'Lead not found in this workspace' }, { status: 404 })
  }
  if (lead.enrichment_status !== 'enriching') {
    return NextResponse.json(
      {
        error: `Cannot enrich a lead with enrichment_status='${lead.enrichment_status}'.`,
        currentStatus: lead.enrichment_status,
        hint: lead.enrichment_status === 'enriching'
          ? 'A parallel request is already enriching this lead — wait and refresh.'
          : 'Reset enrichment_status to pending if you want to re-run.',
      },
      { status: 409 },
    )
  }

  // From this point on, any failure must reset the lead so the user can retry.
  const rollback = async (errMsg: string) => {
    try {
      await sql`
        UPDATE leads_captured
        SET enrichment_status = 'failed', enrichment_summary = ${errMsg.slice(0, 1000)}
        WHERE id = ${leadId} AND workspace_id = ${workspaceId}
      `
    } catch (e) { console.error('[enrich-lead] rollback failed', e) }
  }

  const startedAt = Date.now()

  try {
    // ── 2. Parallel Multi-Source Synthesis ────────────────────────────────
    // Promise.allSettled means a dead provider doesn't poison the others.
    const settled = await Promise.allSettled([
      timedProvider('brave_search', true, () => runBraveSearch(lead)),
      timedProvider('apollo', false, () => runApollo(lead)),
      timedProvider('clearbit', false, () => runClearbit(lead)),
      timedProvider('hunter', false, () => runHunter(lead)),
    ])
    const outcomes: ProviderOutcome[] = settled.map(s => {
      if (s.status === 'fulfilled') return s.value
      // timedProvider catches its own errors internally, so this branch is
      // extremely rare — but handle it for type-safety.
      return {
        provider: 'brave_search', ok: false, durationMs: 0,
        capturedAt: new Date().toISOString(), isLiveSignal: false, payload: {},
        error: 'unhandled rejection',
      }
    })

    // ── 3. Insert one enrichment_logs row per provider — even failures ────
    for (const o of outcomes) {
      try {
        await sql`
          INSERT INTO enrichment_logs (
            id, workspace_id, lead_id, provider_used, execution_time_ms,
            raw_response, created_at
          ) VALUES (
            ${newId()}, ${workspaceId}, ${leadId}, ${o.provider}, ${o.durationMs},
            ${JSON.stringify({ ok: o.ok, isLiveSignal: o.isLiveSignal, capturedAt: o.capturedAt, error: o.error, payload: o.payload }).slice(0, 32_000)},
            CURRENT_TIMESTAMP
          )
        `
      } catch (e) {
        console.error('[enrich-lead] enrichment_logs insert failed', o.provider, e)
      }
    }

    // If literally every provider returned empty payloads, skip the LLM call
    // entirely — there's nothing to merge and Claude would just hallucinate.
    const hasAnyData = outcomes.some(o => o.ok && Object.keys(o.payload).length > 0)
    if (!hasAnyData) {
      await rollback('No provider returned data. Configure at least one of BRAVE_SEARCH_API_KEY / APOLLO_API_KEY / CLEARBIT_API_KEY / HUNTER_API_KEY.')
      return NextResponse.json(
        {
          error: 'No enrichment data available from any provider',
          providers: outcomes.map(o => ({ provider: o.provider, ok: o.ok, durationMs: o.durationMs, error: o.error })),
        },
        { status: 422 },
      )
    }

    // ── 4. Claude merge with Chronological Priority Rule ──────────────────
    const merged = await runAgent<MergeResult>(
      MERGE_SYSTEM_PROMPT,
      buildMergeUserPrompt(lead, outcomes),
    )

    // ── 5. Persist merged fields + activity row ───────────────────────────
    const techStackJson = JSON.stringify(
      Array.isArray(merged.tech_stack) ? merged.tech_stack.slice(0, 20).map(String) : [],
    )
    await sql`
      UPDATE leads_captured SET
        enrichment_status   = 'completed',
        company_name        = COALESCE(${merged.company_name || null}, company_name),
        company_size        = COALESCE(${merged.company_size || null}, company_size),
        estimated_revenue   = COALESCE(${merged.estimated_revenue || null}, estimated_revenue),
        industry            = COALESCE(${merged.industry || null}, industry),
        linkedin_url        = COALESCE(${merged.linkedin_url || null}, linkedin_url),
        twitter_url         = COALESCE(${merged.twitter_url || null}, twitter_url),
        tech_stack          = ${techStackJson},
        enrichment_summary  = ${merged.enrichment_summary || ''}
      WHERE id = ${leadId} AND workspace_id = ${workspaceId}
    `

    // Timeline row — uses the Sprint-4 canonical activity_type column
    // alongside the legacy title field (which is NOT NULL in the existing schema).
    const activityId = newId()
    try {
      await sql`
        INSERT INTO lead_activities (
          id, workspace_id, lead_id, type, activity_type, title, description, metadata_json, created_at
        ) VALUES (
          ${activityId}, ${workspaceId}, ${leadId},
          'agent_enrichment', 'agent_enrichment',
          'AI enrichment completed',
          ${(merged.enrichment_summary || '').slice(0, 500)},
          ${JSON.stringify({
            providers: outcomes.map(o => ({ provider: o.provider, ok: o.ok, durationMs: o.durationMs })),
            conflicts_resolved: merged.conflicts_resolved || [],
            totalDurationMs: Date.now() - startedAt,
          }).slice(0, 8000)},
          CURRENT_TIMESTAMP
        )
      `
    } catch (e) {
      // Fallback for legacy installs where activity_type column hasn't migrated yet
      console.warn('[enrich-lead] activity insert with activity_type failed; falling back', e)
      try {
        await sql`
          INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, created_at)
          VALUES (${activityId}, ${workspaceId}, ${leadId}, 'agent_enrichment', 'AI enrichment completed', ${(merged.enrichment_summary || '').slice(0, 500)}, CURRENT_TIMESTAMP)
        `
      } catch (e2) {
        console.error('[enrich-lead] activity insert fully failed', e2)
      }
    }

    // Best-effort: fire the workflow trigger for downstream automations
    after(async () => {
      try {
        const base = process.env.NEXT_PUBLIC_BASE_URL || ''
        if (base) {
          await fetch(`${base}/api/workflows/trigger`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.ADMIN_SECRET ? { 'x-internal-secret': process.env.ADMIN_SECRET } : {}),
            },
            body: JSON.stringify({
              workspaceId, triggerType: 'lead_enriched',
              leadId, contactEmail: lead.email,
              data: { company_name: merged.company_name, industry: merged.industry },
            }),
          }).catch(() => undefined)
        }
      } catch { /* best-effort */ }
    })

    return NextResponse.json({
      ok: true,
      leadId,
      enrichment_status: 'completed',
      merged: {
        company_name: merged.company_name || null,
        company_size: merged.company_size || null,
        estimated_revenue: merged.estimated_revenue || null,
        industry: merged.industry || null,
        linkedin_url: merged.linkedin_url || null,
        twitter_url: merged.twitter_url || null,
        tech_stack: Array.isArray(merged.tech_stack) ? merged.tech_stack : [],
        enrichment_summary: merged.enrichment_summary || '',
        conflicts_resolved: merged.conflicts_resolved || [],
      },
      providers: outcomes.map(o => ({
        provider: o.provider, ok: o.ok, durationMs: o.durationMs,
        isLiveSignal: o.isLiveSignal, error: o.error,
      })),
      totalDurationMs: Date.now() - startedAt,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[enrich-lead] unexpected error', err)
    await rollback(msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
