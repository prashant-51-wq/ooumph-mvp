/**
 * Lead Enrichment Worker — Leads Supervisor
 * POST /api/agents/leads/enrich — enrich leads via Apollo.io and Hunter.io
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { enrichPerson, enrichCompany, searchPeople, isApolloAvailable } from '@/lib/tools/apollo'
import { findEmail, verifyEmail, domainSearch, isHunterAvailable } from '@/lib/tools/hunter'

interface LeadInput {
  email?: string
  domain?: string
  firstName?: string
  lastName?: string
}

interface EnrichRequest {
  workspaceId: string
  action: 'enrich_person' | 'enrich_company' | 'find_email' | 'verify_email' | 'domain_search' | 'batch_enrich'
  email?: string
  domain?: string
  firstName?: string
  lastName?: string
  leads?: LeadInput[]
}

async function getSettings(workspaceId: string) {
  const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const workspace = wsResult.rows[0]
  if (!workspace) return null
  try {
    return typeof workspace.model_settings === 'string'
      ? JSON.parse(workspace.model_settings || '{}')
      : (workspace.model_settings as Record<string, unknown>) || {}
  } catch {
    return {}
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as EnrichRequest
    const { workspaceId, action, email, domain, firstName, lastName, leads } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    const settings = await getSettings(workspaceId)
    if (!settings) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    // Inject API keys into env
    if (settings.apolloApiKey) process.env.APOLLO_API_KEY = settings.apolloApiKey as string
    if (settings.hunterApiKey) process.env.HUNTER_API_KEY = settings.hunterApiKey as string

    // ── Enrich Person ────────────────────────────────────────────────────────
    if (action === 'enrich_person') {
      if (!email && !domain) {
        return NextResponse.json({ error: 'Provide email or domain to enrich a person' }, { status: 400 })
      }

      let apolloData: unknown = null
      let hunterData: unknown = null
      let source = 'none'

      if (isApolloAvailable() && email) {
        try {
          apolloData = await enrichPerson(email)
          if (apolloData) source = 'apollo'
        } catch { /* fall through */ }
      }

      if (!apolloData && isHunterAvailable() && domain && firstName && lastName) {
        try {
          hunterData = await findEmail(domain, firstName, lastName)
          if (hunterData) source = 'hunter'
        } catch { /* fall through */ }
      }

      if (apolloData && hunterData) source = 'combined'

      return NextResponse.json({
        ok: true,
        person: { ...(apolloData as object || {}), hunterData },
        source,
      })
    }

    // ── Enrich Company ───────────────────────────────────────────────────────
    if (action === 'enrich_company') {
      if (!domain) return NextResponse.json({ error: 'Missing domain for company enrichment' }, { status: 400 })

      if (!isApolloAvailable()) {
        return NextResponse.json({
          ok: false,
          error: 'Apollo.io API key not configured. Add it in Settings → Lead Enrichment.',
          requiresSetup: true,
        })
      }

      const company = await enrichCompany(domain)
      return NextResponse.json({ ok: true, company })
    }

    // ── Find Email ───────────────────────────────────────────────────────────
    if (action === 'find_email') {
      if (!domain || !firstName || !lastName) {
        return NextResponse.json({ error: 'Missing domain, firstName, or lastName' }, { status: 400 })
      }

      if (!isHunterAvailable()) {
        return NextResponse.json({
          ok: false,
          error: 'Hunter.io API key not configured. Add it in Settings → Lead Enrichment.',
          requiresSetup: true,
        })
      }

      const result = await findEmail(domain, firstName, lastName)
      return NextResponse.json({ ok: true, result })
    }

    // ── Verify Email ─────────────────────────────────────────────────────────
    if (action === 'verify_email') {
      if (!email) return NextResponse.json({ error: 'Missing email to verify' }, { status: 400 })

      if (!isHunterAvailable()) {
        return NextResponse.json({
          ok: false,
          error: 'Hunter.io API key not configured. Add it in Settings → Lead Enrichment.',
          requiresSetup: true,
        })
      }

      const result = await verifyEmail(email)
      return NextResponse.json({ ok: true, result })
    }

    // ── Domain Search ────────────────────────────────────────────────────────
    if (action === 'domain_search') {
      if (!domain) return NextResponse.json({ error: 'Missing domain for search' }, { status: 400 })

      if (!isHunterAvailable()) {
        return NextResponse.json({
          ok: false,
          error: 'Hunter.io API key not configured. Add it in Settings → Lead Enrichment.',
          requiresSetup: true,
        })
      }

      const result = await domainSearch(domain, 25)
      return NextResponse.json({ ok: true, result })
    }

    // ── Batch Enrich ─────────────────────────────────────────────────────────
    if (action === 'batch_enrich') {
      const batch = (leads || []).slice(0, 20)
      if (batch.length === 0) {
        return NextResponse.json({ error: 'No leads provided for batch enrichment' }, { status: 400 })
      }

      const enriched: unknown[] = []
      let failed = 0

      for (const lead of batch) {
        try {
          let result: unknown = null

          if (isApolloAvailable() && lead.email) {
            result = await enrichPerson(lead.email)
          }

          if (!result && isHunterAvailable() && lead.domain && lead.firstName && lead.lastName) {
            result = await findEmail(lead.domain, lead.firstName, lead.lastName)
          }

          if (result) {
            enriched.push({ lead, data: result, ok: true })

            // Update leads_captured table if email matches
            if (lead.email) {
              await sql`
                UPDATE leads_captured
                SET enrichment_data = jsonb_set(
                  coalesce(enrichment_data, '{}'),
                  '{apollo}',
                  ${JSON.stringify(result)}::jsonb
                )
                WHERE workspace_id = ${workspaceId}
                  AND email = ${lead.email}
              `.catch(() => {
                // enrichment_data column may not exist — try a simpler update
                return sql`
                  UPDATE leads_captured
                  SET notes = coalesce(notes, '') || ' [Enriched]'
                  WHERE workspace_id = ${workspaceId}
                    AND email = ${lead.email}
                `.catch(() => { /* ignore */ })
              })
            }
          } else {
            failed++
            enriched.push({ lead, ok: false, reason: 'No data found' })
          }
        } catch (e) {
          failed++
          enriched.push({ lead, ok: false, reason: String(e) })
        }

        // Rate-limit delay between requests
        await sleep(100)
      }

      return NextResponse.json({
        ok: true,
        enriched,
        failed,
        total: batch.length,
        succeeded: batch.length - failed,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Lead enrich route error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
