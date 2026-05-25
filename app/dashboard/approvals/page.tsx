'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface ApprovalItem {
  id: string
  artifact_id: string
  artifact_type: string
  artifact_title: string
  content_json: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  notes: string
  created_at: string
}

const TYPE_LABELS: Record<string, string> = {
  strategy: '🧠 Strategy',
  content_calendar: '📅 Content Calendar',
  carousel: '🖼️ Carousel',
  reelScript: '🎬 Reel Script',
  adCopy: '📢 Ad Copy',
  emailDraft: '📧 Email Draft',
  linkedInPost: '💼 LinkedIn Post',
  funnel_plan: '🔮 Funnel Plan',
  lead_gen_plan: '🎯 Lead Gen Plan',
  visual_carousel: '🎨 Visual Carousel',
  youtube_thumbnail: '📺 YouTube Thumbnail',
  visual_post: '🖼️ Static Post',
  visual_story: '📱 Story Cover',
  visual_ad: '📢 Ad Creative',
  video_brief: '🎬 Video Brief',
  video_edit_plan: '✂️ Video Edit Plan',
  landing_visual_pack: '🏠 Landing Page',
}

const PUBLISHABLE: Record<string, string[]> = {
  visual_carousel: ['instagram', 'facebook'],
  youtube_thumbnail: ['instagram'],
  linkedInPost: ['linkedin', 'twitter'],
  visual_post: ['instagram', 'linkedin', 'facebook', 'twitter'],
  visual_story: ['instagram', 'facebook'],
  visual_ad: ['instagram', 'linkedin', 'facebook'],
}

const REGENERATABLE = ['carousel', 'reelScript', 'adCopy', 'emailDraft', 'linkedInPost', 'visual_post', 'visual_carousel', 'visual_story', 'visual_ad', 'youtube_thumbnail']

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ''

function buildCreativeUrl(content: Record<string, unknown>, type: string): string {
  const tone = (content.tone as string) || 'professional'
  const business = ((content.businessName as string) || '').slice(0, 40)
  const params = new URLSearchParams({ tone, business })

  if (type === 'visual_post') {
    params.set('hook', ((content.hook as string) || '').slice(0, 80))
    params.set('body', ((content.body as string) || '').slice(0, 120))
    params.set('cta', ((content.cta as string) || '').slice(0, 60))
    params.set('platform', (content.platform as string) || 'instagram')
    return `${BASE_URL}/api/creative/static-post?${params}`
  }
  if (type === 'visual_story') {
    params.set('hook', ((content.hook as string) || '').slice(0, 80))
    params.set('subtext', ((content.subtext as string) || '').slice(0, 100))
    params.set('cta', ((content.cta as string) || '').slice(0, 60))
    params.set('label', ((content.label as string) || 'NEW').slice(0, 20))
    return `${BASE_URL}/api/creative/story-cover?${params}`
  }
  if (type === 'visual_ad') {
    params.set('size', 'square')
    params.set('headline', ((content.headline as string) || '').slice(0, 80))
    params.set('subtext', ((content.subtext as string) || '').slice(0, 120))
    params.set('cta', ((content.cta as string) || '').slice(0, 50))
    params.set('offer', ((content.offer as string) || '').slice(0, 60))
    return `${BASE_URL}/api/creative/ad-creative?${params}`
  }
  if (type === 'youtube_thumbnail') {
    params.set('layout', (content.layout as string) || 'hook')
    params.set('headline', ((content.headline as string) || '').slice(0, 60))
    params.set('subtext', ((content.subtext as string) || '').slice(0, 80))
    if (content.accentNumber) params.set('accentNumber', String(content.accentNumber).slice(0, 10))
    if (content.accentWord) params.set('accentWord', String(content.accentWord).slice(0, 20))
    return `${BASE_URL}/api/creative/thumbnail?${params}`
  }
  if (type === 'visual_carousel') {
    const slides = content.slides as Array<{ type: string; title?: string; coverText?: string }> | undefined
    const cover = slides?.find(s => s.type === 'cover')
    params.set('type', 'cover')
    params.set('title', (cover?.title || '').slice(0, 100))
    params.set('coverText', (cover?.coverText || '').slice(0, 150))
    return `${BASE_URL}/api/creative/carousel/slide?${params}`
  }
  return ''
}

export default function ApprovalsPage() {
  const router = useRouter()
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ApprovalItem | null>(null)
  const [notes, setNotes] = useState('')
  const [feedbackText, setFeedbackText] = useState('')
  const [acting, setActing] = useState(false)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [regenResult, setRegenResult] = useState<{ artifactId: string; asset: Record<string, unknown> } | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [publishResult, setPublishResult] = useState<Record<string, { url: string; platform: string }>>({})
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')

  const load = useCallback(async () => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) { router.push('/dashboard/onboarding'); return }
    const res = await fetch(`/api/approvals?workspaceId=${workspaceId}`)
    const data = await res.json()
    setItems(data)
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (selected) { setNotes(''); setFeedbackText(''); setRegenResult(null) }
  }, [selected?.id])

  const act = async (action: 'approve' | 'reject') => {
    if (!selected) return
    const workspaceId = localStorage.getItem('workspaceId')
    setActing(true)
    await fetch('/api/approvals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId: selected.id, action, notes, workspaceId }),
    })
    setActing(false); setSelected(null); setNotes('')
    load()
  }

  const regenerate = async (item: ApprovalItem, feedback?: string) => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    setRegenerating(item.id); setRegenResult(null)
    try {
      const res = await fetch('/api/agents/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, artifactType: item.artifact_type, approvalId: item.id, feedbackText: feedback }),
      })
      const data = await res.json()
      if (data.asset) setRegenResult({ artifactId: data.artifactId, asset: data.asset as Record<string, unknown> })
      load()
    } finally { setRegenerating(null) }
  }

  const publish = async (item: ApprovalItem, platform: string) => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    setPublishing(item.id + platform)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, artifactId: item.artifact_id, platform }),
      })
      const data = await res.json()
      if (data.error) { alert(`Publish failed: ${data.error}`); return }
      setPublishResult(r => ({ ...r, [item.id + platform]: { url: data.postUrl, platform } }))
    } finally { setPublishing(null) }
  }

  const filtered = items.filter(i => filter === 'all' ? true : i.status === filter)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">✅ Approval Inbox</h1>
        <p className="text-gray-400 text-sm mt-1">Preview, review, and control every AI output before it goes out.</p>
      </div>

      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            {f} {f !== 'all' && <span className="ml-1 text-xs opacity-70">({items.filter(i => i.status === f).length})</span>}
          </button>
        ))}
      </div>

      {loading && <div className="text-gray-400 text-sm">Loading approvals...</div>}

      {!loading && filtered.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">📥</div>
          <p className="text-white font-medium mb-2">No {filter === 'all' ? '' : filter} items</p>
          <p className="text-gray-500 text-sm">Generate content first, then come back to review and approve.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {filtered.map(item => (
          <div key={item.id} className={`bg-gray-900 border rounded-xl p-5 cursor-pointer transition-all ${selected?.id === item.id ? 'border-indigo-600' : 'border-gray-800 hover:border-gray-700'}`}
            onClick={() => setSelected(selected?.id === item.id ? null : item)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm">{TYPE_LABELS[item.artifact_type] || item.artifact_type}</span>
                <h3 className="text-white font-medium text-sm">{item.artifact_title}</h3>
              </div>
              <StatusBadge status={item.status} />
            </div>

            {selected?.id === item.id && (
              <div className="mt-5 pt-5 border-t border-gray-800">
                {/* Visual or text preview */}
                <VisualPreview item={item} buildUrl={buildCreativeUrl} />

                {item.status === 'pending' && (
                  <div className="mt-5 space-y-3">
                    <textarea
                      className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-indigo-500"
                      placeholder="Notes (required for rejection, optional for approval)..."
                      value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    />
                    <div className="flex gap-3">
                      <button onClick={e => { e.stopPropagation(); act('approve') }} disabled={acting}
                        className="flex-1 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                        {acting ? 'Saving...' : '✓ Approve'}
                      </button>
                      <button onClick={e => { e.stopPropagation(); act('reject') }} disabled={acting || !notes}
                        className="flex-1 py-2.5 rounded-lg bg-red-900 hover:bg-red-800 text-white text-sm font-medium transition-colors disabled:opacity-50">
                        ✕ Reject
                      </button>
                    </div>
                  </div>
                )}

                {/* Feedback & Re-generate section */}
                {REGENERATABLE.includes(item.artifact_type) && (
                  <div className="mt-4 p-4 rounded-lg bg-gray-800 border border-gray-700">
                    <p className="text-gray-400 text-xs font-semibold mb-2">Request Changes</p>
                    <textarea
                      className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-indigo-500"
                      placeholder="Describe exactly what to change: 'Make it more casual', 'Shorten to 3 slides', 'Change headline to focus on price'..."
                      value={feedbackText} onChange={e => setFeedbackText(e.target.value)} rows={2}
                      onClick={e => e.stopPropagation()}
                    />
                    <button
                      onClick={e => { e.stopPropagation(); regenerate(item, feedbackText) }}
                      disabled={regenerating === item.id}
                      className="w-full mt-2 py-2 rounded-lg border border-indigo-700 text-indigo-400 hover:bg-indigo-950 text-sm font-medium transition-colors disabled:opacity-50">
                      {regenerating === item.id ? '⏳ Regenerating...' : '↻ Regenerate with This Feedback'}
                    </button>
                    <p className="text-xs text-gray-600 mt-1 text-center">New version will appear below immediately after generation</p>
                  </div>
                )}

                {/* Inline regeneration result */}
                {regenResult && (
                  <div className="mt-4 p-4 rounded-lg bg-indigo-950 border border-indigo-800">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-indigo-400 text-sm font-semibold">✨ New Version Generated</span>
                    </div>
                    <pre className="text-gray-300 text-xs whitespace-pre-wrap overflow-auto max-h-40">
                      {JSON.stringify(regenResult.asset, null, 2)}
                    </pre>
                    <p className="text-xs text-gray-500 mt-2">Find it in the Pending tab to approve or request more changes</p>
                  </div>
                )}

                {item.notes && (
                  <div className="mt-4 p-3 rounded-lg bg-gray-800 text-sm text-gray-300">
                    <span className="text-gray-500 text-xs">Notes: </span>{item.notes}
                  </div>
                )}

                {item.status === 'approved' && PUBLISHABLE[item.artifact_type] && (
                  <div className="mt-4 p-4 rounded-lg bg-gray-900 border border-gray-700">
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Publish to Platform</p>
                    <div className="flex flex-wrap gap-2">
                      {PUBLISHABLE[item.artifact_type].map(platform => {
                        const key = item.id + platform
                        const result = publishResult[key]
                        return result ? (
                          <a key={platform} href={result.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-900/30 border border-green-700 text-green-400 text-sm font-medium">
                            ✅ View on {platform}
                          </a>
                        ) : (
                          <button key={platform}
                            onClick={e => { e.stopPropagation(); publish(item, platform) }}
                            disabled={publishing === key}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-900/30 border border-indigo-700 text-indigo-300 hover:bg-indigo-900/60 text-sm font-medium transition-colors disabled:opacity-50 capitalize">
                            {publishing === key ? '⏳ Publishing...' : `▶ Publish to ${platform}`}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-gray-600 text-xs mt-2">Connect accounts in <a href="/dashboard/integrations" className="text-indigo-400 hover:text-indigo-300">Integrations</a> first</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-900 text-yellow-300 border-yellow-800',
    approved: 'bg-green-900 text-green-300 border-green-800',
    rejected: 'bg-red-900 text-red-300 border-red-800',
  }
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${colors[status] || 'bg-gray-800 text-gray-400'}`}>
      {status}
    </span>
  )
}

function VisualPreview({ item, buildUrl }: { item: ApprovalItem; buildUrl: (c: Record<string, unknown>, t: string) => string }) {
  const c = item.content_json
  if (!c) return null

  const VISUAL_TYPES = ['visual_post', 'visual_story', 'visual_ad', 'youtube_thumbnail', 'visual_carousel']

  if (VISUAL_TYPES.includes(item.artifact_type)) {
    const imgUrl = buildUrl(c, item.artifact_type)
    const slides = item.artifact_type === 'visual_carousel'
      ? (c.slides as Array<{ type: string; title?: string; coverText?: string; headline?: string; body?: string; slideNum?: number }> | undefined)
      : null

    return (
      <div className="space-y-3">
        {imgUrl && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            <div className="flex-shrink-0">
              <p className="text-gray-500 text-xs mb-1">{item.artifact_type === 'visual_carousel' ? 'Cover' : 'Preview'}</p>
              <img src={imgUrl} alt="Creative preview" className="rounded-lg border border-gray-700 max-h-48 w-auto" />
            </div>
            {slides && slides.filter(s => s.type === 'slide').slice(0, 3).map((slide, i) => {
              const slideParams = new URLSearchParams({
                type: 'slide', tone: (c.tone as string) || 'professional',
                business: ((c.businessName as string) || '').slice(0, 40),
                headline: (slide.headline || '').slice(0, 80),
                body: (slide.body || '').slice(0, 220),
                slideNum: String(i + 2),
                total: String(slides.length + 1),
              })
              return (
                <div key={i} className="flex-shrink-0">
                  <p className="text-gray-500 text-xs mb-1">Slide {i + 2}</p>
                  <img src={`/api/creative/carousel/slide?${slideParams}`} alt={`Slide ${i + 2}`}
                    className="rounded-lg border border-gray-700 max-h-48 w-auto" />
                </div>
              )
            })}
          </div>
        )}
        <TextPreview item={item} />
      </div>
    )
  }

  return <div className="bg-gray-800 rounded-lg p-4"><TextPreview item={item} /></div>
}

function TextPreview({ item }: { item: ApprovalItem }) {
  const c = item.content_json
  if (!c) return null

  switch (item.artifact_type) {
    case 'visual_post':
      return (
        <div className="text-sm space-y-2">
          <p className="text-white font-semibold">{c.hook as string}</p>
          <p className="text-gray-300">{c.body as string}</p>
          <p className="text-indigo-400">{c.cta as string}</p>
          <div className="flex flex-wrap gap-1">{((c.hashtags as string[]) || []).map(h => <span key={h} className="text-gray-500 text-xs">#{h}</span>)}</div>
        </div>
      )
    case 'visual_ad':
      return (
        <div className="text-sm space-y-2">
          <p className="text-white font-bold text-base">{c.headline as string}</p>
          <p className="text-gray-300">{c.subtext as string}</p>
          <p className="text-indigo-400 font-medium">{c.cta as string}</p>
          {!!c.offer && <p className="text-yellow-400 text-xs">🎁 {c.offer as string}</p>}
        </div>
      )
    case 'visual_story':
      return (
        <div className="text-sm space-y-2">
          <p className="text-white font-bold">{c.hook as string}</p>
          <p className="text-gray-300">{c.subtext as string}</p>
          <p className="text-indigo-400">{c.cta as string}</p>
        </div>
      )
    case 'youtube_thumbnail':
      return (
        <div className="text-sm space-y-2">
          <p className="text-white font-bold text-lg">{c.headline as string}</p>
          <p className="text-gray-300">{c.subtext as string}</p>
          {!!c.accentNumber && <p className="text-yellow-400 font-bold text-2xl">{c.accentNumber as string} {c.accentWord as string}</p>}
        </div>
      )
    case 'linkedInPost':
      return (
        <div className="space-y-3 text-sm">
          <p className="text-white font-semibold">{c.hook as string}</p>
          <pre className="text-gray-300 whitespace-pre-wrap">{c.body as string}</pre>
          <p className="text-indigo-400">{c.cta as string}</p>
        </div>
      )
    case 'emailDraft':
      return (
        <div className="space-y-2 text-sm">
          <p><span className="text-gray-500">Subject: </span><span className="text-white font-medium">{c.subject as string}</span></p>
          {c.previewText ? <p className="text-gray-500 text-xs">{c.previewText as string}</p> : null}
          <pre className="text-gray-300 whitespace-pre-wrap">{c.body as string}</pre>
          <p><span className="text-gray-500">CTA: </span><span className="text-indigo-400">{c.cta as string}</span></p>
        </div>
      )
    case 'adCopy':
      return (
        <div className="space-y-2 text-sm">
          <p className="text-white font-bold text-base">{c.headline as string}</p>
          <p className="text-gray-300">{c.primaryText as string}</p>
          <p><span className="text-gray-500">CTA: </span><span className="text-indigo-400">{c.cta as string}</span></p>
        </div>
      )
    case 'carousel': {
      const slides = c.slides as Array<{ headline: string; body: string }> | undefined
      return (
        <div className="space-y-3 text-sm">
          <p className="text-white font-bold">{c.coverText as string}</p>
          <div className="grid grid-cols-2 gap-2">
            {slides?.slice(0, 4).map((slide, i) => (
              <div key={i} className="p-3 rounded-lg bg-gray-700">
                <p className="text-xs text-gray-400 mb-1">Slide {i + 1}</p>
                <p className="text-white text-xs font-medium">{slide.headline}</p>
                <p className="text-gray-400 text-xs mt-1">{slide.body}</p>
              </div>
            ))}
          </div>
          <p><span className="text-gray-500">CTA: </span><span className="text-indigo-400">{c.cta as string}</span></p>
        </div>
      )
    }
    case 'reelScript': {
      const scenes = c.scenes as Array<{ timecode: string; voiceover: string }> | undefined
      return (
        <div className="space-y-3 text-sm">
          <p className="text-white font-bold">{c.hook as string}</p>
          <div className="space-y-2">
            {scenes?.slice(0, 4).map((scene, i) => (
              <div key={i} className="flex gap-3 p-2 rounded bg-gray-700">
                <span className="text-indigo-400 font-mono text-xs whitespace-nowrap">{scene.timecode}</span>
                <p className="text-gray-300 text-xs">{scene.voiceover}</p>
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'video_edit_plan': {
      const scenes = c.scenes as Array<{ sceneNumber: number; startTime: string; endTime: string; description: string }> | undefined
      return (
        <div className="space-y-2 text-sm">
          <p className="text-gray-400 text-xs">{c.totalDuration as string} · {c.aspectRatio as string}</p>
          {scenes?.slice(0, 4).map((scene, i) => (
            <div key={i} className="flex gap-3 p-2 rounded bg-gray-700">
              <span className="text-indigo-400 font-mono text-xs whitespace-nowrap">{scene.startTime}–{scene.endTime}</span>
              <p className="text-gray-300 text-xs">{scene.description}</p>
            </div>
          ))}
        </div>
      )
    }
    case 'strategy':
      return (
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-gray-500 text-xs mb-1">Positioning</p>
            <p className="text-gray-200">{c.positioning as string}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs mb-1">Unique Value Proposition</p>
            <p className="text-white font-medium">{c.uniqueValueProposition as string}</p>
          </div>
        </div>
      )
    default:
      return <pre className="text-gray-400 text-xs whitespace-pre-wrap overflow-auto max-h-48">{JSON.stringify(c, null, 2)}</pre>
  }
}
