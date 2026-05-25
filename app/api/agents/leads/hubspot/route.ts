/**
 * HubSpot CRM Sync Worker
 * Syncs leads from Ooumph CRM to HubSpot contacts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { syncLeadToHubSpot } from '@/lib/tools/hubspot'

interface Lead {
  id: string
  name: string
  email: string
  phone: string
  source: string
  score: number
  notes: string
  hubspot_id?: string
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, leadIds, syncAll } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    // Load workspace model_settings for HubSpot token
    const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const ws = wsResult.rows[0]
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    const ms = typeof ws.model_settings === 'string' ? JSON.parse(ws.model_settings || '{}') : (ws.model_settings || {})
    const token: string = ms.hubspotAccessToken || process.env.HUBSPOT_ACCESS_TOKEN || ''

    if (!token) {
      return NextResponse.json({
        error: 'HubSpot not configured. Add Access Token in Settings → API Keys.',
        configured: false,
      }, { status: 400 })
    }

    // Load leads
    let leadsResult
    if (syncAll) {
      leadsResult = await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} AND email IS NOT NULL AND email != '' ORDER BY created_at DESC LIMIT 500`
    } else if (leadIds && leadIds.length > 0) {
      leadsResult = await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} AND id = ANY(${leadIds})`
    } else {
      leadsResult = await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} AND (hubspot_id IS NULL OR hubspot_id = '') AND email IS NOT NULL AND email != '' ORDER BY created_at DESC LIMIT 50`
    }

    const leads = leadsResult.rows as unknown as Lead[]

    let synced = 0
    let created = 0
    let updated = 0
    let failed = 0
    const errors: string[] = []

    // Batch process: max 50 at a time
    const BATCH_SIZE = 50
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (lead) => {
          try {
            const result = await syncLeadToHubSpot(token, {
              name: lead.name || 'Unknown',
              email: lead.email,
              phone: lead.phone || undefined,
              company: lead.source || undefined,
              source: lead.source,
              score: lead.score,
              notes: lead.notes || undefined,
            })

            if (result) {
              synced++
              if (result.created) {
                created++
              } else {
                updated++
              }
              // Store HubSpot contact ID
              try {
                await sql`UPDATE leads_captured SET hubspot_id = ${result.contactId} WHERE id = ${lead.id}`
              } catch { /* ignore migration edge cases */ }
            } else {
              failed++
              errors.push(`Failed to sync lead: ${lead.email}`)
            }
          } catch (e) {
            failed++
            errors.push(`Error syncing ${lead.email}: ${String(e)}`)
          }
        })
      )
    }

    return NextResponse.json({ synced, created, updated, failed, errors: errors.slice(0, 20) })
  } catch (e) {
    console.error('HubSpot sync error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const result = await sql`
      SELECT
        COUNT(*) as total_synced,
        MAX(created_at) as last_sync
      FROM leads_captured
      WHERE workspace_id = ${workspaceId}
        AND hubspot_id IS NOT NULL
        AND hubspot_id != ''
    `
    const row = result.rows[0] as Record<string, unknown> | undefined

    return NextResponse.json({
      totalSynced: Number(row?.total_synced || 0),
      lastSync: row?.last_sync || null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
