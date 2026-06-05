/**
 * /api/agents/[name]/config — Sprint 2 Commit 2
 *
 *   GET    ?workspaceId=…   → current config row (or defaults if unconfigured)
 *   PATCH  { workspaceId, ...fields } → upsert config row
 *
 * This is the endpoint the Agents page's "Save Configuration" button talks
 * to. It writes to `agent_configs` (pre-existing table), NOT to the new
 * `agents` table — they're intentionally split:
 *
 *   agents         - lifecycle (status, paused_at, paused_by)
 *   agent_configs  - configuration (model, instructions, tone, allowed_tools,
 *                    schedule, daily_cost_cap, etc.)
 *
 * Keeping them separate means an operator can pause an agent without
 * losing its config, and an admin can rewrite an agent's config without
 * accidentally clobbering its paused state.
 *
 * agent_configs schema (from lib/db.ts):
 *   id, workspace_id, agent_slug, model, instructions, tone,
 *   max_tasks_per_day, priority, allowed_tools, use_byok, schedule,
 *   daily_cost_cap, escalate_to, status, updated_at
 *
 * Note that agent_configs also has a `status` column but it's distinct
 * from `agents.status` — it's used by the table's own row-archive flow.
 * We don't touch it from this endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { DEFAULT_AGENTS } from '@/lib/agents'

export const runtime = 'nodejs'

interface RouteCtx {
  params: Promise<{ name: string }>
}

interface AgentConfigRow {
  id: string
  workspace_id: string
  agent_slug: string
  model: string | null
  instructions: string | null
  tone: string | null
  max_tasks_per_day: number | null
  priority: string | null
  allowed_tools: string | string[] | null   // JSON string on SQLite path, parsed array on PG
  use_byok: number | null
  schedule: string | null
  daily_cost_cap: number | null
  escalate_to: string | null
  status: string | null
  updated_at: string | null
}

interface ConfigPatch {
  workspaceId?: string
  model?: string | null
  instructions?: string | null
  tone?: string | null
  maxTasksPerDay?: number | null
  priority?: string | null
  allowedTools?: string[] | null
  useByok?: boolean | null
  schedule?: string | null
  dailyCostCap?: number | null
  escalateTo?: string | null
}

const KNOWN_AGENT_SLUGS = new Set(DEFAULT_AGENTS.map(a => a.name))

/** Coerce allowed_tools to a string array regardless of which engine
 *  returned it (SQLite stringifies JSON columns; lib/db.parseJsonFields
 *  auto-parses on the Postgres path). */
function normalizeAllowedTools(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string')
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string')
    } catch { /* fall through */ }
  }
  return []
}

/** Convert a DB row to the API shape (parsed allowedTools, JS booleans). */
function rowToApi(row: AgentConfigRow) {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    agent_slug: row.agent_slug,
    model: row.model,
    instructions: row.instructions,
    tone: row.tone,
    max_tasks_per_day: row.max_tasks_per_day,
    priority: row.priority,
    allowed_tools: normalizeAllowedTools(row.allowed_tools),
    // use_byok is stored as INTEGER (1/0) in SQLite and as INTEGER in Postgres
    // via use_byok DEFAULT 1. NULL is treated as the default (true). Anything
    // truthy that isn't 0 also reads as true.
    use_byok: row.use_byok == null ? true : Number(row.use_byok) === 1,
    schedule: row.schedule,
    daily_cost_cap: row.daily_cost_cap == null ? null : Number(row.daily_cost_cap),
    escalate_to: row.escalate_to,
    status: row.status,
    updated_at: row.updated_at,
  }
}

// ─── GET (read current config, or defaults if unconfigured) ───────────────────

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { name } = await ctx.params
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const r = await sql`
    SELECT id, workspace_id, agent_slug, model, instructions, tone, max_tasks_per_day,
           priority, allowed_tools, use_byok, schedule, daily_cost_cap, escalate_to,
           status, updated_at
    FROM agent_configs
    WHERE workspace_id = ${workspaceId} AND agent_slug = ${name}
    LIMIT 1
  `
  const row = r.rows[0] as unknown as AgentConfigRow | undefined

  // Unconfigured but recognized agent → return defaults rather than 404 so
  // the UI's config form renders without special-casing missing rows.
  if (!row) {
    if (KNOWN_AGENT_SLUGS.has(name)) {
      return NextResponse.json({
        id: null,
        workspace_id: workspaceId,
        agent_slug: name,
        model: null,
        instructions: null,
        tone: null,
        max_tasks_per_day: 100,
        priority: 'normal',
        allowed_tools: [],
        use_byok: true,
        schedule: 'always',
        daily_cost_cap: 50,
        escalate_to: null,
        status: 'active',
        updated_at: null,
        unconfigured: true,
      })
    }
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  return NextResponse.json(rowToApi(row))
}

// ─── PATCH (upsert config) ────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const { name } = await ctx.params
    const body = await req.json() as ConfigPatch
    const { workspaceId } = body

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    if (!KNOWN_AGENT_SLUGS.has(name)) {
      return NextResponse.json({ error: `Unknown agent '${name}'` }, { status: 404 })
    }

    // Validate optional numeric / enum fields when supplied.
    if (body.maxTasksPerDay != null) {
      const n = Number(body.maxTasksPerDay)
      if (!Number.isFinite(n) || n < 0 || n > 10000) {
        return NextResponse.json({ error: 'maxTasksPerDay must be 0..10000' }, { status: 400 })
      }
    }
    if (body.priority != null && !['low', 'normal', 'high', 'critical'].includes(body.priority)) {
      return NextResponse.json({ error: "priority must be one of: low, normal, high, critical" }, { status: 400 })
    }
    if (body.dailyCostCap != null) {
      const n = Number(body.dailyCostCap)
      if (!Number.isFinite(n) || n < 0 || n > 100000) {
        return NextResponse.json({ error: 'dailyCostCap must be 0..100000' }, { status: 400 })
      }
    }
    if (body.allowedTools != null && !Array.isArray(body.allowedTools)) {
      return NextResponse.json({ error: 'allowedTools must be a string array' }, { status: 400 })
    }

    const allowedToolsJson = body.allowedTools != null ? JSON.stringify(body.allowedTools) : null
    const useByokInt = body.useByok == null ? null : (body.useByok ? 1 : 0)
    const now = new Date().toISOString()

    // Upsert: probe → INSERT new or UPDATE existing. Same pattern as the
    // status endpoint — we avoid ON CONFLICT because of cross-engine quirks.
    const existing = await sql`
      SELECT id FROM agent_configs
      WHERE workspace_id = ${workspaceId} AND agent_slug = ${name}
      LIMIT 1
    `

    if (existing.rows.length === 0) {
      // First write — create the row with the supplied fields, falling back
      // to schema defaults for anything not provided.
      await sql`
        INSERT INTO agent_configs (
          id, workspace_id, agent_slug,
          model, instructions, tone,
          max_tasks_per_day, priority, allowed_tools,
          use_byok, schedule, daily_cost_cap, escalate_to,
          status, updated_at
        ) VALUES (
          ${newId()}, ${workspaceId}, ${name},
          ${body.model ?? null}, ${body.instructions ?? null}, ${body.tone ?? null},
          ${body.maxTasksPerDay ?? 100}, ${body.priority ?? 'normal'}, ${allowedToolsJson ?? '[]'},
          ${useByokInt ?? 1}, ${body.schedule ?? 'always'}, ${body.dailyCostCap ?? 50}, ${body.escalateTo ?? null},
          'active', ${now}
        )
      `
    } else {
      // Update: COALESCE so callers can patch any subset of fields without
      // clobbering the others to NULL.
      await sql`
        UPDATE agent_configs SET
          model            = COALESCE(${body.model ?? null}, model),
          instructions     = COALESCE(${body.instructions ?? null}, instructions),
          tone             = COALESCE(${body.tone ?? null}, tone),
          max_tasks_per_day= COALESCE(${body.maxTasksPerDay ?? null}, max_tasks_per_day),
          priority         = COALESCE(${body.priority ?? null}, priority),
          allowed_tools    = COALESCE(${allowedToolsJson}, allowed_tools),
          use_byok         = COALESCE(${useByokInt}, use_byok),
          schedule         = COALESCE(${body.schedule ?? null}, schedule),
          daily_cost_cap   = COALESCE(${body.dailyCostCap ?? null}, daily_cost_cap),
          escalate_to      = COALESCE(${body.escalateTo ?? null}, escalate_to),
          updated_at       = ${now}
        WHERE workspace_id = ${workspaceId} AND agent_slug = ${name}
      `
    }

    // Return the canonical row.
    const r = await sql`
      SELECT id, workspace_id, agent_slug, model, instructions, tone, max_tasks_per_day,
             priority, allowed_tools, use_byok, schedule, daily_cost_cap, escalate_to,
             status, updated_at
      FROM agent_configs
      WHERE workspace_id = ${workspaceId} AND agent_slug = ${name}
      LIMIT 1
    `
    return NextResponse.json(rowToApi(r.rows[0] as unknown as AgentConfigRow))
  } catch (err) {
    console.error('[/api/agents/[name]/config PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
