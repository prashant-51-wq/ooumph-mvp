/**
 * Cron: /api/cron/publish-scheduled — runs every hour (Vercel cron)
 * Picks up calendar items whose scheduled_time has passed and publishes them
 * via the Social Publisher agent.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { Resend } from 'resend'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // Vercel cron passes Authorization header with CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch all scheduled posts that are due and not yet published
    const now = new Date().toISOString()
    const dueResult = await sql`
      SELECT sp.id, sp.workspace_id, sp.platform, sp.content_json, sp.artifact_id
      FROM scheduled_posts sp
      WHERE sp.scheduled_time <= ${now}
        AND sp.status = 'queued'
      ORDER BY sp.scheduled_time ASC
      LIMIT 50
    `

    const results: Array<{ id: string; platform: string; status: string; error?: string }> = []

    for (const post of dueResult.rows) {
      const postId = String(post.id)
      const workspaceId = String(post.workspace_id)
      const platform = String(post.platform)
      const contentJson = post.content_json as Record<string, unknown>

      try {
        // Check HITL approval for the linked artifact
        if (post.artifact_id) {
          const approvalResult = await sql`
            SELECT status FROM approvals WHERE artifact_id = ${post.artifact_id} LIMIT 1
          `
          if (approvalResult.rows[0]?.status !== 'approved') {
            await sql`UPDATE scheduled_posts SET status = 'skipped', error = 'Pending approval' WHERE id = ${postId}`
            results.push({ id: postId, platform, status: 'skipped', error: 'Pending approval' })
            continue
          }
        }

        // ── Email platform handler ─────────────────────────────────────────────
        if (platform === 'email') {
          const resendKey = process.env.RESEND_API_KEY
          if (!resendKey) {
            await sql`UPDATE scheduled_posts SET status = 'failed', error = 'RESEND_API_KEY not configured' WHERE id = ${postId}`
            results.push({ id: postId, platform, status: 'failed', error: 'RESEND_API_KEY not configured' })
            continue
          }
          const resend = new Resend(resendKey)
          const c = contentJson
          try {
            await resend.emails.send({
              from: String(c.from || 'noreply@resend.dev'),
              to: String(c.to),
              subject: String(c.subject || ''),
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;line-height:1.6;">
                <p style="color:#6b7280;font-size:12px;">${String(c.previewText || '')}</p>
                ${String(c.body || '').replace(/\n/g, '<br>')}
                <br><br>
                <a href="${String(c.ctaUrl || '#')}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">${String(c.cta || 'Learn More')}</a>
                <p style="color:#9ca3af;font-size:11px;margin-top:32px;"><a href="#" style="color:#9ca3af;">Unsubscribe</a></p>
              </div>`,
            })
            await sql`UPDATE scheduled_posts SET status = 'published', published_at = CURRENT_TIMESTAMP WHERE id = ${postId}`
            results.push({ id: postId, platform, status: 'published' })
          } catch (e) {
            const errMsg = String(e)
            await sql`UPDATE scheduled_posts SET status = 'failed', error = ${errMsg} WHERE id = ${postId}`
            results.push({ id: postId, platform, status: 'failed', error: errMsg })
          }
          continue // skip social publish logic below
        }

        // Call the Social Publisher API
        const publishRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            platform,
            content: contentJson.content || contentJson.hook || '',
            imageUrl: contentJson.imageUrl,
            artifactId: post.artifact_id,
          }),
        })

        const publishData = await publishRes.json() as Record<string, unknown>

        if (publishRes.ok && !publishData.error) {
          await sql`UPDATE scheduled_posts SET status = 'published', published_at = CURRENT_TIMESTAMP WHERE id = ${postId}`
          results.push({ id: postId, platform, status: 'published' })
        } else {
          const errMsg = String(publishData.error || 'Publish failed')
          await sql`UPDATE scheduled_posts SET status = 'failed', error = ${errMsg} WHERE id = ${postId}`
          results.push({ id: postId, platform, status: 'failed', error: errMsg })
        }
      } catch (e) {
        const errMsg = String(e)
        await sql`UPDATE scheduled_posts SET status = 'failed', error = ${errMsg} WHERE id = ${postId}`
        results.push({ id: postId, platform, status: 'failed', error: errMsg })
      }
    }

    return NextResponse.json({
      processedAt: now,
      processed: results.length,
      results,
    })
  } catch (error) {
    console.error('Publish cron error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
