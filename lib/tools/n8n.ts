// n8n REST API + Webhook triggers

export interface N8nWorkflow {
  id: string
  name: string
  active: boolean
  createdAt: string
}

export async function triggerN8nWebhook(
  baseUrl: string,
  webhookPath: string,
  data: Record<string, unknown>,
  apiKey?: string
): Promise<{ success: boolean; response?: unknown }> {
  if (!baseUrl) return { success: false }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['X-N8N-API-KEY'] = apiKey
    const res = await fetch(`${baseUrl}/webhook/${webhookPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    })
    if (!res.ok) return { success: false }
    let response: unknown
    try {
      response = await res.json()
    } catch {
      response = await res.text()
    }
    return { success: true, response }
  } catch {
    return { success: false }
  }
}

export async function getN8nWorkflows(
  baseUrl: string,
  apiKey: string
): Promise<N8nWorkflow[]> {
  if (!baseUrl || !apiKey) return []
  try {
    const res = await fetch(`${baseUrl}/api/v1/workflows`, {
      headers: { 'X-N8N-API-KEY': apiKey },
    })
    if (!res.ok) return []
    const json = await res.json()
    const workflows = json.data || json.workflows || json || []
    return (Array.isArray(workflows) ? workflows : []).map(
      (w: { id: string | number; name: string; active: boolean; createdAt: string }) => ({
        id: String(w.id),
        name: w.name || '',
        active: w.active ?? false,
        createdAt: w.createdAt || '',
      })
    )
  } catch {
    return []
  }
}

export async function activateN8nWorkflow(
  baseUrl: string,
  apiKey: string,
  workflowId: string
): Promise<boolean> {
  if (!baseUrl || !apiKey) return false
  try {
    const res = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}/activate`, {
      method: 'PATCH',
      headers: { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function testN8nConnection(
  baseUrl: string,
  apiKey: string
): Promise<boolean> {
  if (!baseUrl || !apiKey) return false
  try {
    const res = await fetch(`${baseUrl}/api/v1/workflows?limit=1`, {
      headers: { 'X-N8N-API-KEY': apiKey },
    })
    return res.ok
  } catch {
    return false
  }
}

export function buildN8nWebhookUrl(baseUrl: string, workflowName: string): string {
  const slug = workflowName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  return `${baseUrl}/webhook/${slug}`
}
