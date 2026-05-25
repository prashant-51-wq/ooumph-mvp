// Buffer API v1

const BUFFER_BASE = 'https://api.bufferapp.com/1'

export interface BufferProfile {
  id: string
  service: string
  service_username: string
  avatar: string
  formatted_username: string
}

export interface BufferUpdate {
  id: string
  status: string
  text: string
  profile_ids: string[]
  scheduled_at: string
}

export async function getBufferProfiles(accessToken: string): Promise<BufferProfile[]> {
  if (!accessToken) return []
  try {
    const res = await fetch(`${BUFFER_BASE}/profiles.json?access_token=${encodeURIComponent(accessToken)}`)
    if (!res.ok) return []
    const json = await res.json()
    const profiles = Array.isArray(json) ? json : []
    return profiles.map(
      (p: {
        id: string
        service: string
        service_username: string
        avatar: string
        formatted_username: string
      }) => ({
        id: p.id || '',
        service: p.service || '',
        service_username: p.service_username || '',
        avatar: p.avatar || '',
        formatted_username: p.formatted_username || '',
      })
    )
  } catch {
    return []
  }
}

export async function scheduleBufferPost(
  accessToken: string,
  data: {
    profileIds: string[]
    text: string
    scheduledAt?: string
    mediaLink?: string
    mediaDescription?: string
  }
): Promise<{ id: string; url: string } | null> {
  if (!accessToken) return null
  try {
    const params = new URLSearchParams()
    params.append('access_token', accessToken)
    params.append('text', data.text)
    for (const id of data.profileIds) {
      params.append('profile_ids[]', id)
    }
    if (data.scheduledAt && data.scheduledAt !== 'now') {
      params.append('scheduled_at', data.scheduledAt)
    } else {
      params.append('now', 'true')
    }
    if (data.mediaLink) params.append('media[link]', data.mediaLink)
    if (data.mediaDescription) params.append('media[description]', data.mediaDescription)

    const res = await fetch(`${BUFFER_BASE}/updates/create.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!res.ok) return null
    const json = await res.json()
    const update = json.updates?.[0] || json
    if (!update?.id) return null
    return {
      id: update.id,
      url: `https://buffer.com/app/profile/${data.profileIds[0]}/buffer/queue`,
    }
  } catch {
    return null
  }
}

export async function getBufferPendingUpdates(
  accessToken: string,
  profileId: string
): Promise<BufferUpdate[]> {
  if (!accessToken) return []
  try {
    const res = await fetch(
      `${BUFFER_BASE}/profiles/${profileId}/updates/pending.json?access_token=${encodeURIComponent(accessToken)}`
    )
    if (!res.ok) return []
    const json = await res.json()
    const updates = json.updates || []
    return (Array.isArray(updates) ? updates : []).map(
      (u: {
        id: string
        status: string
        text: string
        profile_ids?: string[]
        scheduled_at?: string
        due_at?: string
      }) => ({
        id: u.id || '',
        status: u.status || '',
        text: u.text || '',
        profile_ids: u.profile_ids || [profileId],
        scheduled_at: u.scheduled_at || u.due_at || '',
      })
    )
  } catch {
    return []
  }
}

export async function testBufferConnection(accessToken: string): Promise<boolean> {
  if (!accessToken) return false
  try {
    const res = await fetch(
      `${BUFFER_BASE}/user.json?access_token=${encodeURIComponent(accessToken)}`
    )
    return res.ok
  } catch {
    return false
  }
}
