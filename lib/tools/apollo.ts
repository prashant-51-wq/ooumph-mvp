// Apollo.io People & Company Enrichment

import { getCredential } from '@/lib/credential-context'

const APOLLO_BASE = 'https://api.apollo.io/api/v1'

export interface ApolloPerson {
  id?: string
  name?: string
  first_name?: string
  last_name?: string
  email?: string
  title?: string
  organization_name?: string
  linkedin_url?: string
  city?: string
  state?: string
  country?: string
  seniority?: string
  phone_numbers?: { raw_number: string }[]
}

export interface ApolloCompany {
  id?: string
  name?: string
  website_url?: string
  industry?: string
  estimated_num_employees?: number
  short_description?: string
  city?: string
  country?: string
  linkedin_url?: string
}

export async function enrichPerson(email: string): Promise<ApolloPerson | null> {
  const key = getCredential('APOLLO_API_KEY')
  if (!key) return null
  try {
    const res = await fetch(`${APOLLO_BASE}/people/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        email,
        reveal_personal_emails: true,
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return (json.person as ApolloPerson) ?? null
  } catch {
    return null
  }
}

export async function enrichCompany(domain: string): Promise<ApolloCompany | null> {
  const key = getCredential('APOLLO_API_KEY')
  if (!key) return null
  try {
    const res = await fetch(`${APOLLO_BASE}/organizations/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, domain }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return (json.organization as ApolloCompany) ?? null
  } catch {
    return null
  }
}

export async function searchPeople(filters: {
  organizationName?: string
  titles?: string[]
  locations?: string[]
  page?: number
}): Promise<ApolloPerson[]> {
  const key = getCredential('APOLLO_API_KEY')
  if (!key) return []
  try {
    const body: Record<string, unknown> = {
      api_key: key,
      per_page: 25,
    }
    if (filters.organizationName) body.q_organization_name = filters.organizationName
    if (filters.titles?.length) body.person_titles = filters.titles
    if (filters.locations?.length) body.person_locations = filters.locations
    if (filters.page) body.page = filters.page

    const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.people as ApolloPerson[]) ?? []
  } catch {
    return []
  }
}

export function isApolloAvailable(): boolean {
  return !!getCredential('APOLLO_API_KEY')
}
