/**
 * /api/agents/growth/optimizer — Sprint 16J (audit P1 #24)
 *
 * Reads recent post_metrics + brand_profile + memory context and produces
 * concrete content/timing/format recommendations. Closes the audit gap
 * where growth agents (hashtag, trend, engagement, influencer) generated
 * fresh strategy from a blank slate but no agent looked at what actually
 * worked in the user's existing posts.
 *
 * Symmetric with lib/agents/campaign-optimizer.ts which already exists for
 * paid campaigns — this is the organic-content equivalent.
 *
 *   POST { workspaceId, rangeDays?, platform? }
 *     → { artifactId, recommendations[] }
 *
 * Persists an `artifacts` row of type 'growth_optimization_report' so the
 * recommendation lives in the dashboard alongside other artifacts. Also
 * writes a `learning_notes` row so future content generators consult it
 * via getMemoryPromptBlock.
 *
 * Auth: workspace ownership + agent-run quota + memory injection.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { getMemoryPromptBlock } from '@/lib/tools/memory'

export const runtime = 'nodejs'

interface OptimizerRecommendation {
  insight: string             // what the data shows
  recommendation: string      // what to do about it
  priority: 'high' | 'medium' | 'low'
  estimatedImpact: string     // e.g. "2x engagement" or "+15% reach"
  targetPlatform?: string
}

interface OptimizerOutput {
  summary: string
  recommendations: OptimizerRecommendation[]
  topPerformingThemes: string[]
  underperformingThemes: string[]
}

const SYSTEM_PROMPT = `You are the Growth Optimizer agent for Ooumph.
You analyse recent post performance data and produce concrete, actionable
recommendations for the user's next 30 days of organic content.

Rules:
- Every recommendation must reference SPECIFIC numbers from the data.
- Priorities reflect impact, not effort.
- "estimatedImpact" must be a plain phrase the user can compare against.
- Themes must be derived from the post bodies/titles, not invented.
- Always respond with valid JSON matching the requested schema.`

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const body = await req.json()
    const { workspaceId, rangeDays = 30, platform } = body as {
      workspaceId?: string; rangeDays?: number; platform?: string
    }
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    runId = newId()
    await sql`
      INSERT INTO agent_runs (id, workspace_id, agent_name, status)
      VALUES (${runId}, ${workspaceId}, 'growth_optimizer', 'running')
    `

    // Pull recent per-post performance joined to artifact titles + types.
    const sinceIso = new Date(Date.now() - rangeDays * 24 * 3600_000).toISOString()
    const metricsRes = platform
      ? await sql`
          SELECT pm.platform, pm.impressions, pm.clicks, pm.likes, pm.comments, pm.shares,
                 pm.video_views, pm.followers_delta, pm.last_synced_at,
                 a.title, a.type, a.content_json
          FROM post_metrics pm
          LEFT JOIN artifacts a ON a.id = pm.artifact_id
          WHERE pm.workspace_id = ${workspaceId}
            AND pm.platform = ${platform}
            AND pm.last_synced_at >= ${sinceIso}
          ORDER BY pm.last_synced_at DESC LIMIT 100
        `
      : await sql`
          SELECT pm.platform, pm.impressions, pm.clicks, pm.likes, pm.comments, pm.shares,
                 pm.video_views, pm.followers_delta, pm.last_synced_at,
                 a.title, a.type, a.content_json
          FROM post_metrics pm
          LEFT JOIN artifacts a ON a.id = pm.artifact_id
          WHERE pm.workspace_id = ${workspaceId} AND pm.last_synced_at >= ${sinceIso}
          ORDER BY pm.last_synced_at DESC LIMIT 100
        `
    const metrics = metricsRes.rows as Record<string, unknown>[]

    // Brand profile + memory context for prompt enrichment.
    const brandRes = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandRes.rows[0] as Record<string, unknown> | undefined
    const memoryBlock = await getMemoryPromptBlock(workspaceId, { maxNotes: 6, maxVoiceExamples: 0 })

    if (metrics.length === 0) {
      // Honest empty-state — don't fabricate insights from zero data.
      await sql`UPDATE agent_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
      return NextResponse.json({
        ok: true,
        runId,
        recommendations: [],
        message: `No post_metrics rows in the last ${rangeDays} days. Connect a platform and publish to start collecting data.`,
      })
    }

    // Compact aggregate for the prompt — full 100 rows would be too much.
    const summarise = metrics.slice(0, 30).map(m => {
      const eng = Number(m.likes || 0) + Number(m.comments || 0) + Number(m.shares || 0)
      const impr = Number(m.impressions || 0)
      const rate = impr > 0 ? (eng / impr * 100).toFixed(2) : '—'
      return `[${m.platform || '?'}] "${(m.title as string)?.slice(0, 60) || '(untitled)'}" · imp=${impr} · eng=${eng} (${rate}%) · followers Δ=${m.followers_delta || 0}`
    }).join('\n')

    const userPrompt = `Analyse this performance data and produce growth recommendations.

BRAND CONTEXT:
- Business: ${brand?.business_name || 'unknown'}
- Industry: ${brand?.industry || 'unknown'}
- Target audience: ${brand?.target_audience || 'unknown'}
- Tone: ${brand?.tone || 'unknown'}
- Channels: ${brand?.channels || 'unknown'}
${memoryBlock ? `\n${memoryBlock}\n` : ''}
RECENT POST PERFORMANCE (last ${rangeDays} days, ${metrics.length} posts):
${summarise}

OUTPUT SCHEMA:
{
  "summary": "string (2-3 sentences)",
  "recommendations": [
    { "insight": "...", "recommendation": "...", "priority": "high|medium|low", "estimatedImpact": "...", "targetPlatform": "..." }
  ],
  "topPerformingThemes": ["..."],
  "underperformingThemes": ["..."]
}

Provide 5-10 recommendations ordered by priority. Be specific.`

    const output = await runAgent<OptimizerOutput>(SYSTEM_PROMPT, userPrompt)

    // Persist the artifact + completion + learning note.
    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
      VALUES (
        ${artifactId}, ${workspaceId}, ${runId},
        'growth_optimization_report',
        ${'Growth optimizer — ' + new Date().toLocaleDateString()},
        ${JSON.stringify(output)}
      )
    `
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`
    await sql`
      UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(output)}, completed_at = CURRENT_TIMESTAMP
      WHERE id = ${runId}
    `
    // Write top insights as learning notes so future content generators
    // benefit from this run's discoveries via getMemoryPromptBlock.
    try {
      const noteText = `Growth optimizer insights (${rangeDays}d): ` +
        (output.topPerformingThemes || []).slice(0, 3).join(' · ') +
        '. Top reco: ' +
        ((output.recommendations || [])[0]?.recommendation || '').slice(0, 240)
      await sql`
        INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
        VALUES (${newId()}, ${workspaceId}, 'growth_optimizer', ${artifactId}, ${noteText}, 0.85)
      `
    } catch { /* non-fatal */ }

    return NextResponse.json({ ok: true, runId, artifactId, ...output })
  } catch (err) {
    if (runId) {
      await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error_message = ${String(err).slice(0, 500)} WHERE id = ${runId}`
        .catch(() => undefined)
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([])
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  const rows = await sql`
    SELECT id, title, content_json, created_at
    FROM artifacts
    WHERE workspace_id = ${workspaceId} AND type = 'growth_optimization_report'
    ORDER BY created_at DESC LIMIT 10
  `
  return NextResponse.json(rows.rows)
}
