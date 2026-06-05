// Hunter.io Email Finder & Verification

import { getCredential } from '@/lib/credential-context'

const HUNTER_BASE = 'https://api.hunter.io/v2'

export interface HunterEmailResult {
  email: string
  score: number
  position?: string
  smtp_server_accept_all?: boolean
}

export interface HunterVerifyResult {
  result: 'deliverable' | 'undeliverable' | 'risky' | 'unknown'
  score: number
  disposable: boolean
  mx_records: boolean
}

export interface HunterDomainResult {
  organization?: string
  emails: {
    value: string
    type?: string
    confidence?: number
    first_name?: string
    last_name?: string
    position?: string
  }[]
}

export async function findEmail(
  domain: string,
  firstName: string,
  lastName: string
): Promise<HunterEmailResult | null> {
  const key = getCredential('HUNTER_API_KEY')
  if (!key) return null
  try {
    const params = new URLSearchParams({
      domain,
      first_name: firstName,
      last_name: lastName,
      api_key: key,
    })
    const res = await fetch(`${HUNTER_BASE}/email-finder?${params}`)
    if (!res.ok) return null
    const json = await res.json()
    return (json.data as HunterEmailResult) ?? null
  } catch {
    return null
  }
}

export async function verifyEmail(
  email: string
): Promise<HunterVerifyResult | null> {
  const key = getCredential('HUNTER_API_KEY')
  if (!key) return null
  try {
    const params = new URLSearchParams({ email, api_key: key })
    const res = await fetch(`${HUNTER_BASE}/email-verifier?${params}`)
    if (!res.ok) return null
    const json = await res.json()
    return (json.data as HunterVerifyResult) ?? null
  } catch {
    return null
  }
}

export async function domainSearch(
  domain: string,
  limit = 10
): Promise<HunterDomainResult | null> {
  const key = getCredential('HUNTER_API_KEY')
  if (!key) return null
  try {
    const params = new URLSearchParams({
      domain,
      limit: String(limit),
      api_key: key,
    })
    const res = await fetch(`${HUNTER_BASE}/domain-search?${params}`)
    if (!res.ok) return null
    const json = await res.json()
    return (json.data as HunterDomainResult) ?? null
  } catch {
    return null
  }
}

export function isHunterAvailable(): boolean {
  return !!getCredential('HUNTER_API_KEY')
}
