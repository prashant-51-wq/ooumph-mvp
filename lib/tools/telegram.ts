// Telegram Bot API

const TG_BASE = (token: string) => `https://api.telegram.org/bot${token}`

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<boolean> {
  if (!botToken) return false
  try {
    const res = await fetch(`${TG_BASE(botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
    })
    if (!res.ok) return false
    const json = await res.json()
    return json.ok === true
  } catch {
    return false
  }
}

export async function sendApprovalMessage(
  botToken: string,
  chatId: string,
  item: {
    title: string
    type: string
    artifactId: string
    dashboardUrl: string
  }
): Promise<boolean> {
  if (!botToken) return false
  try {
    const text = `🔔 <b>New content ready for approval</b>\n\n<b>${item.type}</b>: ${item.title}`
    const replyMarkup = {
      inline_keyboard: [
        [{ text: '✅ Open in Dashboard', url: item.dashboardUrl }],
      ],
    }
    const res = await fetch(`${TG_BASE(botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    })
    if (!res.ok) return false
    const json = await res.json()
    return json.ok === true
  } catch {
    return false
  }
}

export async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  title: string,
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): Promise<boolean> {
  if (!botToken) return false
  try {
    const emojiMap = { info: 'ℹ️', warning: '⚠️', error: '🚨' }
    const prefix = emojiMap[level]
    const text = `${prefix} <b>${title}</b>\n\n${message}`
    return await sendTelegramMessage(botToken, chatId, text, 'HTML')
  } catch {
    return false
  }
}

export async function getTelegramBotInfo(
  botToken: string
): Promise<{ username: string; first_name: string } | null> {
  if (!botToken) return null
  try {
    const res = await fetch(`${TG_BASE(botToken)}/getMe`)
    if (!res.ok) return null
    const json = await res.json()
    if (!json.ok) return null
    return {
      username: json.result?.username || '',
      first_name: json.result?.first_name || '',
    }
  } catch {
    return null
  }
}
