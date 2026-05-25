/**
 * Telegram Notification Worker
 * Sends approval notifications and alerts via Telegram Bot.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { sendTelegramMessage, sendApprovalMessage, sendTelegramAlert } from '@/lib/tools/telegram'

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
      type: 'approval_needed' | 'alert' | 'test'
      artifactId?: string
      artifactType?: string
      title?: string
      message?: string
    }

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    // Load workspace model_settings
    const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const ws = wsResult.rows[0]
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    const ms = typeof ws.model_settings === 'string' ? JSON.parse(ws.model_settings || '{}') : (ws.model_settings || {})
    const telegramBotToken: string = ms.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || ''
    const telegramChatId: string = ms.telegramChatId || process.env.TELEGRAM_CHAT_ID || ''

    if (!telegramBotToken || !telegramChatId) {
      return NextResponse.json({ error: 'Telegram not configured. Add Bot Token and Chat ID in Settings → API Keys.', configured: false }, { status: 400 })
    }

    const dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://app.ooumph.com'}/dashboard/approvals`
    let sent = false

    if (type === 'approval_needed') {
      sent = await sendApprovalMessage(telegramBotToken, telegramChatId, {
        title: title || artifactType || 'New Content',
        type: artifactType || 'content',
        artifactId: artifactId || '',
        dashboardUrl,
      })
    } else if (type === 'alert') {
      sent = await sendTelegramAlert(telegramBotToken, telegramChatId, title || 'Ooumph Alert', message || '', 'warning')
    } else if (type === 'test') {
      sent = await sendTelegramMessage(
        telegramBotToken,
        telegramChatId,
        '✅ <b>Ooumph connected!</b>\n\nYou will receive approval notifications here when new content is ready for review.',
        'HTML'
      )
    } else {
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
    }

    return NextResponse.json({ sent })
  } catch (e) {
    console.error('Telegram notification error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
