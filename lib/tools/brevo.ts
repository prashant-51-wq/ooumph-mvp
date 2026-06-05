// Brevo (formerly Sendinblue) Transactional Email & Marketing

import { getCredential } from '@/lib/credential-context'

const BREVO_BASE = 'https://api.brevo.com/v3'

export interface BrevoList {
  id: number
  name: string
  totalBlacklisted: number
  totalSubscribers: number
}

export interface BrevoCampaign {
  id: number
  name: string
  status: string
  subject?: string
}

export async function sendTransactionalEmail(
  to: string,
  subject: string,
  htmlContent: string,
  fromName = 'Ooumph',
  fromEmail?: string
): Promise<boolean> {
  const key = getCredential('BREVO_API_KEY')
  if (!key) return false
  try {
    const senderEmail =
      fromEmail ?? getCredential('BREVO_FROM_EMAIL') ?? 'noreply@ooumph.ai'
    const res = await fetch(`${BREVO_BASE}/smtp/email`, {
      method: 'POST',
      headers: {
        'api-key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: fromName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function createEmailCampaign(
  name: string,
  subject: string,
  htmlContent: string,
  listIds: number[],
  fromName = 'Ooumph'
): Promise<{ id: number } | null> {
  const key = getCredential('BREVO_API_KEY')
  if (!key) return null
  try {
    const fromEmail =
      getCredential('BREVO_FROM_EMAIL') ?? 'noreply@ooumph.ai'
    const res = await fetch(`${BREVO_BASE}/emailCampaigns`, {
      method: 'POST',
      headers: {
        'api-key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        subject,
        sender: { name: fromName, email: fromEmail },
        type: 'classic',
        htmlContent,
        recipients: { listIds },
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.id != null ? { id: json.id as number } : null
  } catch {
    return null
  }
}

export async function getContacts(
  limit = 50
): Promise<{ contacts: { email: string; attributes?: Record<string, string> }[]; count: number } | null> {
  const key = getCredential('BREVO_API_KEY')
  if (!key) return null
  try {
    const res = await fetch(`${BREVO_BASE}/contacts?limit=${limit}`, {
      headers: { 'api-key': key },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function createContact(
  email: string,
  attributes?: Record<string, string>,
  listIds?: number[]
): Promise<boolean> {
  const key = getCredential('BREVO_API_KEY')
  if (!key) return false
  try {
    const res = await fetch(`${BREVO_BASE}/contacts`, {
      method: 'POST',
      headers: {
        'api-key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        attributes: attributes ?? {},
        listIds: listIds ?? [],
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function getBrevoLists(): Promise<BrevoList[]> {
  const key = getCredential('BREVO_API_KEY')
  if (!key) return []
  try {
    const res = await fetch(`${BREVO_BASE}/contacts/lists?limit=50`, {
      headers: { 'api-key': key },
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.lists as BrevoList[]) ?? []
  } catch {
    return []
  }
}

export function isBrevoAvailable(): boolean {
  return !!getCredential('BREVO_API_KEY')
}
