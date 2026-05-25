// HubSpot CRM REST API v3

export interface HubSpotContact {
  id: string
  email: string
  firstname: string
  lastname: string
  company: string
  phone: string
  hs_lead_status: string
}

export interface HubSpotDeal {
  id: string
  dealname: string
  amount: string
  dealstage: string
  closedate: string
}

export async function createHubSpotContact(
  token: string,
  data: {
    email: string
    firstname?: string
    lastname?: string
    company?: string
    phone?: string
    notes?: string
  }
): Promise<{ id: string; url: string } | null> {
  if (!token) return null
  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          email: data.email,
          firstname: data.firstname || '',
          lastname: data.lastname || '',
          company: data.company || '',
          phone: data.phone || '',
          ...(data.notes ? { hs_content_membership_notes: data.notes } : {}),
        },
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return {
      id: json.id,
      url: `https://app.hubspot.com/contacts/contact/${json.id}`,
    }
  } catch {
    return null
  }
}

export async function searchHubSpotContact(
  token: string,
  email: string
): Promise<HubSpotContact | null> {
  if (!token) return null
  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
          },
        ],
        properties: ['email', 'firstname', 'lastname', 'company', 'phone', 'hs_lead_status'],
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const result = json.results?.[0]
    if (!result) return null
    return {
      id: result.id,
      email: result.properties?.email || '',
      firstname: result.properties?.firstname || '',
      lastname: result.properties?.lastname || '',
      company: result.properties?.company || '',
      phone: result.properties?.phone || '',
      hs_lead_status: result.properties?.hs_lead_status || '',
    }
  } catch {
    return null
  }
}

export async function updateHubSpotContact(
  token: string,
  contactId: string,
  data: Record<string, string>
): Promise<boolean> {
  if (!token) return false
  try {
    const res = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties: data }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function createHubSpotDeal(
  token: string,
  data: {
    dealname: string
    amount?: number
    dealstage?: string
    associatedContactId?: string
  }
): Promise<{ id: string } | null> {
  if (!token) return null
  try {
    const body: Record<string, unknown> = {
      properties: {
        dealname: data.dealname,
        dealstage: data.dealstage || 'appointmentscheduled',
        ...(data.amount !== undefined ? { amount: String(data.amount) } : {}),
      },
    }
    if (data.associatedContactId) {
      body.associations = [
        {
          to: { id: data.associatedContactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
        },
      ]
    }
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const json = await res.json()
    return { id: json.id }
  } catch {
    return null
  }
}

export async function getHubSpotPipeline(
  token: string
): Promise<{ stages: { id: string; label: string }[] } | null> {
  if (!token) return null
  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const json = await res.json()
    const pipelines = json.results || []
    const stages: { id: string; label: string }[] = []
    for (const pipeline of pipelines) {
      for (const stage of pipeline.stages || []) {
        stages.push({ id: stage.id, label: stage.label })
      }
    }
    return { stages }
  } catch {
    return null
  }
}

export async function syncLeadToHubSpot(
  token: string,
  lead: {
    name: string
    email: string
    phone?: string
    company?: string
    source?: string
    score?: number
    notes?: string
  }
): Promise<{ contactId: string; created: boolean } | null> {
  if (!token) return null
  try {
    const [firstname, ...rest] = lead.name.trim().split(' ')
    const lastname = rest.join(' ')

    const existing = await searchHubSpotContact(token, lead.email)

    if (existing) {
      const updateData: Record<string, string> = {}
      if (lead.phone) updateData.phone = lead.phone
      if (lead.company) updateData.company = lead.company
      if (lead.source) updateData.hs_lead_source = lead.source
      if (lead.score !== undefined) updateData.hubspotscore = String(lead.score)
      if (Object.keys(updateData).length > 0) {
        await updateHubSpotContact(token, existing.id, updateData)
      }
      return { contactId: existing.id, created: false }
    }

    const created = await createHubSpotContact(token, {
      email: lead.email,
      firstname,
      lastname,
      company: lead.company,
      phone: lead.phone,
      notes: lead.notes,
    })

    if (!created) return null
    return { contactId: created.id, created: true }
  } catch {
    return null
  }
}
