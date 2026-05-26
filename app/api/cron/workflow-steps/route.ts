/**
 * GET /api/cron/workflow-steps
 *
 * Runs every minute (configurable via vercel.json crons) — processes all
 * pending workflow steps whose scheduled_for has passed.
 *
 * Uses the shared lib/workflow-engine.ts to execute each pending node so
 * the cron and the immediate-trigger code path stay in lockstep.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { executeNode, type WorkflowNode } from '@/lib/workflow-engine'

interface PendingStepRow {
  id: string
  workflow_run_id: string
  workflow_id: string
  workspace_id: string
  node_index: number
  node_data: string
  lead_id: string | null
  contact_email: string | null
  scheduled_for: string
  status: string
}

interface LeadRow extends Record<string, unknown> {
  id?: string
  name?: string
  email?: string
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()
  let executed = 0
  let failed = 0
  const errors: string[] = []

  const stepsRes = await sql`
    SELECT id, workflow_run_id, workflow_id, workspace_id, node_index, node_data, lead_id, contact_email, scheduled_for, status
    FROM workflow_pending_steps
    WHERE status = 'pending' AND scheduled_for <= ${now}
    ORDER BY scheduled_for ASC
    LIMIT 100
  `
  const steps = stepsRes.rows as unknown as PendingStepRow[]

  for (const step of steps) {
    try {
      let node: WorkflowNode
      try {
        node = JSON.parse(step.node_data) as WorkflowNode
      } catch {
        await sql`UPDATE workflow_pending_steps SET status = 'failed', error_message = 'Invalid node JSON' WHERE id = ${step.id}`
        failed++
        continue
      }

      // Hydrate lead + brand context for personalization
      let lead: LeadRow = {}
      if (step.lead_id) {
        const lr = await sql`SELECT * FROM leads_captured WHERE id = ${step.lead_id} LIMIT 1`
        lead = (lr.rows[0] as LeadRow) || {}
      }
      const brandRes = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${step.workspace_id} LIMIT 1`
      const brand = (brandRes.rows[0] as Record<string, unknown>) || {}

      await executeNode(node, {
        workspaceId: step.workspace_id,
        leadId: step.lead_id,
        contactEmail: step.contact_email,
        lead,
        brand,
      })

      await sql`UPDATE workflow_pending_steps SET status = 'executed' WHERE id = ${step.id}`
      executed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`step ${step.id}: ${msg}`)
      await sql`UPDATE workflow_pending_steps SET status = 'failed', error_message = ${msg} WHERE id = ${step.id}`
      failed++
    }
  }

  return NextResponse.json({
    ok: true,
    executed,
    failed,
    examined: steps.length,
    timestamp: now,
    errors: errors.slice(0, 5),
  })
}
