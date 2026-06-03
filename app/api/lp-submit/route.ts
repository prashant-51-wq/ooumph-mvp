/**
 * POST /api/lp-submit?lid={artifactId}
 * Handles form submissions from live landing pages.
 * Inserts the lead into leads_captured and fires auto-scoring.
 *
 * Sprint 3 — Loop 2:
 * After the synchronous INSERT we use after() to run the full enrichment
 * pipeline in the background without blocking the visitor's redirect:
 *   1. Call /api/agents/enrich-lead   — parallel firmographic enrichment
 *   2. Call /api/agents/funnel/email-sequence — inject into drip queue
 *   3. Create workflow_runs row if an active lead_captured workflow exists
 */
import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql, newId } from '@/lib/db'
import { notifyLeadCaptured } from '@/lib/notifications'
import { fireSegmentTriggersForNewLead } from '@/lib/segment-trigger'
import { getBaseUrl } from '@/lib/base-url'

export const runtime = 'nodejs'
export const maxDuration = 120

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

    // Only accept approved landing_page artifacts — prevents CRM pollution
    // from draft / internal artifact IDs.
    let workspaceId = ''
    let artifactTitle = 'landing_page'
    if (artifactId) {
      const artResult = await sql`
        SELECT workspace_id, title, status, type FROM artifacts
        WHERE id = ${artifactId} AND type = 'landing_page' AND status = 'approved'
        LIMIT 1
      `
      if (artResult.rows[0]) {
        workspaceId = String(artResult.rows[0].workspace_id || '')
        artifactTitle = String(artResult.rows[0].title || 'landing_page')
      }
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'Invalid or unapproved landing page' }, { status: 404 })
    }

    // Insert lead — enrichment_status='pending' allows enrich-lead CAS lock
    const id = newId()
    await sql`
      INSERT INTO leads_captured (id, workspace_id, name, email, phone, source, campaign, status, score, notes, enrichment_status)
      VALUES (
        ${id}, ${workspaceId}, ${name}, ${email}, ${phone},
        'landing_page', ${artifactTitle}, 'new', 0, ${notes}, 'pending'
      )
    `

    await notifyLeadCaptured(
      workspaceId,
      id,
      name || email,
      'landing page' + (artifactTitle ? ` (${artifactTitle})` : ''),
    )

    // ── Fire-and-forget: auto-score if a scoring model exists ──────────────
    const modelResult = await sql`
      SELECT id FROM artifacts
      WHERE workspace_id = ${workspaceId} AND type = 'lead_scoring_model'
      LIMIT 1
    `
    if (modelResult.rows[0]) {
      const appUrl = getBaseUrl()
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

    // ── Fire-and-forget: active workflow triggers ──────────────────────────
    const appUrl = getBaseUrl()
    const internalSecret = process.env.CRON_SECRET || process.env.ADMIN_SECRET || ''
    sql`
      SELECT id FROM workflows
      WHERE workspace_id = ${workspaceId}
        AND trigger_type = 'lead_captured'
        AND status = 'active'
    `.then(async wfResult => {
      for (const wf of wfResult.rows) {
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

    void fireSegmentTriggersForNewLead({ workspaceId, leadId: id, contactEmail: email })

    // ── Sprint 3 Loop 2: enrichment → email drip chain (non-blocking) ──────
    // Runs AFTER the redirect so the visitor experience is instant.
    // Chain: enrich-lead → on success → funnel/email-sequence → workflow_runs
    after(async () => {
      const baseUrl = getBaseUrl()
      const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET || ''
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(secret ? { 'x-internal-secret': secret } : {}),
      }

      // 1. Trigger parallel firmographic enrichment
      let enrichOk = false
      try {
        const enrichRes = await fetch(`${baseUrl}/api/agents/enrich-lead`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ workspaceId, leadId: id }),
        })
        enrichOk = enrichRes.ok
        if (!enrichOk) {
          const t = await enrichRes.text().catch(() => '')
          console.warn(`[lp-submit after] enrich-lead ${enrichRes.status}: ${t.slice(0, 200)}`)
        }
      } catch (e) {
        console.warn('[lp-submit after] enrich-lead network error (non-fatal):', e)
      }

      // 2. The moment enrichment appends firmographic data, inject into drip queue
      if (enrichOk) {
        try {
          const seqRes = await fetch(`${baseUrl}/api/agents/funnel/email-sequence`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ workspaceId, sequenceType: 'nurture', leadContext: { leadId: id, email, name } }),
          })
          if (!seqRes.ok) {
            const t = await seqRes.text().catch(() => '')
            console.warn(`[lp-submit after] email-sequence ${seqRes.status}: ${t.slice(0, 200)}`)
          }
        } catch (e) {
          console.warn('[lp-submit after] email-sequence error (non-fatal):', e)
        }
      }

      // 3. Instantiate workflow_runs row to track this lead's nurture journey
      try {
        const wfRes = await sql`
          SELECT id FROM workflows
          WHERE workspace_id = ${workspaceId}
            AND trigger_type = 'lead_captured'
            AND status = 'active'
          LIMIT 1
        `
        const wfId = (wfRes.rows[0] as { id?: string } | undefined)?.id
        if (wfId) {
          const runId = newId()
          await sql`
            INSERT INTO workflow_runs (
              id, workflow_id, workspace_id, lead_id, contact_email,
              trigger_data, status, current_node, nodes_completed, started_at
            ) VALUES (
              ${runId}, ${wfId}, ${workspaceId}, ${id}, ${email},
              ${JSON.stringify({ source: 'landing_page', campaign: artifactTitle, enriched: enrichOk })},
              'running', 0, '[]', NOW()
            )
          `
        }
      } catch (e) {
        console.warn('[lp-submit after] workflow_runs insert failed (non-fatal):', e)
      }
    })

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
