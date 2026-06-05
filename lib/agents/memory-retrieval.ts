/**
 * lib/agents/memory-retrieval.ts — Sprint 1
 *
 * Pragmatic, deterministic Postgres-based agent memory.
 *
 * The architectural audit identified a closed-loop gap: brand_memory,
 * post_metrics, email_campaigns, and ad_campaigns all WRITE successfully,
 * but no agent SELECTs from them before generation. This module is the
 * single retrieval surface every agent uses to inject historical signal
 * into its system prompt window.
 *
 * Scope contract (locked beta backlog)
 * ------------------------------------
 *  • No vector DB. No embeddings. No semantic similarity.
 *  • Plain SQL with composite indexes (Sprint 20P added the needed ones).
 *  • Deterministic ordering: top-N by engagement / CTR / recency.
 *  • Always returns a string ready for prompt injection — never throws.
 *  • Day-one workspaces get an honest "no signal yet" sentence so the
 *    LLM treats them as greenfield instead of fabricating fake history.
 *
 * Telemetry
 * ---------
 * Every injection records an immutable agent_run_events row with
 * event_type='memory_injected' so we can prove (via DB query, not vibes)
 * that the agent read past data before each generation. The payload
 * captures the SHA-256 hash + source list + byte count of the exact
 * string passed into the LLM. Reproducibility + audit in one row.
 *
 * Usage pattern
 * -------------
 *   const matrix = await buildMemoryMatrix(workspaceId)
 *   const systemPrompt = `${BASE_SYSTEM_PROMPT}\n\n${matrix.matrix}`
 *   const result = await runAgent(systemPrompt, userPrompt, ...)
 *   await logMemoryInjection({ workspaceId, agentRunId, agent: 'content', matrix })
 */

import { sql } from '@/lib/db'
import crypto from 'crypto'

// ─── Empty-state sentinels ──────────────────────────────────────────────
//
// These are emitted verbatim into the prompt when a workspace has no
// historical signal yet. We deliberately tell the LLM "this is greenfield"
// so it doesn't hallucinate past wins to fill the void.

const EMPTY_WINNERS =
  'Past performance signals: None recorded yet. This is a day-one workspace canvas — generate without reference to historical winners.'

const EMPTY_VOICE =
  'Brand voice rules: None curated yet. Default to a neutral professional tone until the brand profile is filled in.'

const EMPTY_CAMPAIGN =
  'Active campaigns: None running. Greenfield generation — no in-flight initiatives to coordinate with.'

// ─── Helper #1: top performers across social + email ───────────────────

/**
 * Pulls the top-`limit` highest-performing artifacts from the last 30d:
 *   1. Social posts ranked by composite engagement (likes+comments+shares)
 *   2. Email campaigns ranked by click-through rate
 *
 * Both lists are merged into a single formatted string. The LLM gets
 * concrete numbers, not vague "remember to do good content" filler.
 */
export async function getRecentWinners(workspaceId: string, limit = 3): Promise<string> {
  try {
    const posts = await sql`
      SELECT
        a.title,
        pm.platform,
        (COALESCE(pm.likes, 0) + COALESCE(pm.comments, 0) + COALESCE(pm.shares, 0)) AS engagement,
        pm.impressions
      FROM post_metrics pm
      JOIN artifacts a ON a.id = pm.artifact_id
      WHERE pm.workspace_id = ${workspaceId}
        AND pm.last_synced_at > NOW() - INTERVAL '30 days'
      ORDER BY engagement DESC NULLS LAST
      LIMIT ${limit}
    `

    const emails = await sql`
      SELECT
        COALESCE(subject, name) AS subject,
        sent_count,
        click_count,
        CASE
          WHEN sent_count > 0 THEN (click_count::float / sent_count::float)
          ELSE 0
        END AS ctr
      FROM email_campaigns
      WHERE workspace_id = ${workspaceId}
        AND sent_at > NOW() - INTERVAL '30 days'
        AND sent_count > 0
      ORDER BY ctr DESC
      LIMIT ${limit}
    `

    if (posts.rows.length === 0 && emails.rows.length === 0) {
      return EMPTY_WINNERS
    }

    const lines: string[] = ['Past 30-day performance signals (use these as style + topic reference):']

    if (posts.rows.length > 0) {
      lines.push('• Top social posts by engagement:')
      posts.rows.forEach((p, i) => {
        const eng = Number((p as { engagement?: number }).engagement || 0)
        const plat = String((p as { platform?: string }).platform || 'unknown')
        const title = String((p as { title?: string }).title || '(untitled)').slice(0, 90)
        lines.push(`  ${i + 1}. [${plat}] "${title}" — ${eng} engagement`)
      })
    }

    if (emails.rows.length > 0) {
      lines.push('• Top email campaigns by click-through rate:')
      emails.rows.forEach((e, i) => {
        const ctrPct = (Number((e as { ctr?: number }).ctr || 0) * 100).toFixed(1)
        const sent = Number((e as { sent_count?: number }).sent_count || 0)
        const subject = String((e as { subject?: string }).subject || '(no subject)').slice(0, 90)
        lines.push(`  ${i + 1}. "${subject}" — ${ctrPct}% CTR (${sent} sent)`)
      })
    }

    return lines.join('\n')
  } catch {
    return EMPTY_WINNERS
  }
}

// ─── Helper #2: brand voice rules ──────────────────────────────────────

/**
 * Combines static brand profile fields (tone, audience, do-not-claim
 * list) with curated voice corrections from brand_memory. The
 * brand_memory rows are filtered to voice-relevant content_types and
 * ranked by their `performance_score` so corrections that paid off
 * outrank generic notes.
 */
export async function getBrandVoiceSamples(workspaceId: string): Promise<string> {
  try {
    const brand = await sql`
      SELECT tone, unique_value, prohibited_claims, target_audience, business_name
      FROM brand_profiles
      WHERE workspace_id = ${workspaceId}
      LIMIT 1
    `

    const voiceRows = await sql`
      SELECT content, content_type, performance_score
      FROM brand_memory
      WHERE workspace_id = ${workspaceId}
        AND content_type IN ('brand_voice', 'tone_rule', 'voice_correction', 'recent_winners')
      ORDER BY performance_score DESC NULLS LAST, created_at DESC
      LIMIT 5
    `

    const row = brand.rows[0] as
      | {
          tone?: string
          unique_value?: string
          prohibited_claims?: string
          target_audience?: string
          business_name?: string
        }
      | undefined

    if (!row && voiceRows.rows.length === 0) {
      return EMPTY_VOICE
    }

    const lines: string[] = ['Brand voice + guideline matrix:']
    if (row?.business_name) lines.push(`• Brand: ${String(row.business_name).slice(0, 100)}`)
    if (row?.tone) lines.push(`• Tone: ${String(row.tone).slice(0, 200)}`)
    if (row?.target_audience) lines.push(`• Target audience: ${String(row.target_audience).slice(0, 200)}`)
    if (row?.unique_value) lines.push(`• Unique value proposition: ${String(row.unique_value).slice(0, 200)}`)
    if (row?.prohibited_claims) {
      lines.push(`• Do NOT claim: ${String(row.prohibited_claims).slice(0, 200)}`)
    }

    if (voiceRows.rows.length > 0) {
      lines.push('• Curated voice corrections + rules (ranked by performance):')
      voiceRows.rows.forEach((r, i) => {
        const content = String((r as { content?: string }).content || '').slice(0, 180)
        const t = String((r as { content_type?: string }).content_type || 'note')
        lines.push(`  ${i + 1}. [${t}] ${content}`)
      })
    }

    return lines.join('\n')
  } catch {
    return EMPTY_VOICE
  }
}

// ─── Helper #3: live campaign state ────────────────────────────────────

/**
 * What's actually running in this workspace right now:
 *   • Active ad campaigns (deploying or active status)
 *   • Pending scheduled content + the next-up timestamp
 *
 * Lets the LLM coordinate (e.g. don't suggest a giveaway when a
 * giveaway is already scheduled for tomorrow).
 */
export async function getCampaignContext(workspaceId: string): Promise<string> {
  try {
    const ads = await sql`
      SELECT name, status, platform, daily_budget
      FROM ad_campaigns
      WHERE workspace_id = ${workspaceId}
        AND status IN ('active', 'deploying')
      ORDER BY created_at DESC
      LIMIT 5
    `

    const scheduledCountRes = await sql`
      SELECT COUNT(*)::int AS count
      FROM scheduled_content
      WHERE workspace_id = ${workspaceId}
        AND status = 'pending'
    `
    const scheduledCount = Number((scheduledCountRes.rows[0] as { count?: number } | undefined)?.count || 0)

    if (ads.rows.length === 0 && scheduledCount === 0) {
      return EMPTY_CAMPAIGN
    }

    const lines: string[] = ['Live campaign state:']

    if (ads.rows.length > 0) {
      lines.push(`• ${ads.rows.length} active ad campaign${ads.rows.length === 1 ? '' : 's'}:`)
      ads.rows.forEach((a, i) => {
        const r = a as { name?: string; status?: string; platform?: string; daily_budget?: number }
        const budget = r.daily_budget && Number(r.daily_budget) > 0 ? `$${(Number(r.daily_budget) / 100).toFixed(2)}/day` : 'no budget set'
        lines.push(`  ${i + 1}. [${r.platform || 'unknown'}] "${String(r.name || '').slice(0, 80)}" — ${r.status}, ${budget}`)
      })
    }

    if (scheduledCount > 0) {
      lines.push(`• ${scheduledCount} scheduled post${scheduledCount === 1 ? '' : 's'} pending in the publish queue`)
    }

    return lines.join('\n')
  } catch {
    return EMPTY_CAMPAIGN
  }
}

// ─── Memory matrix builder ─────────────────────────────────────────────

export interface MemoryMatrix {
  /** Formatted block ready to inject directly into a system prompt. */
  matrix: string
  /** SHA-256 of `matrix` — proves which exact content reached the LLM. */
  hash: string
  /** Which retrieval helpers contributed. */
  sources: Array<'recent_winners' | 'brand_voice' | 'campaign_context'>
  /** UTF-8 byte length, for prompt-budget accounting. */
  sizeBytes: number
}

const MATRIX_HEADER = '═══ SYSTEM MEMORY & PAST LEARNINGS MATRIX ═══'
const MATRIX_FOOTER = '═══ END MEMORY MATRIX ═══'

/**
 * Concurrent-fetch the three retrieval helpers, wrap them in the
 * canonical block, hash the result.
 */
export async function buildMemoryMatrix(workspaceId: string): Promise<MemoryMatrix> {
  const [winners, voice, campaign] = await Promise.all([
    getRecentWinners(workspaceId),
    getBrandVoiceSamples(workspaceId),
    getCampaignContext(workspaceId),
  ])

  const matrix = [
    MATRIX_HEADER,
    '',
    '[1] Past performance signals',
    winners,
    '',
    '[2] Brand voice + guideline matrix',
    voice,
    '',
    '[3] Live campaign state',
    campaign,
    '',
    MATRIX_FOOTER,
  ].join('\n')

  const hash = crypto.createHash('sha256').update(matrix).digest('hex')

  return {
    matrix,
    hash,
    sources: ['recent_winners', 'brand_voice', 'campaign_context'],
    sizeBytes: Buffer.byteLength(matrix, 'utf8'),
  }
}

// ─── Immutable audit trail: memory_injected event ──────────────────────

/**
 * Record an agent_run_events row proving the matrix above was injected
 * into the LLM call. Caller passes the originating agent_run_id so the
 * row is linked back to the same run.
 *
 * Failure is silent on purpose — the agent's primary job is to
 * generate, not to log. If telemetry write fails (DB blip), the
 * generation still proceeds.
 */
export async function logMemoryInjection(opts: {
  workspaceId: string
  agentRunId: string
  agent: string
  matrix: MemoryMatrix
}): Promise<void> {
  try {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const payload = JSON.stringify({
      agent: opts.agent,
      hash: opts.matrix.hash,
      sources: opts.matrix.sources,
      sizeBytes: opts.matrix.sizeBytes,
      ts: new Date().toISOString(),
    })
    await sql`
      INSERT INTO agent_run_events (id, agent_run_id, workspace_id, event_type, payload, created_at)
      VALUES (${id}, ${opts.agentRunId}, ${opts.workspaceId}, 'memory_injected', ${payload}, NOW())
    `
  } catch (err) {
    console.warn('[memory] logMemoryInjection failed (non-fatal):', err instanceof Error ? err.message : String(err))
  }
}
