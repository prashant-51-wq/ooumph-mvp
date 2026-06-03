/**
 * lib/decompose-strategy.ts
 *
 * The "Then What?" engine. After a Strategy artifact is approved, the CMO
 * parses it into concrete execution tasks and dispatches each to the right
 * sub-agent. This is what closes the loop between strategic planning and
 * autonomous execution.
 *
 * ─── Lifecycle ──────────────────────────────────────────────────────────
 *   1. CMO calls Claude → JSON array of { agent, task_type, task_brief }
 *   2. INSERT each into project_tasks with status='pending'
 *   3. Return the inserted tasks to the caller (so the API can respond fast)
 *   4. In the background (after() in the calling route):
 *        - dispatch each task's agent via fetch with admin secret
 *        - update the task row as runs progress: running → completed
 *        - link produced_artifact_id when sub-agent saves an artifact
 *
 * ─── Concurrency policy ─────────────────────────────────────────────────
 *   Tasks are dispatched in chunks of 3 to avoid:
 *     - Anthropic per-org rate limits (rough limit: ~5 concurrent reqs)
 *     - Vercel function memory pressure
 *     - Cascading timeouts on sub-agent calls
 */

import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import type { BrandProfile } from '@/types'

// ─── Public types ─────────────────────────────────────────────────────────

export interface ProjectTask {
  id: string
  workspace_id: string
  initiative_run_id: string
  parent_artifact_id: string
  task_index: number
  agent: string
  task_type: string
  task_brief: string
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed'
  agent_run_id: string | null
  produced_artifact_id: string | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

// ─── Agent → sub-agent route mapping ─────────────────────────────────────
// Each task gets dispatched to one of these routes. The brief is passed
// through the body so the agent has context. Routes that don't accept a
// brief field still work — they fall back to brand-profile-only generation.

const TASK_AGENT_ROUTES: Record<string, { route: string; bodyKey?: string }> = {
  social:     { route: '/api/agents/content',          bodyKey: 'topic' },
  copywriter: { route: '/api/agents/content',          bodyKey: 'topic' },
  email:      { route: '/api/agents/email-marketing',  bodyKey: 'goal' },
  blog:       { route: '/api/agents/content/blog',     bodyKey: 'topic' },
  ads:        { route: '/api/agents/ads/generate',     bodyKey: 'brief' },
  creative:   { route: '/api/agents/creative/static-post', bodyKey: 'concept' },
  video:      { route: '/api/agents/creative/video-generator', bodyKey: 'concept' },
  pr:         { route: '/api/agents/pr',               bodyKey: 'angle' },
  content:    { route: '/api/agents/content',          bodyKey: 'topic' },
}

const VALID_AGENTS = Object.keys(TASK_AGENT_ROUTES)

// ─── Decomposition prompt ────────────────────────────────────────────────

const DECOMPOSE_SYSTEM_PROMPT = `You are the AI CMO breaking an approved marketing strategy into concrete execution tasks for autonomous sub-agents.

You have access to these sub-agents:
- social       → drafts a single social media post (LinkedIn / Twitter / Instagram)
- copywriter   → writes ad headlines, CTAs, microcopy
- email        → designs a full email campaign (subject + body)
- blog         → writes a long-form blog post or article
- ads          → writes paid ad copy variants for Meta / Google / LinkedIn
- creative     → generates a visual content brief (image / static post design)
- video        → drafts a short video script + scene breakdown
- pr           → writes a press release or media pitch

Output 5–10 specific, actionable tasks. Each task must:
1. Be assigned to EXACTLY ONE agent from the list above
2. Reference a concrete deliverable from the strategy (a tactic, a channel mentioned, a KPI to support)
3. Include a self-contained brief that the sub-agent can execute without re-reading the strategy

Return ONLY valid JSON, no markdown fences. Schema:
{
  "tasks": [
    {
      "agent": "social",
      "task_type": "social_post",
      "task_brief": "Draft a LinkedIn post announcing our SaaS founder community for product leaders. Hook: 'Most product roadmaps die in feature factories.' CTA: invite to the community. Tone: bold, direct."
    }
  ]
}

The task_type should be one of: social_post | ad_copy | email_campaign | blog_post | video_script | press_release | visual_concept`

interface DecomposedTask {
  agent: string
  task_type: string
  task_brief: string
}

interface DecompositionResult {
  tasks: DecomposedTask[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch { /* ignore */ }
  }
  return {}
}

function buildBrandContext(brand: BrandProfile | undefined): string {
  if (!brand) return ''
  const lines = [
    brand.business_name && `Business: ${brand.business_name}`,
    brand.offer && `Offer: ${brand.offer}`,
    brand.target_audience && `Target audience: ${brand.target_audience}`,
    brand.tone && `Tone: ${brand.tone}`,
    brand.channels && `Channels: ${brand.channels}`,
  ]
  return lines.filter(Boolean).join('\n')
}

/**
 * Walks the parent_run_id chain to find the topmost (initiative) run.
 * If the supplied runId already has parent_run_id IS NULL, returns it as-is.
 */
async function resolveInitiativeRunId(agentRunId: string): Promise<string> {
  let current = agentRunId
  // Cap traversal to 10 hops as a safety against malformed loops
  for (let i = 0; i < 10; i++) {
    const res = await sql`SELECT id, parent_run_id FROM agent_runs WHERE id = ${current} LIMIT 1`
    const row = res.rows[0] as { id?: string; parent_run_id?: string | null } | undefined
    if (!row) return current
    if (!row.parent_run_id) return row.id || current
    current = row.parent_run_id
  }
  return current
}

// ─── Main entry point ────────────────────────────────────────────────────

export interface DecomposeOptions {
  workspaceId: string
  artifactId: string
  /** Optional — if omitted, derived from the artifact's agent_run_id. */
  initiativeRunId?: string
}

export interface DecomposeOutcome {
  tasks: ProjectTask[]
  initiativeRunId: string
}

/**
 * Decompose an approved strategy artifact into project_tasks rows.
 * Returns the inserted tasks. Dispatch is left to the caller (see
 * `dispatchPendingTasks` below) so the API can return fast.
 */
export async function decomposeStrategyArtifact(
  opts: DecomposeOptions,
): Promise<DecomposeOutcome> {
  const { workspaceId, artifactId } = opts

  // ─── Load artifact + brand ──────────────────────────────────────────
  const [artRes, brandRes] = await Promise.all([
    sql`SELECT id, type, title, content_json, agent_run_id FROM artifacts WHERE id = ${artifactId} AND workspace_id = ${workspaceId} LIMIT 1`,
    sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
  ])
  const artifact = artRes.rows[0] as {
    id?: string
    type?: string
    title?: string
    content_json?: string | Record<string, unknown>
    agent_run_id?: string | null
  } | undefined
  if (!artifact?.id) throw new Error(`Artifact ${artifactId} not found in workspace`)
  if (artifact.type !== 'strategy') {
    throw new Error(`decomposeStrategyArtifact only accepts strategy artifacts (got type='${artifact.type}')`)
  }

  const brand = brandRes.rows[0] as unknown as BrandProfile | undefined
  const brandContext = buildBrandContext(brand)

  // Resolve initiative run id — the topmost agent_run in this artifact's lineage
  const initiativeRunId = opts.initiativeRunId
    || (artifact.agent_run_id ? await resolveInitiativeRunId(artifact.agent_run_id) : artifactId)

  // ─── Compose the prompt ─────────────────────────────────────────────
  const content = asObject(artifact.content_json)
  const strategyDigest = JSON.stringify(content, null, 2).slice(0, 6000)

  const userPrompt = `${brandContext ? `Brand context:\n${brandContext}\n\n` : ''}Approved strategy:\n${strategyDigest}\n\nDecompose the above into 5–10 execution tasks now. Return ONLY the JSON object specified.`

  // ─── Call Claude ───────────────────────────────────────────────────
  const result = await runAgent<DecompositionResult>(DECOMPOSE_SYSTEM_PROMPT, userPrompt, workspaceId)
  const rawTasks = Array.isArray(result.tasks) ? result.tasks : []

  if (rawTasks.length === 0) {
    throw new Error('Decomposition produced no tasks — strategy may be too thin')
  }

  // ─── Validate + persist tasks ───────────────────────────────────────
  const inserted: ProjectTask[] = []
  let idx = 0
  for (const raw of rawTasks.slice(0, 12)) {  // cap at 12 to avoid runaway
    if (!raw || typeof raw !== 'object') continue
    const agent = String(raw.agent || '').toLowerCase().trim()
    const taskType = String(raw.task_type || '').toLowerCase().trim()
    const taskBrief = String(raw.task_brief || '').trim()

    if (!agent || !taskType || !taskBrief) continue
    if (!VALID_AGENTS.includes(agent)) {
      // Skip unknown agents rather than fail the whole decomposition.
      console.warn(`[decompose] skipping task with unknown agent '${agent}'`)
      continue
    }

    const id = newId()
    const now = new Date().toISOString()
    await sql`
      INSERT INTO project_tasks (
        id, workspace_id, initiative_run_id, parent_artifact_id,
        task_index, agent, task_type, task_brief, status, created_at
      ) VALUES (
        ${id}, ${workspaceId}, ${initiativeRunId}, ${artifactId},
        ${idx}, ${agent}, ${taskType}, ${taskBrief}, ${'pending'}, ${now}
      )
    `
    inserted.push({
      id,
      workspace_id: workspaceId,
      initiative_run_id: initiativeRunId,
      parent_artifact_id: artifactId,
      task_index: idx,
      agent,
      task_type: taskType,
      task_brief: taskBrief,
      status: 'pending',
      agent_run_id: null,
      produced_artifact_id: null,
      error_message: null,
      created_at: now,
      started_at: null,
      completed_at: null,
    })
    idx++
  }

  if (inserted.length === 0) {
    throw new Error('All decomposed tasks were invalid — none persisted')
  }

  return { tasks: inserted, initiativeRunId }
}

// ─── Dispatch helpers ────────────────────────────────────────────────────

/**
 * Fire a single task to its agent route. Updates the project_tasks row as
 * the call progresses: pending → running → (completed | failed).
 *
 * Best-effort: failure is recorded on the task row, never thrown.
 */
async function dispatchOneTask(task: ProjectTask, baseUrl: string): Promise<void> {
  const route = TASK_AGENT_ROUTES[task.agent]
  if (!route) {
    await sql`
      UPDATE project_tasks
      SET status = 'failed', error_message = ${`Unknown agent: ${task.agent}`}, completed_at = ${new Date().toISOString()}
      WHERE id = ${task.id}
    `
    return
  }

  // Track timestamps so the UI can show real durations.
  const startedAt = new Date().toISOString()
  await sql`UPDATE project_tasks SET status = 'running', started_at = ${startedAt} WHERE id = ${task.id}`

  // Capture the freshest-artifact timestamp before the call so we can
  // discover what the sub-agent produced.
  const beforeISO = new Date(Date.now() - 500).toISOString()

  try {
    const bodyPayload: Record<string, unknown> = {
      workspaceId: task.workspace_id,
      parentRunId: task.initiative_run_id,
    }
    // Set the brief field under whichever key the route expects
    if (route.bodyKey) bodyPayload[route.bodyKey] = task.task_brief
    // Also set common alias keys so loosely-defined routes pick it up
    bodyPayload.brief = task.task_brief
    bodyPayload.goal = task.task_brief
    bodyPayload.context = { brief: task.task_brief }

    const res = await fetch(`${baseUrl}${route.route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ADMIN_SECRET ? { 'x-internal-secret': process.env.ADMIN_SECRET } : {}),
      },
      body: JSON.stringify(bodyPayload),
    })

    if (!res.ok) {
      let errMsg = `${res.status} ${res.statusText}`
      try {
        const body = await res.json() as { error?: string }
        if (body.error) errMsg = body.error
      } catch { /* ignore */ }
      await sql`
        UPDATE project_tasks
        SET status = 'failed', error_message = ${errMsg.slice(0, 500)}, completed_at = ${new Date().toISOString()}
        WHERE id = ${task.id}
      `
      return
    }

    // Sub-agent succeeded. Find the artifact it produced (freshest in this
    // workspace since we kicked off the call).
    const artRes = await sql`
      SELECT id FROM artifacts
      WHERE workspace_id = ${task.workspace_id}
        AND created_at >= ${beforeISO}
      ORDER BY created_at DESC
      LIMIT 1
    `
    const producedArtifactId = (artRes.rows[0] as { id?: string } | undefined)?.id || null

    await sql`
      UPDATE project_tasks
      SET status = 'completed',
          produced_artifact_id = ${producedArtifactId},
          completed_at = ${new Date().toISOString()}
      WHERE id = ${task.id}
    `
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await sql`
      UPDATE project_tasks
      SET status = 'failed', error_message = ${errMsg.slice(0, 500)}, completed_at = ${new Date().toISOString()}
      WHERE id = ${task.id}
    `
  }
}

/**
 * Dispatch a list of pending tasks. Tasks are run in chunks (default 3) to
 * stay within Anthropic rate limits and Vercel function pressure.
 *
 * Each task's progress is reflected in the project_tasks row in real time,
 * so a polling client can show a live task board.
 */
export async function dispatchPendingTasks(
  tasks: ProjectTask[],
  baseUrl: string,
  chunkSize = 3,
): Promise<void> {
  for (let i = 0; i < tasks.length; i += chunkSize) {
    const chunk = tasks.slice(i, i + chunkSize)
    await Promise.allSettled(chunk.map(t => dispatchOneTask(t, baseUrl)))
  }
}
