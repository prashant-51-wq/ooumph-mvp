// Slack Web API (Bot Token)

export async function sendSlackMessage(
  botToken: string,
  channel: string,
  text: string
): Promise<boolean> {
  if (!botToken) return false
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, text }),
    })
    if (!res.ok) return false
    const json = await res.json()
    return json.ok === true
  } catch {
    return false
  }
}

export async function sendSlackBlocks(
  botToken: string,
  channel: string,
  text: string,
  blocks: object[]
): Promise<boolean> {
  if (!botToken) return false
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, text, blocks }),
    })
    if (!res.ok) return false
    const json = await res.json()
    return json.ok === true
  } catch {
    return false
  }
}

export async function sendApprovalRequest(
  botToken: string,
  channel: string,
  item: {
    title: string
    type: string
    artifactId: string
    preview?: string
    dashboardUrl: string
  }
): Promise<boolean> {
  if (!botToken) return false
  try {
    const previewText = item.preview ? item.preview.slice(0, 200) : null
    const blocks: object[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🔔 New content ready for approval', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${item.title}*\n_Type: ${item.type}_`,
        },
      },
      ...(previewText
        ? [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `>${previewText}` },
            },
          ]
        : []),
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve', emoji: true },
            style: 'primary',
            action_id: `approve_${item.artifactId}`,
            value: item.artifactId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '✏️ Review in Dashboard', emoji: true },
            url: item.dashboardUrl,
            action_id: `review_${item.artifactId}`,
          },
        ],
      },
    ]

    return await sendSlackBlocks(botToken, channel, '🔔 New content ready for approval', blocks)
  } catch {
    return false
  }
}

export async function sendSlackAlert(
  botToken: string,
  channel: string,
  alert: {
    level: 'info' | 'warning' | 'error'
    title: string
    message: string
    emoji?: string
  }
): Promise<boolean> {
  if (!botToken) return false
  try {
    const emojiMap = { info: 'ℹ️', warning: '⚠️', error: '🚨' }
    const colorMap = { info: '#36a64f', warning: '#ff9800', error: '#e53935' }
    const prefix = alert.emoji || emojiMap[alert.level]

    const blocks: object[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${prefix} *${alert.title}*\n${alert.message}`,
        },
      },
    ]

    const attachments = [
      {
        color: colorMap[alert.level],
        blocks,
      },
    ]

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        text: `${prefix} ${alert.title}`,
        attachments,
      }),
    })
    if (!res.ok) return false
    const json = await res.json()
    return json.ok === true
  } catch {
    return false
  }
}

export async function getSlackChannels(
  botToken: string
): Promise<{ id: string; name: string }[]> {
  if (!botToken) return []
  try {
    const res = await fetch('https://slack.com/api/conversations.list', {
      headers: { Authorization: `Bearer ${botToken}` },
    })
    if (!res.ok) return []
    const json = await res.json()
    if (!json.ok) return []
    return (json.channels || []).map((c: { id: string; name: string }) => ({
      id: c.id,
      name: c.name,
    }))
  } catch {
    return []
  }
}
