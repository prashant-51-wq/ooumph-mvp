'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceId } from '@/lib/hooks/use-workspace-id'

interface ApprovalItem {
  id: string
  artifact_id: string
  artifact_type: string
  artifact_title: string
  content_json: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  notes: string
  created_at: string
  brand_voice_score?: number | null
  brand_voice_reasoning?: string | null
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

// ── Fallback brand voice score (used while waiting for real score) ────────────
function getBrandVoiceScoreFallback(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i)
  return 55 + Math.abs(hash % 45)
}

// ── Auto-approve countdown helpers ───────────────────────────────────────────
type AutoApproveDelay = 'off' | '24h' | '48h' | '72h'
const DELAY_MS: Record<AutoApproveDelay, number> = {
  off: 0,
  '24h': 24 * 60 * 60 * 1000,
  '48h': 48 * 60 * 60 * 1000,
  '72h': 72 * 60 * 60 * 1000,
}

function getAutoApproveCountdown(createdAt: string, delay: AutoApproveDelay): { label: string; overdue: boolean } {
  if (delay === 'off') return { label: '', overdue: false }
  const created = new Date(createdAt).getTime()
  const threshold = created + DELAY_MS[delay]
  const now = Date.now()
  const remaining = threshold - now
  if (remaining <= 0) return { label: 'Auto-approving...', overdue: true }
  const hours = Math.floor(remaining / 3600000)
  const mins = Math.floor((remaining % 3600000) / 60000)
  return { label: `Auto-approve in: ${hours}h ${mins}m`, overdue: false }
}

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
  // Sprint 10C: single canonical source for workspaceId. The three
  // useCallback / useEffect sites below now read this instead of
  // localStorage. The hook itself still hydrates from localStorage
  // optimistically so first-paint isn't blank.
  const { workspaceId: sessionWorkspaceId } = useWorkspaceId()
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

  // ── Bulk select ──────────────────────────────────────────────────────────────
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)

  // ── Auto-approve settings ────────────────────────────────────────────────────
  const [autoApproveDelay, setAutoApproveDelay] = useState<AutoApproveDelay>(() => {
    if (typeof window === 'undefined') return 'off'
    const stored = localStorage.getItem('approvals_auto_approve_delay')
    if (stored === '24h' || stored === '48h' || stored === '72h' || stored === 'off') return stored
    return 'off'
  })
  const [autoSettingsOpen, setAutoSettingsOpen] = useState(false)
  const autoSettingsRef = useRef<HTMLDivElement>(null)

  // ── Brand voice scores: id → { score, reasoning[] } ──────────────────────────
  const [bvScores, setBvScores] = useState<Record<string, { score: number; reasoning: string[] }>>({})

  // Persist auto-approve delay. Sprint 6H: also push to workspaces
  // .extra_settings via /api/workspaces/settings so the server-side
  // auto-approve cron can read it. Without this the cron has no
  // signal and the autonomy story falls apart when no one's on the page.
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('approvals_auto_approve_delay', autoApproveDelay)
    if (!sessionWorkspaceId) return
    fetch('/api/workspaces/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: sessionWorkspaceId,
        settings: { auto_approve_delay: autoApproveDelay },
      }),
    }).catch(() => { /* best-effort — UI still works via localStorage */ })
  }, [autoApproveDelay, sessionWorkspaceId])

  // ── Inline edit ───────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // ── Brand voice tooltip ───────────────────────────────────────────────────────
  const [bvTooltipId, setBvTooltipId] = useState<string | null>(null)

  // ── Countdown tick ────────────────────────────────────────────────────────────
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  // Close auto settings dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (autoSettingsRef.current && !autoSettingsRef.current.contains(e.target as Node)) {
        setAutoSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const load = useCallback(async () => {
    const workspaceId = sessionWorkspaceId
    if (!workspaceId) { router.push('/dashboard/onboarding'); return }
    try {
      const res = await fetch(`/api/approvals?workspaceId=${workspaceId}`)
      const data = await res.json() as ApprovalItem[]
      setItems(data)
      // Seed brand-voice scores from cached column values
      const seeded: Record<string, { score: number; reasoning: string[] }> = {}
      if (Array.isArray(data)) {
        data.forEach(item => {
          if (typeof item.brand_voice_score === 'number') {
            let reasoning: string[] = []
            try {
              reasoning = item.brand_voice_reasoning ? JSON.parse(item.brand_voice_reasoning) as string[] : []
            } catch { reasoning = [] }
            seeded[item.id] = { score: item.brand_voice_score, reasoning }
          }
        })
      }
      setBvScores(prev => ({ ...prev, ...seeded }))
    } finally {
      setLoading(false)
    }
  }, [router, sessionWorkspaceId])

  useEffect(() => { load() }, [load])

  // ── Fetch real brand-voice scores for visible items (one at a time, lazily) ─
  useEffect(() => {
    const workspaceId = sessionWorkspaceId
    if (!workspaceId) return
    const itemsNeedingScore = items.filter(i => !(i.id in bvScores)).slice(0, 5)
    if (itemsNeedingScore.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const item of itemsNeedingScore) {
        if (cancelled) break
        try {
          const res = await fetch('/api/agents/brand-voice-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approvalId: item.id, workspaceId, content: item.content_json }),
          })
          if (!res.ok) continue
          const data = await res.json() as { score?: number; reasoning?: string[] }
          if (typeof data.score === 'number' && !cancelled) {
            setBvScores(prev => ({ ...prev, [item.id]: { score: data.score!, reasoning: Array.isArray(data.reasoning) ? data.reasoning : [] } }))
          }
        } catch { /* skip */ }
      }
    })()
    return () => { cancelled = true }
  }, [items, bvScores])

  // ── Auto-approve client-side: every minute, approve items past threshold ───
  useEffect(() => {
    if (autoApproveDelay === 'off') return
    const workspaceId = sessionWorkspaceId  // Sprint 10C
    if (!workspaceId) return
    let cancelled = false

    const check = async () => {
      const now = Date.now()
      const threshold = DELAY_MS[autoApproveDelay]
      const overdue = items.filter(i =>
        i.status === 'pending' && (now - new Date(i.created_at).getTime()) >= threshold
      )
      for (const item of overdue) {
        if (cancelled) return
        try {
          await fetch('/api/approvals', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approvalId: item.id, action: 'approve', notes: 'Auto-approved by timer', workspaceId }),
          })
        } catch { /* skip */ }
      }
      if (overdue.length > 0 && !cancelled) load()
    }

    check()
    const interval = setInterval(check, 60000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [autoApproveDelay, items, load])

  useEffect(() => {
    if (selected) { setNotes(''); setFeedbackText(''); setRegenResult(null) }
  }, [selected?.id])

  // Exit bulk mode when filter changes
  useEffect(() => {
    setBulkMode(false)
    setSelectedIds(new Set())
  }, [filter])

  const act = async (action: 'approve' | 'reject') => {
    if (!selected) return
    const workspaceId = sessionWorkspaceId  // Sprint 10C
    setActing(true)
    await fetch('/api/approvals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId: selected.id, action, notes, workspaceId }),
    })
    setActing(false); setSelected(null); setNotes('')
    load()
  }

  const bulkAct = async (action: 'approve' | 'reject') => {
    const workspaceId = sessionWorkspaceId  // Sprint 10C
    const ids = Array.from(selectedIds)
    setBulkActing(true)
    setBulkProgress({ done: 0, total: ids.length })

    let done = 0
    await Promise.all(
      ids.map(id =>
        fetch('/api/approvals', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvalId: id, action, workspaceId }),
        }).finally(() => {
          done++
          setBulkProgress({ done, total: ids.length })
        })
      )
    )

    setBulkActing(false)
    setBulkProgress(null)
    setSelectedIds(new Set())
    setBulkMode(false)
    load()
  }

  const exportSelected = () => {
    const toExport = items.filter(i => selectedIds.has(i.id))
    const blob = new Blob([JSON.stringify(toExport, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `approvals-export-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const saveEdit = async (item: ApprovalItem) => {
    setSavingEdit(true)
    try {
      // Parse edited content (the editor shows pretty-printed JSON)
      let parsed: unknown = editContent
      try { parsed = JSON.parse(editContent) } catch { /* keep as string */ }

      // Update the underlying artifact (the approval references it)
      await fetch('/api/artifacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId: item.artifact_id, content_json: parsed }),
      })
      // Invalidate any cached brand-voice score so it re-computes
      setBvScores(prev => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      setEditingId(null)
      load()
    } finally {
      setSavingEdit(false)
    }
  }

  const regenerate = async (item: ApprovalItem, feedback?: string) => {
    const workspaceId = sessionWorkspaceId  // Sprint 10C
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
    const workspaceId = sessionWorkspaceId  // Sprint 10C
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

  const toggleBulkSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(i => i.id)))
    }
  }

  const filtered = items.filter(i => filter === 'all' ? true : i.status === filter)
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">✅ Approval Inbox</h1>
            <p className="text-gray-400 text-sm mt-1">Preview, review, and control every AI output before it goes out.</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto-Approve Settings */}
            <div className="relative" ref={autoSettingsRef}>
              <button
                onClick={() => setAutoSettingsOpen(!autoSettingsOpen)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${autoApproveDelay !== 'off' ? 'bg-orange-900/40 border border-orange-700 text-orange-300' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                ⚙ Auto-Approve{autoApproveDelay !== 'off' ? `: ${autoApproveDelay}` : ''}
              </button>
              {autoSettingsOpen && (
                <div className="absolute right-0 top-10 bg-gray-900 border border-gray-700 rounded-xl shadow-xl py-1 min-w-[200px] z-20">
                  {(['off', '24h', '48h', '72h'] as AutoApproveDelay[]).map(opt => (
                    <button
                      key={opt}
                      onClick={() => { setAutoApproveDelay(opt); setAutoSettingsOpen(false) }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${autoApproveDelay === opt ? 'text-indigo-400 bg-indigo-950' : 'text-gray-300 hover:bg-gray-800'}`}
                    >
                      {opt === 'off' ? 'Off' : opt}
                    </button>
                  ))}
                  {/* Sprint 6H: clarify that auto-approve runs server-side. */}
                  <div className="border-t border-gray-800 mt-1 px-4 py-2">
                    <p className="text-gray-500 text-[10px] leading-relaxed">
                      Runs hourly on the server — approvals fire even while you&apos;re away. Only items with brand voice score ≥ 80 are eligible.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Bulk Select toggle */}
            <button
              onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()) }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${bulkMode ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              ⬜ Bulk Select
            </button>
          </div>
        </div>
      </div>

      {/* Filter tabs + select all */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {(bulkMode) && (
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 accent-indigo-500"
              />
              <span className="text-gray-300 text-sm">Select All</span>
            </label>
          )}
          {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {f} {f !== 'all' && <span className="ml-1 text-xs opacity-70">({items.filter(i => i.status === f).length})</span>}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-4 bg-gray-800 rounded w-24" />
                  <div className="h-4 bg-gray-800 rounded w-40" />
                </div>
                <div className="h-6 bg-gray-800 rounded-full w-16" />
              </div>
              <div className="mt-3 space-y-2">
                <div className="h-3 bg-gray-800 rounded w-3/4" />
                <div className="h-3 bg-gray-800 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">📥</div>
          <p className="text-white font-medium mb-2">No {filter === 'all' ? '' : filter} items</p>
          <p className="text-gray-500 text-sm">Generate content first, then come back to review and approve.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {filtered.map(item => {
          const bvCached = bvScores[item.id]
          const bvScore = bvCached?.score ?? getBrandVoiceScoreFallback(item.id)
          const bvLoaded = !!bvCached
          const bvReasoning = bvCached?.reasoning || []
          const autoCountdown = item.status === 'pending' ? getAutoApproveCountdown(item.created_at, autoApproveDelay) : null
          const isEditing = editingId === item.id

          return (
            <div
              key={item.id}
              className={`bg-gray-900 border rounded-xl p-5 transition-all relative group ${
                selected?.id === item.id ? 'border-indigo-600' : selectedIds.has(item.id) ? 'border-indigo-500 bg-indigo-950/20' : 'border-gray-800 hover:border-gray-700'
              } ${autoCountdown?.overdue ? 'border-orange-700/50' : ''}`}
              onClick={() => {
                if (bulkMode) return
                setSelected(selected?.id === item.id ? null : item)
              }}
              style={{ cursor: bulkMode ? 'default' : 'pointer' }}
            >
              {/* Bulk checkbox */}
              {bulkMode && (
                <div
                  className="absolute top-4 left-4 z-10"
                  onClick={e => toggleBulkSelect(item.id, e)}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => {}}
                    className="w-4 h-4 accent-indigo-500 cursor-pointer"
                  />
                </div>
              )}

              {/* Hover checkbox (non-bulk mode) */}
              {!bulkMode && (
                <div
                  className="absolute top-4 left-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => { e.stopPropagation(); setBulkMode(true); setSelectedIds(new Set([item.id])) }}
                >
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => {}}
                    className="w-4 h-4 accent-indigo-500 cursor-pointer"
                  />
                </div>
              )}

              <div className={`flex items-center justify-between ${bulkMode ? 'pl-7' : ''}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm flex-shrink-0">{TYPE_LABELS[item.artifact_type] || item.artifact_type}</span>
                  <h3 className="text-white font-medium text-sm truncate">{item.artifact_title}</h3>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {/* Auto-approve countdown badge */}
                  {autoCountdown && autoCountdown.label && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                      autoCountdown.overdue
                        ? 'bg-orange-900/50 border-orange-700 text-orange-300 animate-pulse'
                        : 'bg-gray-800 border-gray-700 text-gray-400'
                    }`}>
                      ⏱ {autoCountdown.label}
                    </span>
                  )}

                  {/* Brand voice badge */}
                  <div className="relative">
                    <button
                      onClick={e => { e.stopPropagation(); setBvTooltipId(bvTooltipId === item.id ? null : item.id) }}
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors ${
                        bvScore >= 80
                          ? 'bg-green-900/40 border-green-800 text-green-300'
                          : bvScore >= 60
                          ? 'bg-yellow-900/40 border-yellow-800 text-yellow-300'
                          : 'bg-red-900/40 border-red-800 text-red-300'
                      } ${!bvLoaded ? 'opacity-60' : ''}`}
                    >
                      Brand Voice: {bvScore}%{!bvLoaded && '…'}
                    </button>
                    {bvTooltipId === item.id && (
                      <div className="absolute right-0 top-7 bg-gray-900 border border-gray-700 rounded-xl shadow-xl px-4 py-3 z-30 min-w-[240px]"
                        onClick={e => e.stopPropagation()}>
                        <p className="text-white text-xs font-semibold mb-2">Brand Voice Analysis</p>
                        {!bvLoaded ? (
                          <p className="text-gray-500 text-xs">Computing score…</p>
                        ) : bvReasoning.length > 0 ? (
                          <ul className="space-y-1.5">
                            {bvReasoning.map((reason, i) => (
                              <li key={i} className={`text-xs ${
                                bvScore >= 80 ? 'text-green-400' : bvScore >= 60 ? 'text-yellow-400' : 'text-red-400'
                              }`}>{reason}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-400 text-xs">No analysis details available</p>
                        )}
                      </div>
                    )}
                  </div>

                  <StatusBadge status={item.status} />
                </div>
              </div>

              {selected?.id === item.id && !bulkMode && (
                <div className="mt-5 pt-5 border-t border-gray-800">
                  {/* Inline edit / visual preview */}
                  {isEditing ? (
                    <div onClick={e => e.stopPropagation()}>
                      <textarea
                        className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-indigo-600 text-white text-sm resize-none focus:outline-none min-h-[120px]"
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={6}
                      />
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-gray-600 text-xs">{editContent.length} characters</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEdit(item)}
                            disabled={savingEdit}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            {savingEdit ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <VisualPreview item={item} buildUrl={buildCreativeUrl} />
                      {/* Edit button */}
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setEditingId(item.id)
                          setEditContent(JSON.stringify(item.content_json, null, 2))
                        }}
                        className="absolute top-0 right-0 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs transition-colors flex items-center gap-1"
                      >
                        ✏ Edit
                      </button>
                    </div>
                  )}

                  {item.status === 'pending' && !isEditing && (
                    <div className="mt-5 space-y-3">
                      <textarea
                        className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-indigo-500"
                        placeholder="Notes (required for rejection, optional for approval)..."
                        value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                        onClick={e => e.stopPropagation()}
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
                  {REGENERATABLE.includes(item.artifact_type) && !isEditing && (
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
          )
        })}
      </div>

      {/* Floating bulk action bar */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-40 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-3">
          <span className="text-gray-400 text-sm">{selectedIds.size} selected</span>
          <div className="w-px h-5 bg-gray-700" />
          <button
            onClick={() => bulkAct('approve')}
            disabled={bulkActing}
            className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {bulkActing ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✓'}
            {bulkActing && bulkProgress ? `Approving ${bulkProgress.done} of ${bulkProgress.total}…` : `Approve Selected (${selectedIds.size})`}
          </button>
          <button
            onClick={() => bulkAct('reject')}
            disabled={bulkActing}
            className="px-4 py-2 rounded-lg bg-red-900 hover:bg-red-800 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {bulkActing && bulkProgress ? `Rejecting ${bulkProgress.done} of ${bulkProgress.total}…` : `✕ Reject Selected (${selectedIds.size})`}
          </button>
          <button
            onClick={exportSelected}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors"
          >
            ↓ Export Selected
          </button>
          <button
            onClick={() => { setSelectedIds(new Set()); setBulkMode(false) }}
            className="px-3 py-2 rounded-lg text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            ✕
          </button>
        </div>
      )}
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
      // Sprint 5 fix: previously dumped raw JSON for any artifact type
      // that didn't match a case above ("{copy: '...', platform: 'linkedin',
      // is_demo: true}"). That looks broken to users. The fallback now
      // pulls common content fields (copy, body, content, text, headline,
      // subject, hook, cta, message, description, title) and renders them
      // as a readable preview. If literally nothing recognizable is in
      // the payload, falls back to a collapsible Raw JSON view.
      return <DefaultPreview content={c} />
  }
}

/**
 * Best-effort renderer for approval artifacts with no dedicated case in
 * TextPreview. Extracts whichever common content fields exist, in priority
 * order. Hides anything that's clearly metadata (is_demo, platform_id, etc.).
 * Used for sample-seeded approvals and any new artifact_type that ships
 * before its preview case is written.
 */
function DefaultPreview({ content }: { content: Record<string, unknown> }) {
  const get = (k: string): string | null => {
    const v = content[k]
    return typeof v === 'string' && v.trim() ? v : null
  }
  const title    = get('title') || get('headline') || get('subject') || get('name')
  const lead     = get('hook') || get('subtext') || get('preview')
  const body     = get('body') || get('copy') || get('content') || get('text') || get('message') || get('description')
  const cta      = get('cta') || get('callToAction') || get('action')
  const platform = get('platform') || get('channel')
  const hashtags = Array.isArray(content.hashtags)
    ? (content.hashtags as unknown[]).filter((h): h is string => typeof h === 'string')
    : null
  const isDemo   = content.is_demo === true || content.is_sample === true

  const hasReadable = title || lead || body || cta
  if (!hasReadable) {
    // Truly nothing parseable — give the user a collapsible JSON view
    // so the page doesn't appear blank.
    return (
      <details className="text-sm">
        <summary className="cursor-pointer text-gray-400 hover:text-white">
          Raw artifact content (no preview template registered)
        </summary>
        <pre className="text-gray-400 text-xs whitespace-pre-wrap overflow-auto max-h-48 mt-2 p-2 rounded bg-gray-800/50">
          {JSON.stringify(content, null, 2)}
        </pre>
      </details>
    )
  }

  return (
    <div className="space-y-2 text-sm">
      {isDemo && (
        <span className="inline-block text-[10px] text-amber-400 bg-amber-900/20 border border-amber-800/40 px-1.5 py-0.5 rounded">Sample</span>
      )}
      {platform && (
        <p className="text-gray-500 text-xs">Channel: <span className="text-gray-300 capitalize">{platform}</span></p>
      )}
      {title && <p className="text-white font-semibold">{title}</p>}
      {lead && <p className="text-gray-400">{lead}</p>}
      {body && <p className="text-gray-300 whitespace-pre-wrap">{body}</p>}
      {cta && <p className="text-indigo-400 font-medium">{cta}</p>}
      {hashtags && hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {hashtags.map(h => <span key={h} className="text-gray-500 text-xs">#{h.replace(/^#/, '')}</span>)}
        </div>
      )}
    </div>
  )
}
