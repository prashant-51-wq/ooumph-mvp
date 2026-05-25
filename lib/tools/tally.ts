// Tally API

const TALLY_BASE = 'https://api.tally.so'

export interface TallyForm {
  id: string
  title: string
  status: string
  createdAt: string
  embedUrl: string
}

export interface TallySubmission {
  id: string
  formId: string
  createdAt: string
  fields: { key: string; label: string; value: string }[]
}

export async function getTallyForms(apiKey: string): Promise<TallyForm[]> {
  if (!apiKey) return []
  try {
    const res = await fetch(`${TALLY_BASE}/forms`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return []
    const json = await res.json()
    const forms = json.forms || json.data || json || []
    return (Array.isArray(forms) ? forms : []).map(
      (f: { id: string; title: string; status: string; createdAt: string }) => ({
        id: f.id,
        title: f.title || '',
        status: f.status || '',
        createdAt: f.createdAt || '',
        embedUrl: `https://tally.so/embed/${f.id}`,
      })
    )
  } catch {
    return []
  }
}

export async function getTallySubmissions(
  apiKey: string,
  formId: string,
  page = 1
): Promise<TallySubmission[]> {
  if (!apiKey) return []
  try {
    const res = await fetch(
      `${TALLY_BASE}/forms/${formId}/submissions?page=${page}&limit=50`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    )
    if (!res.ok) return []
    const json = await res.json()
    const submissions = json.submissions || json.data || json || []
    return (Array.isArray(submissions) ? submissions : []).map(
      (s: {
        id: string
        formId?: string
        createdAt: string
        fields?: { key: string; label: string; value: string }[]
        responses?: { key: string; label: string; value: string }[]
      }) => ({
        id: s.id,
        formId: s.formId || formId,
        createdAt: s.createdAt || '',
        fields: (s.fields || s.responses || []).map(
          (f: { key: string; label: string; value: unknown }) => ({
            key: f.key || '',
            label: f.label || '',
            value: typeof f.value === 'string' ? f.value : JSON.stringify(f.value ?? ''),
          })
        ),
      })
    )
  } catch {
    return []
  }
}

export function getTallyEmbedCode(
  formId: string,
  options?: { width?: string; height?: string; hideTitle?: boolean }
): string {
  const hideTitle = options?.hideTitle ? 1 : 0
  const width = options?.width || '100%'
  const height = options?.height || '500px'
  return `<iframe src="https://tally.so/embed/${formId}?alignLeft=1&hideTitle=${hideTitle}" width="${width}" height="${height}" frameborder="0" marginheight="0" marginwidth="0" title="Form"></iframe>`
}

export function getTallyShareUrl(formId: string): string {
  return `https://tally.so/r/${formId}`
}
