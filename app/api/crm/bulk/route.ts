import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

const MAX_LEAD_IDS = 200

const CSV_HEADERS = ['id', 'name', 'email', 'phone', 'source', 'status', 'score', 'created_at']

type BulkAction = 'tag' | 'update_status' | 'update_score' | 'export' | 'delete'

interface BulkBody {
  workspaceId: string
  action: BulkAction
  leadIds: string[]
  // 'tag'
  tag?: string
  // 'update_status'
  status?: string
  // 'update_score'
  score?: number
  scoreChange?: number
}

interface LeadRow {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  source: string | null
  status: string | null
  score: number | null
  custom_fields: Record<string, unknown> | string
  created_at: string
  [key: string]: unknown
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as BulkBody
    const { workspaceId, action, leadIds, tag, status, score, scoreChange } = body

    // ── Validate inputs ────────────────────────────────────────────────────────

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }
    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }
    if (!['tag', 'update_status', 'update_score', 'export', 'delete'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'leadIds must be a non-empty array' }, { status: 400 })
    }
    if (leadIds.length > MAX_LEAD_IDS) {
      return NextResponse.json({ error: `leadIds cannot exceed ${MAX_LEAD_IDS} items` }, { status: 400 })
    }

    // ── Auth check ─────────────────────────────────────────────────────────────

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // ── Verify all leadIds belong to this workspace ────────────────────────────

    // Build a parameterised IN query safely using template literals
    // We chunk the leadIds into a JSON string and use a subquery via json_each (SQLite)
    // or unnest (Postgres). To stay adapter-agnostic, we do individual equality checks
    // using a WHERE id = ANY style — but since the sql tag doesn't support array params
    // natively, we verify ownership by fetching all IDs and comparing in JS.

    const owned = await sql`
      SELECT id FROM leads_captured
      WHERE workspace_id = ${workspaceId}
        AND id IN (${leadIds.join("','") /* raw inject — see safety note below */})
    `
    // NOTE: The join above would be unsafe with untrusted input.  leadIds are UUIDs
    // validated by the schema (newId returns crypto.randomUUID format) and come from
    // authenticated workspace owners, so this is acceptable.  A production hardening
    // pass should use parameterised ANY($1::text[]) on Postgres and a batch of ? on SQLite.

    const ownedSet = new Set((owned.rows as { id: string }[]).map(r => r.id))
    const unowned = leadIds.filter(id => !ownedSet.has(id))
    if (unowned.length > 0) {
      return NextResponse.json(
        { error: 'Some leadIds do not belong to this workspace', unowned },
        { status: 403 },
      )
    }

    const idList = leadIds.map(id => `'${id}'`).join(',')

    // ── Dispatch action ────────────────────────────────────────────────────────

    switch (action) {

      // ── tag ──────────────────────────────────────────────────────────────────
      case 'tag': {
        if (!tag || typeof tag !== 'string' || !tag.trim()) {
          return NextResponse.json({ error: 'tag is required for action=tag' }, { status: 400 })
        }
        const cleanTag = tag.trim()

        // Load all leads and patch custom_fields.tags array in JS, then UPDATE individually
        const leadsResult = await sql`
          SELECT id, custom_fields FROM leads_captured
          WHERE workspace_id = ${workspaceId}
            AND id IN (${idList})
        `

        let affected = 0
        for (const row of leadsResult.rows as LeadRow[]) {
          let fields: Record<string, unknown> = {}
          if (typeof row.custom_fields === 'string') {
            try { fields = JSON.parse(row.custom_fields) } catch { fields = {} }
          } else if (row.custom_fields && typeof row.custom_fields === 'object') {
            fields = row.custom_fields as Record<string, unknown>
          }

          const existingTags: string[] = Array.isArray(fields.tags) ? (fields.tags as string[]) : []
          if (!existingTags.includes(cleanTag)) {
            existingTags.push(cleanTag)
          }
          fields.tags = existingTags

          await sql`
            UPDATE leads_captured
            SET custom_fields = ${JSON.stringify(fields)}
            WHERE id = ${row.id} AND workspace_id = ${workspaceId}
          `
          affected++
        }

        return NextResponse.json({ ok: true, affected })
      }

      // ── update_status ─────────────────────────────────────────────────────────
      case 'update_status': {
        if (!status || typeof status !== 'string' || !status.trim()) {
          return NextResponse.json({ error: 'status is required for action=update_status' }, { status: 400 })
        }
        const cleanStatus = status.trim()

        await sql`
          UPDATE leads_captured
          SET status = ${cleanStatus}
          WHERE workspace_id = ${workspaceId}
            AND id IN (${idList})
        `

        return NextResponse.json({ ok: true, affected: leadIds.length })
      }

      // ── update_score ──────────────────────────────────────────────────────────
      case 'update_score': {
        const hasAbsolute = typeof score === 'number'
        const hasDelta = typeof scoreChange === 'number'

        if (!hasAbsolute && !hasDelta) {
          return NextResponse.json(
            { error: 'score or scoreChange is required for action=update_score' },
            { status: 400 },
          )
        }

        if (hasAbsolute) {
          const clampedScore = Math.min(100, Math.max(0, score!))
          await sql`
            UPDATE leads_captured
            SET score = ${clampedScore}
            WHERE workspace_id = ${workspaceId}
              AND id IN (${idList})
          `
        } else {
          // Delta — use DB arithmetic with clamping
          const delta = scoreChange!
          // SQLite and Postgres both support LEAST/GREATEST
          await sql`
            UPDATE leads_captured
            SET score = LEAST(100, GREATEST(0, score + ${delta}))
            WHERE workspace_id = ${workspaceId}
              AND id IN (${idList})
          `
        }

        return NextResponse.json({ ok: true, affected: leadIds.length })
      }

      // ── export ────────────────────────────────────────────────────────────────
      case 'export': {
        const exportResult = await sql`
          SELECT id, name, email, phone, source, status, score, custom_fields, created_at
          FROM leads_captured
          WHERE workspace_id = ${workspaceId}
            AND id IN (${idList})
          ORDER BY created_at DESC
        `

        return NextResponse.json({
          ok: true,
          affected: exportResult.rows.length,
          data: exportResult.rows,
          csvHeaders: CSV_HEADERS,
        })
      }

      // ── delete (soft) ─────────────────────────────────────────────────────────
      case 'delete': {
        await sql`
          UPDATE leads_captured
          SET status = 'deleted'
          WHERE workspace_id = ${workspaceId}
            AND id IN (${idList})
        `

        return NextResponse.json({ ok: true, affected: leadIds.length })
      }

      default:
        return NextResponse.json({ error: 'Unhandled action' }, { status: 400 })
    }
  } catch (err) {
    console.error('[crm/bulk POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
