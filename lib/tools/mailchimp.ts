// Mailchimp Email Marketing API

function mailchimpBase(): string {
  const server = process.env.MAILCHIMP_SERVER ?? 'us1'
  return `https://${server}.api.mailchimp.com/3.0`
}

function mailchimpAuth(): string {
  const key = process.env.MAILCHIMP_API_KEY ?? ''
  return `Basic ${Buffer.from(`anystring:${key}`).toString('base64')}`
}

export interface MailchimpList {
  id: string
  name: string
  stats?: { member_count: number; open_rate: number; click_rate: number }
}

export interface MailchimpCampaign {
  id: string
  status: string
  settings?: { subject_line: string; from_name: string }
  send_time?: string
}

export async function getLists(): Promise<MailchimpList[]> {
  if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_SERVER) return []
  try {
    const res = await fetch(`${mailchimpBase()}/lists?count=100`, {
      headers: { Authorization: mailchimpAuth() },
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.lists as MailchimpList[]) ?? []
  } catch {
    return []
  }
}

export async function addSubscriber(
  listId: string,
  email: string,
  mergeFields?: { FNAME?: string; LNAME?: string; [key: string]: string | undefined }
): Promise<boolean> {
  if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_SERVER) return false
  try {
    const res = await fetch(`${mailchimpBase()}/lists/${listId}/members`, {
      method: 'POST',
      headers: {
        Authorization: mailchimpAuth(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_address: email,
        status: 'subscribed',
        merge_fields: mergeFields ?? {},
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function createCampaign(
  listId: string,
  subject: string,
  htmlContent: string,
  fromName = 'Ooumph',
  replyTo = 'noreply@ooumph.ai'
): Promise<string | null> {
  if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_SERVER) return null
  try {
    const createRes = await fetch(`${mailchimpBase()}/campaigns`, {
      method: 'POST',
      headers: {
        Authorization: mailchimpAuth(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'regular',
        recipients: { list_id: listId },
        settings: {
          subject_line: subject,
          from_name: fromName,
          reply_to: replyTo,
        },
      }),
    })
    if (!createRes.ok) return null
    const campaign = await createRes.json()
    const campaignId: string = campaign.id
    if (!campaignId) return null

    const contentRes = await fetch(
      `${mailchimpBase()}/campaigns/${campaignId}/content`,
      {
        method: 'PUT',
        headers: {
          Authorization: mailchimpAuth(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ html: htmlContent }),
      }
    )
    if (!contentRes.ok) return null
    return campaignId
  } catch {
    return null
  }
}

export async function getCampaigns(count = 10): Promise<MailchimpCampaign[]> {
  if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_SERVER) return []
  try {
    const res = await fetch(`${mailchimpBase()}/campaigns?count=${count}`, {
      headers: { Authorization: mailchimpAuth() },
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.campaigns as MailchimpCampaign[]) ?? []
  } catch {
    return []
  }
}

export async function getCampaignReport(
  campaignId: string
): Promise<{ opens: { open_rate: number }; clicks: { click_rate: number }; emails_sent: number } | null> {
  if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_SERVER) return null
  try {
    const res = await fetch(`${mailchimpBase()}/reports/${campaignId}`, {
      headers: { Authorization: mailchimpAuth() },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export function isMailchimpAvailable(): boolean {
  return !!process.env.MAILCHIMP_API_KEY && !!process.env.MAILCHIMP_SERVER
}
