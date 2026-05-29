/**
 * POST /api/workflows/enroll
 *
 * Sprint 17C (audit P1 #6) — manual workflow enrolment for existing CRM
 * leads. The Sprint 16C nurture migration parked all NEW sequence
 * follow-ups in workflow_pending_steps, but there was no path for a
 * salesperson to drop EXISTING leads into a workflow after the fact.
 * This endpoint closes that gap.
 *
 * Body:
 *   { workspaceId: string
 *     workflowId:  string
 *     leadIds:     string[] }
 *
 * For each lead:
 *   1. Look up email from leads_captured (skip if not found)
 *   2. Create a workflow_runs row (status='running')
 *   3. For each non-trigger workflow node, insert a workflow_pending_steps
 *      row scheduled with a sequential 24h offset starting at now+1min.
 *      Nodes that declare their own delay (delay_minutes/_hours/_days)
 *      use that delay instead.
 *
 * Auth: requireRole(req, workspaceId, 'manager'). Reading the workflow
 * row is in addition to the role gate for ownership defence-in-depth.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { requireRole } from '@/lib/guards'

export const runtime = 'nodejs'

interface WorkflowNode {
  id?: string
  type: string
  delay_minutes?: number
  delay_hours?: number
  delay_days?: number
  [k: string]: unknown
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      workflowId?: string
      leadIds?: string[]
    }
    const { workspaceId, workflowId, leadIds } = body

    if (!workspaceId || !workflowId || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { error: 'workspaceId, workflowId, leadIds[] required' },
        { status: 400 },
      )
    }

    // Role gate — only manager+ may bulk-enrol.
    const denied = await requireRole(req, workspaceId, 'manager')
    if (denied) return denied

    // Load the workflow + verify workspace ownership.
    const wfRes = await sql`
      SELECT id, workspace_id, nodes, status
      FROM workflows
      WHERE id = ${workflowId} AND workspace_id = ${workspaceId}
      LIMIT 1
    `
    const wf = wfRes.rows[0] as
      | { id?: string; workspace_id?: string; nodes?: string; status?: string }
      | undefined
    if (!wf) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    const nodes: WorkflowNode[] = (() => {
      try { return JSON.parse(String(wf.nodes || '[]')) as WorkflowNode[] }
      catch { return [] }
    })()

    // Non-trigger nodes are the ones that actually execute downstream.
    const executableNodes = nodes.filter(n => n.type !== 'trigger')
    if (executableNodes.length === 0) {
      return NextResponse.json({ error: 'Workflow has no executable nodes' }, { status: 400 })
    }

    let enrolledCount = 0
    const startMs = Date.now() + 60 * 1000 // first step at now+1min

    for (const leadId of leadIds.slice(0, 500)) {
      // Look up the lead — must belong to this workspace.
      const lr = await sql`
        SELECT id, email FROM leads_captured
        WHERE id = ${leadId} AND workspace_id = ${workspaceId}
        LIMIT 1
      `
      const lead = lr.rows[0] as { id?: string; email?: string } | undefined
      if (!lead?.id) continue

      const email = lead.email ?? null
      const runId = newId()
      const now = new Date().toISOString()

      try {
        await sql`
          INSERT INTO workflow_runs
            (id, workflow_id, workspace_id, lead_id, contact_email,
             trigger_data, status, current_node, nodes_completed, started_at)
          VALUES
            (${runId}, ${workflowId}, ${workspaceId}, ${lead.id}, ${email},
             ${JSON.stringify({ source: 'manual_enroll' })},
             'running', 0, '[]', ${now})
        `
      } catch {
        // workflow_runs may not exist on legacy installs — non-fatal.
      }

      // Walk executable nodes, accumulating delay. Default = sequential 24h
      // offset (matches the funnel email-sequence pattern). Any node that
      // declares its own delay_* fields overrides the 24h default for that
      // step (and from that step forward, the cumulative clock continues).
      let cumulativeMinutes = 1 // first step at now+1min
      let nodeIdx = 0
      for (const node of executableNodes) {
        const ownDelay =
          (node.delay_minutes || 0) +
          (node.delay_hours || 0) * 60 +
          (node.delay_days || 0) * 1440
        if (ownDelay > 0) {
          cumulativeMinutes += ownDelay
        } else if (nodeIdx > 0) {
          // No declared delay → sequential 24h offset between steps.
          cumulativeMinutes += 24 * 60
        }
        const scheduledFor = new Date(startMs + (cumulativeMinutes - 1) * 60 * 1000).toISOString()

        await sql`
          INSERT INTO workflow_pending_steps
            (id, workflow_run_id, workflow_id, workspace_id,
             node_index, node_data, lead_id, contact_email,
             scheduled_for, status, created_at)
          VALUES
            (${newId()}, ${runId}, ${workflowId}, ${workspaceId},
             ${nodeIdx}, ${JSON.stringify(node)}, ${lead.id}, ${email},
             ${scheduledFor}, 'pending', ${now})
        `
        nodeIdx++
      }

      enrolledCount++
    }

    // Bump the workflow's run_count for visibility in the dashboard.
    if (enrolledCount > 0) {
      try {
        await sql`
          UPDATE workflows
          SET run_count = run_count + ${enrolledCount},
              last_run_at = ${new Date().toISOString()}
          WHERE id = ${workflowId} AND workspace_id = ${workspaceId}
        `
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ ok: true, enrolledCount })
  } catch (err) {
    console.error('[/api/workflows/enroll]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
