/**
 * /api/sales-deals — Pipeline / deals CRUD
 * GET    ?workspaceId=xxx [&stage=]     → list deals
 * POST   { workspaceId, contactName, title, value, stage, probability, ... } → create
 * PATCH  { id, stage, value, probability, ... }                              → update
 * DELETE ?id=xxx                                                             → delete
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const stage = searchParams.get('stage')
  if (!workspaceId) return NextResponse.json([])

  const result = stage && stage !== 'all'
    ? await sql`SELECT * FROM sales_deals WHERE workspace_id = ${workspaceId} AND stage = ${stage} ORDER BY created_at DESC LIMIT 200`
    : await sql`SELECT * FROM sales_deals WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 200`

  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      leadId?: string
      contactName: string
      contactEmail?: string
      company?: string
      title: string
      value?: number
      currency?: string
      stage?: string
      probability?: number
      expectedClose?: string
      notes?: string
      source?: string
    }
    const {
      workspaceId, leadId, contactName, contactEmail, company,
      title, value, currency, stage, probability, expectedClose, notes, source,
    } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!contactName) return NextResponse.json({ error: 'contactName required' }, { status: 400 })
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

    const id = newId()
    await sql`
      INSERT INTO sales_deals (id, workspace_id, lead_id, contact_name, contact_email, company, title, value, currency, stage, probability, expected_close, notes, source)
      VALUES (${id}, ${workspaceId}, ${leadId || null}, ${contactName}, ${contactEmail || null}, ${company || null}, ${title},
              ${value || 0}, ${currency || 'USD'}, ${stage || 'prospect'}, ${probability || 10},
              ${expectedClose || null}, ${notes || null}, ${source || 'manual'})
    `

    return NextResponse.json({ ok: true, id })
  } catch (error) {
    console.error('POST sales-deals error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id: string
      stage?: string
      value?: number
      probability?: number
      title?: string
      contactName?: string
      contactEmail?: string
      company?: string
      expectedClose?: string
      actualClose?: string
      notes?: string
    }
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    if (body.stage !== undefined) {
      await sql`UPDATE sales_deals SET stage = ${body.stage} WHERE id = ${id}`
    }
    if (body.value !== undefined) {
      await sql`UPDATE sales_deals SET value = ${body.value} WHERE id = ${id}`
    }
    if (body.probability !== undefined) {
      await sql`UPDATE sales_deals SET probability = ${body.probability} WHERE id = ${id}`
    }
    if (body.title !== undefined) {
      await sql`UPDATE sales_deals SET title = ${body.title} WHERE id = ${id}`
    }
    if (body.contactName !== undefined) {
      await sql`UPDATE sales_deals SET contact_name = ${body.contactName} WHERE id = ${id}`
    }
    if (body.contactEmail !== undefined) {
      await sql`UPDATE sales_deals SET contact_email = ${body.contactEmail} WHERE id = ${id}`
    }
    if (body.company !== undefined) {
      await sql`UPDATE sales_deals SET company = ${body.company} WHERE id = ${id}`
    }
    if (body.expectedClose !== undefined) {
      await sql`UPDATE sales_deals SET expected_close = ${body.expectedClose} WHERE id = ${id}`
    }
    if (body.actualClose !== undefined) {
      await sql`UPDATE sales_deals SET actual_close = ${body.actualClose} WHERE id = ${id}`
    }
    if (body.notes !== undefined) {
      await sql`UPDATE sales_deals SET notes = ${body.notes} WHERE id = ${id}`
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH sales-deals error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await sql`DELETE FROM sales_deals WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
