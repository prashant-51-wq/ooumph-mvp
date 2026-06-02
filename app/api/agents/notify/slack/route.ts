/**
 * Slack Notification Worker
 * Sends approval notifications and alerts to Slack.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { sendSlackMessage, sendApprovalRequest, sendSlackAlert } from '@/lib/tools/slack'
import { assertWorkspaceOwnership } from '@/lib/guards'

export async function POST(req: NextRequest) {
  try {
    const {
      workspaceId,
      type,
      artifactId,
      artifactType,
      title,
      message,
    } = await req.json() as {
      workspaceId: string
      type: 'approval_needed' | 'approved' | 'rejected' | 'alert' | 'test'
      artifactId?: string
      artifactType?: string
      title?: string
      message?: string
    }

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Load workspace model_settings
    const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const ws = wsResult.rows[0]
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    const ms = typeof ws.model_settings === 'string' ? JSON.parse(ws.model_settings || '{}') : (ws.model_settings || {})
    const slackBotToken: string = ms.slackBotToken || process.env.SLACK_BOT_TOKEN || ''
    const slackChannelId: string = ms.slackChannelId || process.env.SLACK_CHANNEL_ID || ''

    if (!slackBotToken || !slackChannelId) {
      return NextResponse.json({ error: 'Slack not configured. Add Bot Token and Channel ID in Settings → API Keys.', configured: false }, { status: 400 })
    }

    const dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://app.ooumph.com'}/dashboard/approvals`
    let sent = false
    let resultMessage = ''

    if (type === 'approval_needed') {
      sent = await sendApprovalRequest(slackBotToken, slackChannelId, {
        title: title || artifactType || 'New Content',
        type: artifactType || 'content',
        artifactId: artifactId || '',
        dashboardUrl,
      })
      resultMessage = sent ? 'Approval request sent to Slack.' : 'Failed to send approval request.'
    } else if (type === 'approved') {
      const text = `✅ *Content Approved*\n${title || artifactType || 'Content'} has been approved and is ready to publish.${artifactId ? `\nArtifact: ${artifactId}` : ''}`
      sent = await sendSlackMessage(slackBotToken, slackChannelId, text)
      resultMessage = sent ? 'Approval confirmation sent.' : 'Failed to send message.'
    } else if (type === 'rejected') {
      const text = `❌ *Content Rejected*\n${title || artifactType || 'Content'} was rejected.${message ? `\nReason: ${message}` : ''}`
      sent = await sendSlackMessage(slackBotToken, slackChannelId, text)
      resultMessage = sent ? 'Rejection notification sent.' : 'Failed to send message.'
    } else if (type === 'alert') {
      sent = await sendSlackAlert(slackBotToken, slackChannelId, {
        level: 'warning',
        title: title || 'Ooumph Alert',
        message: message || '',
      })
      resultMessage = sent ? 'Alert sent.' : 'Failed to send alert.'
    } else if (type === 'test') {
      sent = await sendSlackMessage(slackBotToken, slackChannelId, '✅ Ooumph is connected to Slack! Approval notifications will appear here.')
      resultMessage = sent ? 'Test message sent successfully!' : 'Failed to send test message. Check your token and channel ID.'
    } else {
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
    }

    return NextResponse.json({ sent, message: resultMessage })
  } catch (e) {
    console.error('Slack notification error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
