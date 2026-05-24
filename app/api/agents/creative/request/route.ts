/**
 * Creative Request Hub — any supervisor agent POSTs here to request a creative asset.
 * Routes to the right worker from lib/creative-workers.ts (no HTTP round-trip).
 * After generation: artifact → approval queue → optional auto-publish after human approval.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import {
  generateStaticPost,
  generateStoryCover,
  generateAdCreative,
  generateVideoBrief,
  generateLandingVisual,
} from '@/lib/creative-workers'

export type CreativeType =
  | 'visual_post'
  | 'visual_story'
  | 'visual_ad'
  | 'video_brief'
  | 'landing_visual_pack'
  | 'visual_carousel'
  | 'youtube_thumbnail'

interface CreativeRequestBody {
  workspaceId: string
  requestingAgent: string           // 'campaign', 'content_intelligence', 'growth_engine', 'lead_funnel'
  creativeType: CreativeType
  context: {
    topic?: string
    platform?: string
    pageType?: string
    format?: string
    sizes?: string[]
    campaignId?: string
    [key: string]: unknown
  }
  priority?: 'urgent' | 'normal' | 'low'
  publishPlatforms?: string[]       // auto-publish after approval if set
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as CreativeRequestBody
    const { workspaceId, requestingAgent, creativeType, context, priority = 'normal', publishPlatforms } = body

    if (!workspaceId || !requestingAgent || !creativeType) {
      return NextResponse.json({ error: 'Missing workspaceId, requestingAgent, or creativeType' }, { status: 400 })
    }

    // Create the request record
    const requestId = newId()
    await sql`
      INSERT INTO creative_requests
        (id, workspace_id, requesting_agent, creative_type, context_json, priority, publish_platforms, status)
      VALUES
        (${requestId}, ${workspaceId}, ${requestingAgent}, ${creativeType},
         ${JSON.stringify(context)}, ${priority},
         ${publishPlatforms ? JSON.stringify(publishPlatforms) : null},
         'in_progress')
    `

    // Dispatch to the right worker
    let result
    try {
      switch (creativeType) {
        case 'visual_post':
          result = await generateStaticPost(
            workspaceId,
            context.topic || requestingAgent,
            (context.platform as 'instagram' | 'linkedin') || 'instagram'
          )
          break

        case 'visual_story':
          result = await generateStoryCover(
            workspaceId,
            context.topic || requestingAgent,
            (context.platform as 'instagram' | 'youtube_shorts' | 'facebook') || 'instagram'
          )
          break

        case 'visual_ad':
          result = await generateAdCreative(
            workspaceId,
            context.topic || requestingAgent,
            context.platform || 'facebook',
            context.sizes || ['square', 'landscape', 'story']
          )
          break

        case 'video_brief':
          result = await generateVideoBrief(
            workspaceId,
            context.topic || requestingAgent,
            (context.format as 'reel' | 'story' | 'short' | 'youtube' | 'square' | 'ad') || 'reel'
          )
          break

        case 'landing_visual_pack':
          result = await generateLandingVisual(
            workspaceId,
            context.pageType || 'lead_capture'
          )
          break

        case 'visual_carousel':
        case 'youtube_thumbnail':
          // These require existing copy artifacts — return guidance
          return NextResponse.json({
            error: `${creativeType} requires pre-generated copy. Use Assets page to generate carousel copy first, then visit Creative Studio.`,
            requestId,
          }, { status: 422 })

        default:
          throw new Error(`Unsupported creativeType: ${creativeType}`)
      }

      // Update request to completed
      await sql`
        UPDATE creative_requests
        SET status = 'completed', artifact_id = ${result.artifactId}, completed_at = CURRENT_TIMESTAMP
        WHERE id = ${requestId}
      `

      return NextResponse.json({
        ok: true,
        requestId,
        artifactId: result.artifactId,
        approvalId: result.approvalId,
        artifactType: result.artifactType,
        title: result.title,
        message: publishPlatforms?.length
          ? `Creative generated and queued for approval. Will auto-publish to ${publishPlatforms.join(', ')} after human approval.`
          : 'Creative generated and sent to approval queue.',
      })

    } catch (workerError) {
      await sql`
        UPDATE creative_requests
        SET status = 'failed', error_message = ${String(workerError)}, completed_at = CURRENT_TIMESTAMP
        WHERE id = ${requestId}
      `
      throw workerError
    }

  } catch (error) {
    console.error('Creative request error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const agent = searchParams.get('agent')
  const status = searchParams.get('status')

  const result = await sql`
    SELECT cr.*, a.title as artifact_title, a.type as artifact_type
    FROM creative_requests cr
    LEFT JOIN artifacts a ON a.id = cr.artifact_id
    WHERE cr.workspace_id = ${workspaceId}
      ${agent ? sql`AND cr.requesting_agent = ${agent}` : sql``}
      ${status ? sql`AND cr.status = ${status}` : sql``}
    ORDER BY cr.created_at DESC
    LIMIT 50
  `
  return NextResponse.json(result.rows)
}
