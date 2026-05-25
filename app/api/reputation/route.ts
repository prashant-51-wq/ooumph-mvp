/**
 * GET  /api/reputation?workspaceId=&type=reviews|requests&sentiment=&status=&source=
 * POST /api/reputation        — add a manual review
 * PATCH /api/reputation       — update review (response_text, status)
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const type = searchParams.get('type') || 'reviews'
  const sentiment = searchParams.get('sentiment')
  const status = searchParams.get('status')
  const source = searchParams.get('source')

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

  if (type === 'requests') {
    const result = await sql`
      SELECT * FROM reputation_requests
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC LIMIT 100
    `
    return NextResponse.json(result.rows)
  }

  if (type === 'summary') {
    const [reviews, requests, avgResult] = await Promise.all([
      sql`SELECT COUNT(*) as total, sentiment, status FROM reputation_reviews WHERE workspace_id = ${workspaceId} GROUP BY sentiment, status`,
      sql`SELECT COUNT(*) as total, status FROM reputation_requests WHERE workspace_id = ${workspaceId} GROUP BY status`,
      sql`SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM reputation_reviews WHERE workspace_id = ${workspaceId} AND rating IS NOT NULL`,
    ])
    const starBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const r of [1, 2, 3, 4, 5]) {
      const res = await sql`SELECT COUNT(*) as c FROM reputation_reviews WHERE workspace_id = ${workspaceId} AND rating = ${r}`
      starBreakdown[r] = Number(res.rows[0]?.c || 0)
    }
    return NextResponse.json({
      reviews: reviews.rows,
      requests: requests.rows,
      avgRating: Number(avgResult.rows[0]?.avg_rating || 0),
      totalReviews: Number(avgResult.rows[0]?.total || 0),
      starBreakdown,
    })
  }

  // Reviews list with optional filters
  let result
  if (sentiment && status && source) {
    result = await sql`SELECT * FROM reputation_reviews WHERE workspace_id = ${workspaceId} AND sentiment = ${sentiment} AND status = ${status} AND source = ${source} ORDER BY created_at DESC LIMIT 100`
  } else if (sentiment && status) {
    result = await sql`SELECT * FROM reputation_reviews WHERE workspace_id = ${workspaceId} AND sentiment = ${sentiment} AND status = ${status} ORDER BY created_at DESC LIMIT 100`
  } else if (sentiment) {
    result = await sql`SELECT * FROM reputation_reviews WHERE workspace_id = ${workspaceId} AND sentiment = ${sentiment} ORDER BY created_at DESC LIMIT 100`
  } else if (status) {
    result = await sql`SELECT * FROM reputation_reviews WHERE workspace_id = ${workspaceId} AND status = ${status} ORDER BY created_at DESC LIMIT 100`
  } else if (source) {
    result = await sql`SELECT * FROM reputation_reviews WHERE workspace_id = ${workspaceId} AND source = ${source} ORDER BY created_at DESC LIMIT 100`
  } else {
    result = await sql`SELECT * FROM reputation_reviews WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 100`
  }
  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      contactName?: string
      contactEmail?: string
      contactId?: string
      source?: string
      rating?: number
      title?: string
      body?: string
      sentiment?: string
      externalId?: string
      externalUrl?: string
      bookingId?: string
      reviewedAt?: string
    }
    const {
      workspaceId, contactName, contactEmail, contactId,
      source = 'manual', rating, title, body: reviewBody,
      sentiment, externalId, externalUrl, bookingId, reviewedAt,
    } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    // Auto-compute sentiment from rating if not provided
    const autoSentiment = sentiment || (
      rating ? (rating >= 4 ? 'positive' : rating === 3 ? 'neutral' : 'negative') : 'neutral'
    )

    const id = newId()
    const now = new Date().toISOString()
    await sql`
      INSERT INTO reputation_reviews (id, workspace_id, contact_id, contact_name, contact_email, source, rating, title, body, sentiment, status, external_id, external_url, booking_id, reviewed_at, created_at)
      VALUES (${id}, ${workspaceId}, ${contactId || null}, ${contactName || null}, ${contactEmail || null}, ${source}, ${rating || null}, ${title || null}, ${reviewBody || null}, ${autoSentiment}, 'new', ${externalId || null}, ${externalUrl || null}, ${bookingId || null}, ${reviewedAt || now}, ${now})
    `
    return NextResponse.json({ ok: true, id })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id: string
      status?: string
      responseText?: string
      sentiment?: string
    }
    const { id, status, responseText, sentiment } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const now = new Date().toISOString()
    await sql`
      UPDATE reputation_reviews SET
        status = COALESCE(${status || null}, status),
        sentiment = COALESCE(${sentiment || null}, sentiment),
        response_text = COALESCE(${responseText || null}, response_text),
        response_sent_at = CASE WHEN ${responseText || null} IS NOT NULL THEN ${now} ELSE response_sent_at END
      WHERE id = ${id}
    `
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
