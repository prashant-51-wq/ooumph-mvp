import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql, newId } from '@/lib/db'
import { sendApprovalConfirmationEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')

  const result = await sql`
    SELECT
      ap.*,
      a.type as artifact_type,
      a.title as artifact_title,
      a.content_json,
      a.status as artifact_status,
      a.created_at as artifact_created_at
    FROM approvals ap
    JOIN artifacts a ON a.id = ap.artifact_id
    WHERE ap.workspace_id = ${workspaceId}
    ORDER BY ap.created_at DESC
  `
  // Parse content_json strings into objects for the UI
  const rows = result.rows.map((r) => {
    const row = r as Record<string, unknown>
    if (typeof row.content_json === 'string') {
      try { row.content_json = JSON.parse(row.content_json as string) } catch { /* keep raw */ }
    }
    return row
  })
  return NextResponse.json(rows)
}

export async function PATCH(req: NextRequest) {
  try {
    const { approvalId, action, notes, workspaceId } = await req.json()

    const status = action === 'approve' ? 'approved' : 'rejected'

    await sql`
      UPDATE approvals
      SET status = ${status}, notes = ${notes || null}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${approvalId}
    `

    const artifactResult = await sql`
      SELECT a.id, a.type, a.title FROM artifacts a
      JOIN approvals ap ON ap.artifact_id = a.id
      WHERE ap.id = ${approvalId}
    `
    const artifact = artifactResult.rows[0]

    await sql`UPDATE artifacts SET status = ${status} WHERE id = ${artifact?.id}`

    if (action === 'reject' && notes && artifact?.id) {
      await sql`
        INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note)
        VALUES (${newId()}, ${workspaceId}, 'approval_rejection', ${artifact.id}, ${notes})
      `
    }

    // Send confirmation email to the workspace approval address
    const brandResult = await sql`SELECT approval_email, business_name FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0]
    if (brand?.approval_email && artifact?.type) {
      await sendApprovalConfirmationEmail({
        to: brand.approval_email as string,
        businessName: brand.business_name as string,
        artifactType: artifact.type as string,
        action,
        notes,
      })
    }

    // ── Strategy approved → trigger CMO decomposition into project_tasks ─────
    //
    // When the user approves a strategy artifact, the CMO breaks it down into
    // concrete sub-agent tasks (social posts, emails, ads, etc.) and dispatches
    // each one. We fire this in `after()` so the approval response stays fast
    // and the user sees the modal close immediately. Vercel keeps the function
    // alive until the decomposition completes; if it fails we log + move on,
    // the approval is committed regardless.
    if (action === 'approve' && artifact?.id && artifact?.type === 'strategy') {
      after(async () => {
        try {
          // Idempotency check — skip if tasks already exist for this strategy.
          const existing = await sql`
            SELECT COUNT(*) as count FROM project_tasks
            WHERE workspace_id = ${workspaceId} AND parent_artifact_id = ${artifact.id as string}
          `
          const existingCount = Number((existing.rows[0] as { count?: number } | undefined)?.count || 0)
          if (existingCount > 0) {
            console.log(`[approvals] strategy ${artifact.id} already has ${existingCount} project_tasks — skipping decomposition`)
            return
          }

          const res = await fetch(`${BASE_URL}/api/agents/decompose-strategy`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.ADMIN_SECRET ? { 'x-internal-secret': process.env.ADMIN_SECRET } : {}),
            },
            body: JSON.stringify({
              workspaceId,
              artifactId: artifact.id,
            }),
          })
          if (!res.ok) {
            const txt = await res.text().catch(() => '')
            console.error(`[approvals] decompose-strategy returned ${res.status}: ${txt.slice(0, 200)}`)
          } else {
            const data = await res.json().catch(() => ({}))
            console.log(`[approvals] decomposed strategy ${artifact.id} into ${data.taskCount || 0} tasks`)
          }
        } catch (err) {
          console.error('[approvals after()] strategy decomposition failed:', err)
        }
      })
    }

    // ── Auto-publish if a creative_request specified publish_platforms ─────────
    if (action === 'approve' && artifact?.id) {
      const creativeReqResult = await sql`
        SELECT id, publish_platforms FROM creative_requests
        WHERE artifact_id = ${artifact.id} AND publish_platforms IS NOT NULL
        LIMIT 1
      `
      const creativeReq = creativeReqResult.rows[0]
      if (creativeReq?.publish_platforms) {
        const platforms = JSON.parse(creativeReq.publish_platforms as string) as string[]
        // Fire-and-forget publish to each platform (HITL gate was the approval itself)
        Promise.allSettled(
          platforms.map(platform =>
            fetch(`${BASE_URL}/api/publish`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspaceId, artifactId: artifact.id, platform }),
            }).then(async r => {
              const data = await r.json() as { ok?: boolean; error?: string; postUrl?: string }
              if (!data.ok) console.error(`Auto-publish to ${platform} failed:`, data.error)
              else console.log(`Auto-published to ${platform}:`, data.postUrl)
            })
          )
        ).catch(e => console.error('Auto-publish batch error:', e))
      }
    }

    return NextResponse.json({ success: true, status })
  } catch (error) {
    console.error('Approval error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
