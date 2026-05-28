/**
 * Social Scheduler Worker — Publishing Supervisor
 * POST /api/agents/publish/social — schedule posts across social platforms via Buffer
 * GET  /api/agents/publish/social — return upcoming scheduled posts
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { getBufferProfiles, scheduleBufferPost, groqChat, isGroqAvailable } from '@/lib/tools'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { isAgentActive } from '@/lib/agents'

type SocialPlatform = 'twitter' | 'linkedin' | 'instagram' | 'facebook'

interface ScheduleSocialRequest {
  workspaceId: string
  content: string
  platforms: SocialPlatform[]
  scheduledAt?: string
  mediaUrl?: string
  artifactId?: string
}

// Map our platform names to Buffer service types
const PLATFORM_TO_BUFFER: Record<SocialPlatform, string> = {
  twitter: 'twitter',
  linkedin: 'linkedin',
  instagram: 'instagram',
  facebook: 'facebook',
}

// Suggest optimal posting time using Groq if available, else default
async function suggestPostTime(content: string, platforms: SocialPlatform[]): Promise<string> {
  const tomorrow9am = new Date()
  tomorrow9am.setDate(tomorrow9am.getDate() + 1)
  tomorrow9am.setHours(9, 0, 0, 0)
  const defaultTime = tomorrow9am.toISOString()

  if (!isGroqAvailable()) return defaultTime

  try {
    const response = await groqChat(
      [
        { role: 'system', content: 'You are a social media scheduling expert. Return only an ISO 8601 datetime string.' },
        { role: 'user', content: `Given this social media content for ${platforms.join(', ')}: "${content.slice(0, 200)}..."
Suggest the single best posting time in ISO 8601 format (within the next 7 days). Consider platform best practices for engagement. Return ONLY the ISO date string, nothing else.` },
      ],
      { maxTokens: 50 }
    )
    const suggestedTime = response.trim()
    // Validate it's a parseable date
    if (suggestedTime && !isNaN(Date.parse(suggestedTime))) {
      return new Date(suggestedTime).toISOString()
    }
  } catch { /* fall through to default */ }

  return defaultTime
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ScheduleSocialRequest
    const { workspaceId, content, platforms, scheduledAt, mediaUrl, artifactId } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!content) return NextResponse.json({ error: 'Missing content' }, { status: 400 })
    if (!platforms || platforms.length === 0) return NextResponse.json({ error: 'Select at least one platform' }, { status: 400 })
    // Sprint 15F (P2 #20): real-time scheduling must honor agent pause.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (!(await isAgentActive(workspaceId, 'social-agent'))) {
      return NextResponse.json({ ok: false, error: 'social-agent is paused', paused: true }, { status: 423 })
    }

    // 1. Load workspace model_settings
    const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const workspace = wsResult.rows[0]
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    let modelSettings: Record<string, unknown> = {}
    try {
      modelSettings = typeof workspace.model_settings === 'string'
        ? JSON.parse(workspace.model_settings)
        : (workspace.model_settings as Record<string, unknown>) || {}
    } catch { modelSettings = {} }

    const bufferAccessToken = modelSettings.bufferAccessToken as string | undefined
    if (!bufferAccessToken) {
      return NextResponse.json({
        error: 'Buffer not connected. Add Buffer Access Token in Settings.',
        configured: false,
      })
    }

    // 2. Get Buffer profiles
    const profiles = await getBufferProfiles(bufferAccessToken)
    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ error: 'No Buffer profiles found. Connect your social accounts in Buffer first.' }, { status: 400 })
    }

    // 3. Filter profiles to requested platforms
    const matchedProfiles = profiles.filter((p: { service: string; id: string }) =>
      platforms.some(platform => PLATFORM_TO_BUFFER[platform] === p.service)
    )

    if (matchedProfiles.length === 0) {
      return NextResponse.json({
        error: `No Buffer profiles found for: ${platforms.join(', ')}. Connect these accounts in your Buffer dashboard.`,
        configured: true,
      }, { status: 400 })
    }

    // 4. Determine scheduled time
    const finalScheduledAt = scheduledAt || await suggestPostTime(content, platforms)

    // 5. Schedule posts via Buffer
    const bufferIds: string[] = []
    const profilesQueued: string[] = []

    for (const profile of matchedProfiles) {
      try {
        const result = await scheduleBufferPost(bufferAccessToken, {
          profileIds: [profile.id],
          text: content,
          scheduledAt: finalScheduledAt,
          ...(mediaUrl ? { mediaLink: mediaUrl } : {}),
        })
        if (result?.id) {
          bufferIds.push(result.id)
        }
        profilesQueued.push(`${profile.service} (${profile.id})`)
      } catch (err) {
        console.error(`Failed to schedule to profile ${profile.id}:`, err)
      }
    }

    // 6. Log to scheduled_posts table
    for (const platform of platforms) {
      const postId = newId()
      await sql`
        INSERT INTO scheduled_posts (id, workspace_id, platform, content_json, artifact_id, scheduled_time, status)
        VALUES (
          ${postId},
          ${workspaceId},
          ${platform},
          ${JSON.stringify({ text: content, mediaUrl, bufferIds })},
          ${artifactId || null},
          ${finalScheduledAt},
          'scheduled'
        )
      `.catch(() => { /* table may not exist yet — ignore */ })
    }

    return NextResponse.json({
      scheduled: true,
      profilesQueued,
      scheduledAt: finalScheduledAt,
      bufferIds,
      message: `Scheduled to ${profilesQueued.length} profile${profilesQueued.length !== 1 ? 's' : ''} for ${new Date(finalScheduledAt).toLocaleString()}.`,
    })
  } catch (error) {
    console.error('Social Scheduler error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  // Return upcoming scheduled posts
  const result = await sql`
    SELECT sp.*, a.title as artifact_title
    FROM scheduled_posts sp
    LEFT JOIN artifacts a ON a.id = sp.artifact_id
    WHERE sp.workspace_id = ${workspaceId}
      AND sp.scheduled_time >= CURRENT_TIMESTAMP
    ORDER BY sp.scheduled_time ASC LIMIT 50
  `.catch(() => ({ rows: [] }))

  return NextResponse.json(result.rows)
}
