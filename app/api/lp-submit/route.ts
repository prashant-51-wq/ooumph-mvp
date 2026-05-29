/**
 * POST /api/lp-submit?lid={artifactId}
 * Handles form submissions from live landing pages.
 * Inserts the lead into leads_captured and fires auto-scoring.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { notifyLeadCaptured } from '@/lib/notifications'
import { fireSegmentTriggersForNewLead } from '@/lib/segment-trigger'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const artifactId = searchParams.get('lid') || ''

    // Parse form data
    const formData = await req.formData()
    const name =
      String(formData.get('name') || formData.get('first_name') || formData.get('full_name') || '').trim() || null
    const email = String(formData.get('email') || '').trim() || null
    const phone = String(formData.get('phone') || '').trim() || null
    const company = String(formData.get('company') || '').trim()
    const message = String(formData.get('message') || '').trim()
    const notes = [company, message].filter(Boolean).join(' — ') || null

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Look up workspace_id and artifact title from the artifact
    let workspaceId = ''
    let artifactTitle = 'landing_page'
    if (artifactId) {
      const artResult = await sql`
        SELECT workspace_id, title FROM artifacts WHERE id = ${artifactId} LIMIT 1
      `
      if (artResult.rows[0]) {
        workspaceId = String(artResult.rows[0].workspace_id || '')
        artifactTitle = String(artResult.rows[0].title || 'landing_page')
      }
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'Invalid landing page' }, { status: 400 })
    }

    // Insert lead
    const id = newId()
    await sql`
      INSERT INTO leads_captured (id, workspace_id, name, email, phone, source, campaign, status, score, notes)
      VALUES (
        ${id}, ${workspaceId}, ${name}, ${email}, ${phone},
        'landing_page', ${artifactTitle}, 'new', 0, ${notes}
      )
    `

    // Sprint 15B (P0 #7): producer-side notification so the user sees
    // "new lead" in the bell even when not watching the CRM page.
    await notifyLeadCaptured(
      workspaceId,
      id,
      name || email,
      'landing page' + (artifactTitle ? ` (${artifactTitle})` : ''),
    )

    // Fire-and-forget: auto-score if a scoring model exists
    const modelResult = await sql`
      SELECT id FROM artifacts
      WHERE workspace_id = ${workspaceId} AND type = 'lead_scoring_model'
      LIMIT 1
    `
    if (modelResult.rows[0]) {
      const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const internalSecretScore = process.env.CRON_SECRET || process.env.ADMIN_SECRET || ''
      fetch(`${appUrl}/api/agents/funnel/qualify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(internalSecretScore ? { 'x-internal-secret': internalSecretScore } : {}),
        },
        body: JSON.stringify({
          workspaceId,
          mode: 'score_lead',
          leadData: { id, name, email, phone, source: 'landing_page', campaign: artifactTitle },
        }),
      }).then(async r => {
        if (r.ok) {
          const data = await r.json() as { score?: { totalScore?: number; tier?: string } }
          if (data.score?.totalScore !== undefined) {
            await sql`
              UPDATE leads_captured
              SET score = ${data.score.totalScore},
                  status = ${data.score.tier === 'hot' ? 'contacted' : 'new'}
              WHERE id = ${id}
            `
          }
        }
      }).catch(e => console.error('Auto-score failed (non-fatal):', e))
    }

    // ── Auto-fire lead_captured workflows ──────────────────────────────────────
    // Find any active workflows with trigger_type = 'lead_captured' for this workspace
    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const internalSecret = process.env.CRON_SECRET || process.env.ADMIN_SECRET || ''
    sql`
      SELECT id FROM workflows
      WHERE workspace_id = ${workspaceId}
        AND trigger_type = 'lead_captured'
        AND status = 'active'
    `.then(async wfResult => {
      for (const wf of wfResult.rows) {
        // Sprint 17G (audit pass #3 P2 #37): surface trigger failures
        // instead of silently swallowing. Previously a .catch(() => {})
        // ate every workflow miss — operators had no signal when a
        // misconfigured workflow stopped firing. Now we log + persist
        // a lead_activity so the operator can diagnose from the CRM.
        fetch(`${appUrl}/api/workflows/trigger`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
          },
          body: JSON.stringify({ workspaceId, workflowId: String(wf.id), leadId: id, contactEmail: email }),
        }).then(async r => {
          if (!r.ok) {
            const errBody = await r.text().catch(() => '')
            console.error(`[lp-submit] workflow ${wf.id} trigger ${r.status}: ${errBody.slice(0, 240)}`)
            try {
              await sql`
                INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
                VALUES (
                  ${newId()}, ${workspaceId}, ${id},
                  'workflow_trigger_failed',
                  ${'Workflow trigger failed: ' + String(wf.id).slice(0, 60)},
                  ${(errBody || `HTTP ${r.status}`).slice(0, 500)},
                  ${JSON.stringify({ workflowId: wf.id, status: r.status })},
                  CURRENT_TIMESTAMP
                )
              `
            } catch { /* non-fatal */ }
          }
        }).catch(err => {
          console.error(`[lp-submit] workflow ${wf.id} trigger network error:`, err)
        })
      }
    }).catch(err => console.error('[lp-submit] workflow lookup failed:', err))

    // Sprint 17C (audit P1 #7): fire lead_added_to_segment triggers for
    // every segment this new lead belongs to. Fire-and-forget; never
    // blocks the redirect.
    void fireSegmentTriggersForNewLead({
      workspaceId,
      leadId: id,
      contactEmail: email,
    })

    // Redirect to thank-you page
    const displayName = encodeURIComponent(name || email || 'there')
    return NextResponse.redirect(
      new URL(`/lp/thanks?name=${displayName}`, req.url),
      { status: 303 }
    )
  } catch (error) {
    console.error('lp-submit error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
