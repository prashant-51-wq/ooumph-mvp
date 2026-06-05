import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { sendApprovalRequestEmail } from '@/lib/email'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

interface CarouselCopy {
  title: string
  coverText: string
  slides: Array<{ headline: string; body: string }>
  cta: string
}

export interface VisualSlide {
  type: 'cover' | 'slide' | 'cta'
  title?: string
  coverText?: string
  headline?: string
  body?: string
  slideNum?: number
  cta?: string
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const [brandResult, carouselResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT id, content_json FROM artifacts
          WHERE workspace_id = ${workspaceId} AND type = 'carousel'
          ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    const carouselRow = carouselResult.rows[0]

    if (!brand) return NextResponse.json({ error: 'Brand profile not found. Complete onboarding first.' }, { status: 400 })
    if (!carouselRow) return NextResponse.json({ error: 'Generate carousel copy first in the Assets section.' }, { status: 400 })

    const copy = carouselRow.content_json as unknown as CarouselCopy
    const contentSlides = (copy.slides || []).slice(0, 8)

    const slides: VisualSlide[] = [
      { type: 'cover', title: copy.title, coverText: copy.coverText },
      ...contentSlides.map((s, i) => ({
        type: 'slide' as const,
        headline: s.headline,
        body: s.body,
        slideNum: i + 1,
      })),
      { type: 'cta', cta: copy.cta },
    ]

    const artifactContent = {
      sourceCarouselId: carouselRow.id,
      businessName: brand.business_name,
      tone: brand.tone || 'professional',
      slides,
      totalSlides: slides.length,
    }

    const artifactId = newId()
    const title = `Visual Carousel — ${copy.title || 'Carousel'}`
    await sql`INSERT INTO artifacts (id, workspace_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, 'visual_carousel', ${title}, ${JSON.stringify(artifactContent)})`

    const approvalId = newId()
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id)
              VALUES (${approvalId}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'visual_carousel',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ artifactId, approvalId, slides, tone: brand.tone, businessName: brand.business_name })
  } catch (error) {
    console.error('Visual carousel generation error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at,
           ap.status as approval_status, ap.id as approval_id, ap.notes as approval_notes
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'visual_carousel'
    ORDER BY a.created_at DESC LIMIT 5
  `
  return NextResponse.json(result.rows)
}
