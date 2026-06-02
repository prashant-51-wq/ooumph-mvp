'use client'

import { useState, useEffect, useRef } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type MainTab = 'generate' | 'customize' | 'export'
type SidebarTab = 'myvideos' | 'templates' | 'stock'
type VideoStatus = 'Ready' | 'Generating' | 'Draft' | 'Failed'

interface VideoProject {
  id: string
  name: string
  duration: string
  status: VideoStatus
  videoUrl?: string
  thumbnail?: string
  model: string
  createdAt: string
}

// ─── Static config ────────────────────────────────────────────────────────────

const VIDEO_MODELS = [
  { id: 'runway', name: 'Runway Gen-3', speed: 'Fast', quality: 'HD', color: 'from-emerald-500 to-teal-600', avgSec: 30 },
  { id: 'kling', name: 'Kling 2.0',     speed: 'Slow', quality: '4K', color: 'from-indigo-500 to-blue-600',  avgSec: 60 },
  { id: 'sora',  name: 'Sora',          speed: 'Slow', quality: '4K', color: 'from-orange-500 to-red-600',   avgSec: 90 },
  { id: 'pika',  name: 'Pika 2.0',      speed: 'Fast', quality: 'HD', color: 'from-pink-500 to-rose-600',    avgSec: 40 },
  { id: 'luma',  name: 'Luma Dream',    speed: 'Slow', quality: 'HD', color: 'from-purple-500 to-violet-600',avgSec: 60 },
]

const STYLE_PRESETS = ['Cinematic', 'Corporate', 'Social Media', 'Documentary', 'Animation', 'Product Demo', 'Vlog', 'Music Video']

const DURATION_OPTS = [5, 10] as const  // Runway supports 5 and 10
const RATIO_OPTS = ['16:9', '9:16', '1:1', '4:5']
const RESOLUTION_OPTS = ['720p', '1080p', '4K']
const FPS_OPTS = ['24', '30', '60']

const COLOR_GRADES = [
  { id: 'natural', name: 'Natural', color: 'bg-green-600' },
  { id: 'cinematic', name: 'Cinematic', color: 'bg-blue-700' },
  { id: 'warm', name: 'Warm', color: 'bg-orange-600' },
  { id: 'cool', name: 'Cool', color: 'bg-cyan-600' },
  { id: 'bw', name: 'B&W', color: 'bg-gray-600' },
  { id: 'vintage', name: 'Vintage', color: 'bg-amber-700' },
]

const EXPORT_FORMATS = ['MP4', 'MOV', 'WebM', 'GIF']
const EXPORT_QUALITIES = ['Web (720p)', 'HD (1080p)', '4K']

const AI_SUGGESTIONS = [
  'Add a product demo scene at 0:08',
  'Insert a text overlay at 0:15',
  'Add ambient music track',
  'Use slow-motion effect at 0:22',
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: VideoStatus }) {
  const map: Record<VideoStatus, string> = {
    Ready: 'bg-emerald-900/50 text-emerald-400 border-emerald-800/50',
    Generating: 'bg-amber-900/50 text-amber-400 border-amber-800/50',
    Draft: 'bg-gray-800 text-gray-400 border-gray-700',
    Failed: 'bg-red-900/50 text-red-400 border-red-800/50',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${map[status]}`}>
      {status === 'Generating' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse mr-1" />}
      {status}
    </span>
  )
}

function Spinner({ size = 4 }: { size?: number }) {
  return (
    <svg className={`animate-spin w-${size} h-${size}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = (Date.now() - t) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function safeParse<T = unknown>(s: string): T | undefined {
  try { return JSON.parse(s) as T } catch { return undefined }
}

// ─── API Settings Slide-over ──────────────────────────────────────────────────

function ApiSettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [provider, setProvider] = useState('Runway')
  const [apiKey, setApiKey] = useState('')
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-gray-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-96 bg-gray-900 border-l border-gray-800 h-full overflow-y-auto p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Video API Settings</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="text-amber-300 text-xs bg-amber-900/20 border border-amber-800/40 rounded-lg p-3">
          API keys are configured in Settings → AI Assistants. Currently only Runway is wired up for actual generation — other models will route through Runway.
        </p>
        <div>
          <label className="text-gray-400 text-xs mb-1.5 block">API Provider</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
          >
            {['Runway', 'Kling', 'Pika', 'Replicate', 'Luma'].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-1.5 block">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-••••••••••••••••"
            className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>
        <button
          className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          onClick={onClose}
        >
          Save Settings
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VideoGenPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('myvideos')
  const [mainTab, setMainTab] = useState<MainTab>('generate')
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [apiPanelOpen, setApiPanelOpen] = useState(false)

  // Sprint 12E: real per-model status from /api/agents/video/models.
  // Replaces the static VIDEO_MODELS constant for picker UX. Each entry
  // includes whether the workspace has the right keys to use it.
  interface ModelStatus {
    id: string
    name: string
    whatFor: string
    status: 'ready' | 'needs_key' | 'beta_access'
    setupHint: string
    byokFields: string[]
    byokAnchor: string
    missingFields: string[]
  }
  const [modelStatus, setModelStatus] = useState<ModelStatus[]>([])

  // Past projects
  const [projects, setProjects] = useState<VideoProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState<string | null>(null)

  // Stats
  const [stats, setStats] = useState({ videos: 0, durationSec: 0, cost: 0 })

  // Generate tab state
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState('runway')
  const [selectedStyle, setSelectedStyle] = useState('Cinematic')
  const [duration, setDuration] = useState<5 | 10>(5)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [resolution, setResolution] = useState('1080p')
  const [fps, setFps] = useState('24')
  const [scriptMode, setScriptMode] = useState(false)
  const [scriptText, setScriptText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState<string>('')
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [latestVideoUrl, setLatestVideoUrl] = useState<string | null>(null)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const elapsedRef = useRef(0)
  const [elapsed, setElapsed] = useState(0)

  // Customize tab state (visual only)
  const [overlayText, setOverlayText] = useState('')
  const [fontSize, setFontSize] = useState('32')
  const [textAnim, setTextAnim] = useState('Fade')
  const [colorGrade, setColorGrade] = useState('natural')
  const [trimStart, setTrimStart] = useState('0.0')
  const [trimEnd, setTrimEnd] = useState('5.0')
  const [playbackSpeed, setPlaybackSpeed] = useState('1x')

  // Export tab state
  const [exportFormat, setExportFormat] = useState('MP4')
  const [exportQuality, setExportQuality] = useState('HD (1080p)')
  const [compression, setCompression] = useState(7)
  const [watermark, setWatermark] = useState(false)
  const [watermarkText, setWatermarkText] = useState('')

  // Right panel
  const [charLock, setCharLock] = useState(false)
  const [applyBrand, setApplyBrand] = useState(true)

  // Sprint 19A: prompt-driven editor + multi-clip assembly state.
  // The editor sits where the old "Editing disabled" timeline used to be.
  // Each instruction the user types is parsed by Claude into a VideoEditSpec
  // (a JSON shape Cloudinary's transformation URL grammar can render) and
  // the result URL replaces the preview. The "additional clips" tray below
  // lets the user merge other generated clips (Runway / Pika / Luma / etc.)
  // into the base video via Cloudinary's fl_splice transform.
  interface EditTurn { instruction: string; resultUrl: string; spec: Record<string, unknown>; ok: boolean; error?: string }
  // Sprint 19B: Cloudinary configured-ness — gates the editor UI behind a
  // 'Get Cloudinary free' CTA when keys are missing. We sniff via a HEAD
  // request to a known-broken URL; if Cloudinary returns 404 (vs network
  // error) the cloudName resolves which means at least the name is right.
  // More robust: just check the workspace's model_settings via /api/auth/me
  // or a dedicated endpoint. For now we check model_settings client-side.
  const [cloudinaryReady, setCloudinaryReady] = useState<boolean | null>(null)
  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    fetch(`/api/workspaces?id=${workspaceId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        const ms = (data?.model_settings || {}) as Record<string, string>
        const ready = Boolean(ms.cloudinaryCloudName && ms.cloudinaryApiKey && ms.cloudinaryApiSecret)
        setCloudinaryReady(ready)
      })
      .catch(() => { if (!cancelled) setCloudinaryReady(false) })
    return () => { cancelled = true }
  }, [workspaceId])

  const [editorInstruction, setEditorInstruction] = useState('')
  const [editorBusy, setEditorBusy] = useState(false)
  const [editorTurns, setEditorTurns] = useState<EditTurn[]>([])
  const [editorSpec, setEditorSpec] = useState<Record<string, unknown> | undefined>(undefined)
  const [extraClipUrls, setExtraClipUrls] = useState<string[]>([])
  const [extraClipInput, setExtraClipInput] = useState('')
  const [assembleBusy, setAssembleBusy] = useState(false)
  const [assembledUrl, setAssembledUrl] = useState<string | null>(null)
  const [assembleError, setAssembleError] = useState<string | null>(null)

  const editorBaseUrl: string | null = assembledUrl || latestVideoUrl
  const editorLatestUrl: string | null =
    editorTurns.length > 0 ? editorTurns[editorTurns.length - 1].resultUrl : editorBaseUrl

  async function runEditorPrompt() {
    if (!workspaceId || !editorBaseUrl || !editorInstruction.trim()) return
    setEditorBusy(true)
    try {
      const res = await fetch('/api/agents/video/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          videoUrl: editorLatestUrl || editorBaseUrl,
          instruction: editorInstruction.trim(),
          currentSpec: editorSpec,
        }),
      })
      const data = await res.json() as { ok: boolean; editedUrl?: string; spec?: Record<string, unknown>; error?: string }
      const turn: EditTurn = {
        instruction: editorInstruction.trim(),
        resultUrl: data.editedUrl || (editorLatestUrl || editorBaseUrl || ''),
        spec: data.spec || {},
        ok: Boolean(data.ok),
        error: data.error,
      }
      setEditorTurns(prev => [...prev, turn])
      if (data.ok && data.spec) setEditorSpec(data.spec)
      setEditorInstruction('')
    } catch (err) {
      setEditorTurns(prev => [...prev, {
        instruction: editorInstruction.trim(),
        resultUrl: editorLatestUrl || editorBaseUrl || '',
        spec: editorSpec || {},
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }])
    } finally {
      setEditorBusy(false)
    }
  }

  async function runAssemble() {
    if (!workspaceId || !latestVideoUrl) return
    if (extraClipUrls.length === 0) return
    setAssembleBusy(true); setAssembleError(null)
    try {
      const res = await fetch('/api/agents/video/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          videoUrls: [latestVideoUrl, ...extraClipUrls],
        }),
      })
      const data = await res.json() as { ok: boolean; mergedUrl?: string; error?: string }
      if (data.ok && data.mergedUrl) {
        setAssembledUrl(data.mergedUrl)
        setEditorTurns([])           // reset edit history when base changes
        setEditorSpec(undefined)
      } else {
        setAssembleError(data.error || 'Assembly failed')
      }
    } catch (err) {
      setAssembleError(err instanceof Error ? err.message : String(err))
    } finally {
      setAssembleBusy(false)
    }
  }

  function addExtraClip() {
    const trimmed = extraClipInput.trim()
    if (!trimmed) return
    if (!/^https?:\/\//.test(trimmed)) { setAssembleError('Clip must be an http(s) URL'); return }
    setExtraClipUrls(prev => [...prev, trimmed])
    setExtraClipInput('')
    setAssembleError(null)
  }

  function removeExtraClip(idx: number) {
    setExtraClipUrls(prev => prev.filter((_, i) => i !== idx))
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWorkspaceId(localStorage.getItem('workspaceId'))
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    if (workspaceId) {
      void fetchProjects()
      void fetchStats()
      void fetchModelStatus()
    }
  }, [workspaceId])

  // Sprint 12E: load real per-model availability so the picker shows
  // "✓ Ready" / "⚠ Needs key" / "🔒 Beta" instead of guessing.
  async function fetchModelStatus() {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/agents/video/models?workspaceId=${encodeURIComponent(workspaceId)}`)
      if (!res.ok) return
      const data = await res.json() as { models: ModelStatus[]; defaultModel: string }
      setModelStatus(data.models)
      // If the user hasn't manually picked a model yet, default to the
      // first 'ready' one so they don't start with a broken selection.
      setSelectedModel(prev => data.models.find(m => m.id === prev) ? prev : data.defaultModel)
    } catch {
      // Non-fatal — fall back to the static VIDEO_MODELS list.
    }
  }

  async function fetchProjects() {
    if (!workspaceId) return
    setProjectsLoading(true)
    setProjectsError(null)
    try {
      const res = await fetch(`/api/artifacts?workspaceId=${workspaceId}&type=video`)
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const data = await res.json() as Array<{
        id: string
        type: string
        title: string
        content_json: { videoUrl?: string; taskId?: string; status?: string; prompt?: string; duration?: number } | string
        status: string
        created_at: string
      }>
      const items: VideoProject[] = data
        .filter(d => d.type === 'video_task' || d.type === 'avatar_video')
        .map((d) => {
          const cj = typeof d.content_json === 'string' ? safeParse<Record<string, unknown>>(d.content_json) : d.content_json
          const videoUrl = (cj as { videoUrl?: string } | undefined)?.videoUrl
          const status: VideoStatus =
            d.status === 'approved' || videoUrl ? 'Ready' :
            d.status === 'failed' ? 'Failed' :
            d.status === 'pending_approval' ? 'Generating' : 'Draft'
          const dur = (cj as { duration?: number } | undefined)?.duration
          return {
            id: d.id,
            name: d.title || 'Untitled video',
            duration: dur ? `0:${String(dur).padStart(2, '0')}` : '—',
            status,
            videoUrl,
            model: 'Runway Gen-3',
            createdAt: relativeTime(d.created_at),
          }
        })
      setProjects(items)
      if (!selectedProject && items.length > 0) setSelectedProject(items[0].id)
    } catch (err) {
      setProjectsError(err instanceof Error ? err.message : 'Failed to load videos')
    } finally {
      setProjectsLoading(false)
    }
  }

  async function fetchStats() {
    if (!workspaceId) return
    try {
      // Best-effort: count completed video artifacts. Cost is approximate.
      const res = await fetch(`/api/artifacts?workspaceId=${workspaceId}&type=video`)
      if (!res.ok) return
      const data = await res.json() as Array<{ content_json: unknown; created_at: string }>
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      let videos = 0
      let durationSec = 0
      for (const d of data) {
        if (new Date(d.created_at) < monthStart) continue
        const cj = typeof d.content_json === 'string' ? safeParse<{ duration?: number; videoUrl?: string }>(d.content_json) : d.content_json as { duration?: number; videoUrl?: string }
        if (cj?.videoUrl) videos++
        if (cj?.duration) durationSec += cj.duration
      }
      const cost = videos * 0.5  // Approximate $0.50 per Runway gen
      setStats({ videos, durationSec, cost })
    } catch {
      // Silent fail — stats are non-critical
    }
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  async function pollTask(taskId: string) {
    stopPolling()
    elapsedRef.current = 0
    setElapsed(0)
    setGenerationStatus('Generation queued...')
    pollRef.current = setInterval(async () => {
      elapsedRef.current += 3
      setElapsed(elapsedRef.current)
      try {
        const res = await fetch('/api/agents/video/runway', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, action: 'status', taskId }),
        })
        const data = await res.json() as {
          ok?: boolean
          task?: { id: string; status: string; progress?: number; videoUrl?: string | null }
          error?: string
        }
        if (!data.ok) {
          setGenerationStatus(`Status check error: ${data.error || 'unknown'}`)
          return
        }
        const status = data.task?.status || 'UNKNOWN'
        const progress = data.task?.progress
        setGenerationStatus(`${status}${progress != null ? ` · ${Math.round(progress * 100)}%` : ''}`)
        if (status === 'SUCCEEDED' && data.task?.videoUrl) {
          stopPolling()
          setLatestVideoUrl(data.task.videoUrl)
          setGenerating(false)
          setGenerationStatus('Ready')
          void fetchProjects()
          void fetchStats()
        }
        if (status === 'FAILED' || status === 'CANCELLED') {
          stopPolling()
          setGenerationError(`Generation ${status.toLowerCase()}`)
          setGenerating(false)
        }
        if (elapsedRef.current > 300) {
          // Safety timeout — 5 minutes
          stopPolling()
          setGenerationError('Timed out waiting for video. Check the gallery later.')
          setGenerating(false)
        }
      } catch (err) {
        setGenerationStatus(`Poll error: ${err instanceof Error ? err.message : 'network'}`)
      }
    }, 3000)
  }

  async function startGeneration() {
    if (!prompt.trim() || !workspaceId) return
    setGenerationError(null)
    setLatestVideoUrl(null)
    setCurrentTaskId(null)
    setGenerating(true)
    const avgSec = VIDEO_MODELS.find(m => m.id === selectedModel)?.avgSec || 30
    setGenerationStatus(`Submitting to ${VIDEO_MODELS.find(m => m.id === selectedModel)?.name}... est ~${avgSec}s`)

    // Sprint 12E: dispatch to the right provider backend based on
    // selectedModel. Each provider has its own /api/agents/video/{id}
    // route built in Sprint 12A and 12E. Body shape differs slightly
    // per provider (ratio formats, model variants) so we build it
    // per-branch rather than one giant fetch.
    try {
      let endpoint = '/api/agents/video/runway'
      let body: Record<string, unknown> = {
        workspaceId,
        action: 'text_to_video',
        prompt,
      }

      if (selectedModel === 'runway') {
        body = { ...body, duration, ratio:
          aspectRatio === '16:9' ? '1280:768' :
          aspectRatio === '9:16' ? '768:1280' :
          aspectRatio === '1:1' ? '960:960' : '1280:768' }
      } else if (selectedModel === 'luma') {
        endpoint = '/api/agents/video/luma'
        body = { ...body, aspectRatio, loop: false }
      } else if (selectedModel === 'kling') {
        endpoint = '/api/agents/video/kling'
        body = { ...body, duration, aspectRatio, model: 'kling-v2' }
      } else if (selectedModel === 'sora') {
        endpoint = '/api/agents/video/sora'
        body = { ...body, model: 'sora-2', aspectRatio:
          aspectRatio === '16:9' ? 'landscape' :
          aspectRatio === '9:16' ? 'portrait' : 'square',
          durationSeconds: duration < 10 ? 5 : 10 }
      } else if (selectedModel === 'pika') {
        endpoint = '/api/agents/video/pika'
        body = { ...body, aspectRatio: aspectRatio as '16:9' | '9:16' | '1:1' }
      } else {
        // Fallback (e.g. HeyGen) — Runway is the safest assume-anything.
        endpoint = '/api/agents/video/runway'
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as {
        ok?: boolean
        taskId?: string
        artifactId?: string
        error?: string
        requiresSetup?: boolean
        requiresProviderAccess?: boolean
        provider?: string
      }
      if (!data.ok || !data.taskId) {
        // Surface the specific error: missing key vs missing provider
        // access vs generic failure. The UI distinguishes them so users
        // know the right remediation.
        const hint =
          data.requiresSetup ? ' — Go to Settings → API Keys to paste the key.'
          : data.requiresProviderAccess ? ' — Your key works but the provider hasn\'t enabled API access. Try a different model.'
          : ''
        setGenerationError((data.error || 'Failed to start video generation') + hint)
        setGenerating(false)
        return
      }
      setCurrentTaskId(data.taskId)
      void pollTask(data.taskId)
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Network error')
      setGenerating(false)
    }
  }

  const currentModel = VIDEO_MODELS.find(m => m.id === selectedModel) || VIDEO_MODELS[0]
  const selectedProjectObj = projects.find(p => p.id === selectedProject)
  const displayVideoUrl = latestVideoUrl || selectedProjectObj?.videoUrl

  function formatDurationMin(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <ApiSettingsPanel open={apiPanelOpen} onClose={() => setApiPanelOpen(false)} />

      {/* ── LEFT SIDEBAR ── */}
      <div className="w-64 border-r border-gray-800 flex flex-col bg-gray-900 shrink-0">
        {/* Sidebar header */}
        <div className="p-4 border-b border-gray-800">
          <button
            onClick={() => { setMainTab('generate'); setLatestVideoUrl(null); setPrompt('') }}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Video
          </button>
        </div>

        {/* Sidebar tabs */}
        <div className="flex border-b border-gray-800 text-xs">
          {(['myvideos', 'templates', 'stock'] as SidebarTab[]).map(t => (
            <button
              key={t}
              onClick={() => setSidebarTab(t)}
              className={`flex-1 py-2.5 font-medium capitalize transition-colors ${sidebarTab === t ? 'text-indigo-400 border-b-2 border-indigo-500 -mb-px' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {t === 'myvideos' ? 'Mine' : t === 'templates' ? 'Templates' : 'Stock'}
            </button>
          ))}
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sidebarTab === 'myvideos' && (
            <>
              {projectsLoading && (
                <div className="flex items-center justify-center py-6 text-gray-500 text-xs gap-2">
                  <Spinner size={3} /> Loading...
                </div>
              )}
              {projectsError && (
                <div className="p-3 rounded-lg bg-red-900/30 border border-red-700/50">
                  <p className="text-red-300 text-xs">{projectsError}</p>
                  <button onClick={() => void fetchProjects()} className="mt-1 text-red-200 hover:text-white text-[10px] underline">Retry</button>
                </div>
              )}
              {!projectsLoading && !projectsError && projects.length === 0 && (
                <p className="text-gray-500 text-xs p-3">No videos yet — generate your first one</p>
              )}
              {projects.map(proj => (
                <button
                  key={proj.id}
                  onClick={() => setSelectedProject(proj.id)}
                  className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-colors ${selectedProject === proj.id ? 'bg-indigo-900/30 border border-indigo-700/40' : 'hover:bg-gray-800 border border-transparent'}`}
                >
                  <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-indigo-700 to-violet-800 shrink-0 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{proj.name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-gray-500 text-[10px]">{proj.duration}</span>
                      <span className="text-gray-700">·</span>
                      <StatusBadge status={proj.status} />
                    </div>
                    <p className="text-gray-600 text-[10px] mt-0.5">{proj.createdAt}</p>
                  </div>
                </button>
              ))}
            </>
          )}

          {sidebarTab === 'templates' && (
            <div className="p-2 space-y-2">
              {['Product Launch', 'Brand Story', 'Tutorial', 'Testimonial', 'Ad Campaign', 'Event Recap'].map(t => (
                <button key={t} onClick={() => setPrompt(`Create a ${t.toLowerCase()} video...`)} className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-left transition-colors border border-gray-700/50">
                  <div className="w-10 h-8 rounded-lg bg-gradient-to-br from-indigo-800 to-violet-800 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                  <span className="text-gray-300 text-xs">{t}</span>
                </button>
              ))}
            </div>
          )}

          {sidebarTab === 'stock' && (
            <div className="p-2 space-y-2">
              <p className="text-gray-600 text-xs px-2">Stock footage library — connect your stock provider in Settings</p>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN CANVAS AREA ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-5 shrink-0 bg-gray-950">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <h1 className="text-white font-bold text-lg">AI Video Studio</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-gradient-to-r ${currentModel.color} text-white`}>
              {currentModel.name}
            </span>
          </div>
          <button
            onClick={() => setApiPanelOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Video API Settings
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-800 px-4 bg-gray-950 shrink-0">
            {(['generate', 'customize', 'export'] as MainTab[]).map(t => (
              <button
                key={t}
                onClick={() => setMainTab(t)}
                className={`px-5 py-3 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${mainTab === t ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* ─── VIDEO PREVIEW ─── */}
            <div className="bg-gray-950 border-b border-gray-800">
              <div className="relative bg-black mx-4 mt-4 rounded-xl overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: '320px' }}>
                {generating && !displayVideoUrl ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Spinner size={8} />
                      <p className="text-gray-400 text-xs mt-3">{generationStatus}</p>
                      <p className="text-gray-600 text-[10px] mt-1">{elapsed}s elapsed</p>
                    </div>
                  </div>
                ) : displayVideoUrl ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    key={displayVideoUrl}
                    src={displayVideoUrl}
                    controls
                    playsInline
                    className="absolute inset-0 w-full h-full"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-2 mx-auto">
                        <svg className="w-8 h-8 text-white/60" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                      <p className="text-gray-500 text-xs">No video yet — describe what you want and click Generate</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sprint 19A: prompt-driven Cloudinary editor + multi-clip
                  assembly. Replaces the "Editing disabled" placeholder.
                  Powered by /api/agents/video/edit (Claude parses the
                  instruction → VideoEditSpec → Cloudinary URL) and
                  /api/agents/video/assemble (fl_splice multi-clip merge). */}
              <div className="mx-4 mb-4 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-xs font-medium">AI Editor</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${cloudinaryReady === false ? 'text-amber-400 bg-amber-900/20' : 'text-emerald-400 bg-emerald-900/20'}`}>
                    {cloudinaryReady === false ? 'Cloudinary not connected' : editorBaseUrl ? 'Ready' : 'Generate or select a video first'}
                  </span>
                </div>

                {/* Sprint 19B: in-product Cloudinary signup CTA when keys aren't set.
                    We can't programmatically create a Cloudinary account on the
                    user's behalf — they don't expose that API — but we can put
                    a one-click "Sign up free" button right where the user needs
                    it and route them back to Settings to paste keys + Test. */}
                {cloudinaryReady === false && (
                  <div className="mb-3 bg-amber-950/30 border border-amber-900/50 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">📼</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium mb-1">Connect Cloudinary to enable the editor</p>
                        <p className="text-gray-400 text-xs leading-relaxed">
                          The prompt-driven editor + multi-clip assembly runs on Cloudinary&apos;s video
                          transformation API. <span className="text-emerald-300 font-medium">Free tier covers
                          25 GB delivery + 25 transformation credits per month</span> — no card required.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <a
                            href="https://cloudinary.com/users/register/free"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5">
                            <span>Sign up free at Cloudinary</span>
                            <span aria-hidden>↗</span>
                          </a>
                          <a
                            href="/dashboard/settings#storage"
                            className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium">
                            Paste keys + Test →
                          </a>
                          <span className="text-gray-500 text-[10px]">
                            After signup → paste keys in Settings → click Test Connection. Editor unlocks automatically.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className={`bg-gray-900 rounded-xl border border-gray-800 overflow-hidden ${cloudinaryReady === false ? 'opacity-50 pointer-events-none' : ''}`}>
                  {/* Assembly tray — merge other clips into the base */}
                  <div className="p-3 border-b border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-400 text-[11px] font-medium">Merge other clips (Runway / Pika / Luma / etc.)</span>
                      {extraClipUrls.length > 0 && (
                        <button
                          onClick={() => void runAssemble()}
                          disabled={assembleBusy || !latestVideoUrl}
                          className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-medium">
                          {assembleBusy ? 'Merging…' : `Merge ${extraClipUrls.length} clip${extraClipUrls.length === 1 ? '' : 's'}`}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={extraClipInput}
                        onChange={e => setExtraClipInput(e.target.value)}
                        placeholder="Paste an MP4 URL (e.g. from a previous Kling generation)"
                        className="flex-1 px-2 py-1.5 rounded bg-gray-950 border border-gray-800 text-white text-[11px] placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        onClick={addExtraClip}
                        disabled={!extraClipInput.trim()}
                        className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-[11px]">
                        Add
                      </button>
                    </div>
                    {extraClipUrls.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {extraClipUrls.map((u, i) => (
                          <li key={i} className="flex items-center justify-between text-[10px] text-gray-400 bg-gray-950 rounded px-2 py-1">
                            <span className="truncate">#{i + 2} · {u.length > 60 ? u.slice(0, 60) + '…' : u}</span>
                            <button onClick={() => removeExtraClip(i)} className="text-gray-500 hover:text-rose-400 ml-2">✕</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {assembleError && (
                      <p className="text-rose-400 text-[10px] mt-1.5">{assembleError}</p>
                    )}
                    {assembledUrl && (
                      <p className="text-emerald-400 text-[10px] mt-1.5">
                        Merged. Editing now applies to the merged video.
                      </p>
                    )}
                  </div>

                  {/* Edit history */}
                  {editorTurns.length > 0 && (
                    <div className="p-3 border-b border-gray-800 max-h-48 overflow-y-auto space-y-1.5">
                      {editorTurns.map((t, i) => (
                        <div key={i} className={`text-[11px] rounded px-2 py-1.5 ${t.ok ? 'bg-gray-950 border border-gray-800' : 'bg-rose-950/30 border border-rose-900/50'}`}>
                          <div className="flex items-start gap-2">
                            <span className={t.ok ? 'text-emerald-400' : 'text-rose-400'}>{t.ok ? '✓' : '✕'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-white truncate">{t.instruction}</p>
                              {t.error && <p className="text-rose-300 mt-0.5">{t.error}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Prompt input */}
                  <div className="p-3 flex gap-2">
                    <input
                      type="text"
                      value={editorInstruction}
                      onChange={e => setEditorInstruction(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void runEditorPrompt() } }}
                      placeholder='e.g. "trim to first 5 seconds, add fade in, overlay logo bottom-right"'
                      disabled={!editorBaseUrl || editorBusy}
                      className="flex-1 px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    />
                    <button
                      onClick={() => void runEditorPrompt()}
                      disabled={!editorBaseUrl || !editorInstruction.trim() || editorBusy}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium">
                      {editorBusy ? 'Editing…' : 'Apply'}
                    </button>
                  </div>

                  {/* Result preview */}
                  {editorLatestUrl && editorLatestUrl !== latestVideoUrl && (
                    <div className="p-3 border-t border-gray-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-gray-500 text-[10px] uppercase tracking-wider">Edited result</span>
                        <a href={editorLatestUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 text-[10px]">Open ↗</a>
                      </div>
                      <video src={editorLatestUrl} controls className="w-full rounded-lg bg-black aspect-video" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ─── GENERATE TAB ─── */}
            {mainTab === 'generate' && (
              <div className="p-4 space-y-5">
                {/* Prompt */}
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Prompt</label>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    rows={3}
                    placeholder="Describe your video... e.g. A cinematic product reveal shot of sleek wireless headphones on a dark studio surface with dramatic lighting and smoke effect"
                    className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                {/* Model Selector */}
                <div>
                  <label className="text-gray-400 text-xs mb-2 block">AI Model</label>
                  {/* Sprint 12E: real per-model status from /api/agents/video/models.
                      Buttons show: name, status badge (✓ Ready / ⚠ Needs key / 🔒 Beta),
                      and tooltip with the exact setup hint. Picker prefers modelStatus
                      when loaded, falls back to VIDEO_MODELS for visual continuity. */}
                  <div className="flex flex-wrap gap-2">
                    {(modelStatus.length > 0 ? modelStatus : VIDEO_MODELS.map(m => ({
                      id: m.id, name: m.name, whatFor: '',
                      status: m.id === 'runway' ? ('ready' as const) : ('needs_key' as const),
                      setupHint: '', byokFields: [], byokAnchor: '#uc-video-gen', missingFields: [],
                    }))).map(model => {
                      const isSelected = selectedModel === model.id
                      const staticInfo = VIDEO_MODELS.find(v => v.id === model.id)
                      const statusBadge =
                        model.status === 'ready' ? { label: '✓ Ready', cls: 'bg-emerald-900/50 text-emerald-400 border-emerald-800/50' }
                        : model.status === 'beta_access' ? { label: '🔒 Beta', cls: 'bg-amber-900/50 text-amber-400 border-amber-800/50' }
                        : { label: '⚠ Needs key', cls: 'bg-gray-800 text-gray-500 border-gray-700' }
                      return (
                        <button
                          key={model.id}
                          onClick={() => setSelectedModel(model.id)}
                          title={model.setupHint || undefined}
                          className={`relative px-3 py-2 rounded-xl border text-left transition-all ${isSelected ? 'border-indigo-500 bg-indigo-900/30' : 'border-gray-700 bg-gray-900 hover:border-gray-600'} ${model.status === 'needs_key' ? 'opacity-75' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>{model.name}</span>
                          </div>
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusBadge.cls}`}>{statusBadge.label}</span>
                            {staticInfo && (
                              <>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-400 font-medium">{staticInfo.quality}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">~{staticInfo.avgSec}s</span>
                              </>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {(() => {
                    // Contextual help row UNDER the picker, based on the
                    // currently-selected model's status. This is where the
                    // smart UX lives — link straight to the BYOK section
                    // for the missing key.
                    const cur = modelStatus.find(m => m.id === selectedModel)
                    if (!cur) return null
                    if (cur.status === 'ready') {
                      return <p className="text-emerald-400 text-[11px] mt-2">{cur.setupHint}</p>
                    }
                    if (cur.status === 'beta_access') {
                      return (
                        <p className="text-amber-400 text-[11px] mt-2">
                          {cur.setupHint}{' '}
                          <a href={`/dashboard/settings${cur.byokAnchor}`} className="underline">Open API Keys →</a>
                        </p>
                      )
                    }
                    // needs_key
                    return (
                      <p className="text-gray-400 text-[11px] mt-2">
                        {cur.setupHint}{' '}
                        <a href={`/dashboard/settings${cur.byokAnchor}`} className="text-indigo-400 underline">Add key →</a>
                      </p>
                    )
                  })()}
                </div>

                {/* Style Presets */}
                <div>
                  <label className="text-gray-400 text-xs mb-2 block">Style</label>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {STYLE_PRESETS.map(s => (
                      <button
                        key={s}
                        onClick={() => setSelectedStyle(s)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedStyle === s ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Settings grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-xs mb-1.5 block">Duration</label>
                    <div className="flex flex-wrap gap-1.5">
                      {DURATION_OPTS.map(d => (
                        <button
                          key={d}
                          onClick={() => setDuration(d)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${duration === d ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                        >{d}s</button>
                      ))}
                    </div>
                    <p className="text-gray-600 text-[10px] mt-1">Runway supports 5s or 10s clips</p>
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1.5 block">Aspect Ratio</label>
                    <div className="flex flex-wrap gap-1.5">
                      {RATIO_OPTS.map(r => (
                        <button
                          key={r}
                          onClick={() => setAspectRatio(r)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${aspectRatio === r ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                        >{r}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1.5 block">Resolution</label>
                    <div className="flex flex-wrap gap-1.5">
                      {RESOLUTION_OPTS.map(r => (
                        <button
                          key={r}
                          onClick={() => setResolution(r)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${resolution === r ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                        >{r}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1.5 block">Frame Rate</label>
                    <div className="flex flex-wrap gap-1.5">
                      {FPS_OPTS.map(f => (
                        <button
                          key={f}
                          onClick={() => setFps(f)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${fps === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                        >{f} FPS</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Script-to-Video toggle (visual stub) */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">Script-to-Video</p>
                      <p className="text-gray-500 text-xs mt-0.5">Multi-scene scripts will be supported in a later release</p>
                    </div>
                    <button
                      onClick={() => setScriptMode(s => !s)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${scriptMode ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${scriptMode ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {scriptMode && (
                    <textarea
                      value={scriptText}
                      onChange={e => setScriptText(e.target.value)}
                      rows={4}
                      placeholder="Scene 1: ..."
                      className="mt-3 w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-xs focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  )}
                </div>

                {/* Generate button */}
                <button
                  onClick={startGeneration}
                  disabled={generating || !prompt.trim() || !workspaceId}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <><Spinner size={4} /> Generating with {currentModel.name}... ~{currentModel.avgSec}s</>
                  ) : (
                    <>
                      <span>Generate Video</span>
                      <span className="text-indigo-300 font-normal text-xs">~$0.50</span>
                    </>
                  )}
                </button>

                {!workspaceId && (
                  <p className="text-amber-400 text-[10px] text-center">Open a workspace first</p>
                )}

                {generationError && (
                  <div className="p-3 rounded-lg bg-red-900/30 border border-red-700/50">
                    <p className="text-red-300 text-xs leading-relaxed">{generationError}</p>
                    <button
                      onClick={() => { setGenerationError(null); void startGeneration() }}
                      className="mt-2 text-red-200 hover:text-white text-[10px] underline"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Generation progress */}
                {generating && (
                  <div className="bg-gray-900 border border-indigo-800/40 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Spinner size={4} />
                      <span className="text-white text-sm font-medium">{generationStatus}</span>
                    </div>
                    <p className="text-indigo-300 text-xs mb-1">
                      Model: {currentModel.name} · {elapsed}s elapsed · est ~{currentModel.avgSec}s
                    </p>
                    {currentTaskId && (
                      <p className="text-gray-600 text-[10px] mt-1 font-mono">Task: {currentTaskId.slice(0, 16)}...</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ─── CUSTOMIZE TAB ─── */}
            {mainTab === 'customize' && (
              <div className="p-4 space-y-5">
                <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl p-3">
                  <p className="text-amber-300 text-xs">
                    These controls are visual settings only — actual video editing (overlays, color grading, trim) is not yet wired up. We currently generate single clips end-to-end.
                  </p>
                </div>

                {/* Text Overlay */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                  <p className="text-white text-sm font-medium">Text Overlay (preview)</p>
                  <input
                    value={overlayText}
                    onChange={e => setOverlayText(e.target.value)}
                    placeholder="Add overlay text..."
                    className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-gray-500 text-xs mb-1 block">Font Size</label>
                      <input
                        type="number"
                        value={fontSize}
                        onChange={e => setFontSize(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs mb-1 block">Animation</label>
                      <div className="flex gap-1.5">
                        {['Fade', 'Slide', 'Zoom'].map(a => (
                          <button
                            key={a}
                            onClick={() => setTextAnim(a)}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${textAnim === a ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                          >{a}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Color Grading */}
                <div>
                  <label className="text-gray-400 text-xs mb-2 block">Color Grading (preview)</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_GRADES.map(g => (
                      <button
                        key={g.id}
                        onClick={() => setColorGrade(g.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${colorGrade === g.id ? 'border-indigo-500 bg-indigo-900/30 text-white' : 'border-gray-700 bg-gray-900 text-gray-400 hover:text-white'}`}
                      >
                        <span className={`w-3 h-3 rounded-full ${g.color}`} />
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Trim Controls */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                  <p className="text-white text-sm font-medium">Trim (preview)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-gray-500 text-xs mb-1 block">Start (s)</label>
                      <input value={trimStart} onChange={e => setTrimStart(e.target.value)} type="number" step="0.1" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs mb-1 block">End (s)</label>
                      <input value={trimEnd} onChange={e => setTrimEnd(e.target.value)} type="number" step="0.1" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
                    </div>
                  </div>
                </div>

                {/* Speed */}
                <div>
                  <label className="text-gray-400 text-xs mb-2 block">Playback Speed</label>
                  <div className="flex gap-2">
                    {['0.5x', '1x', '1.5x', '2x'].map(s => (
                      <button
                        key={s}
                        onClick={() => setPlaybackSpeed(s)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${playbackSpeed === s ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                      >{s}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ─── EXPORT TAB ─── */}
            {mainTab === 'export' && (
              <div className="p-4 space-y-5">
                <div>
                  <label className="text-gray-400 text-xs mb-2 block">Format</label>
                  <div className="flex gap-2">
                    {EXPORT_FORMATS.map(f => (
                      <button
                        key={f}
                        onClick={() => setExportFormat(f)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${exportFormat === f ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-700'}`}
                      >{f}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-gray-400 text-xs mb-2 block">Quality</label>
                  <div className="flex flex-col gap-2">
                    {EXPORT_QUALITIES.map(q => (
                      <button
                        key={q}
                        onClick={() => setExportQuality(q)}
                        className={`w-full py-2.5 px-4 rounded-xl text-sm font-medium text-left transition-colors ${exportQuality === q ? 'bg-indigo-900/40 border border-indigo-500 text-white' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-700'}`}
                      >{q}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-gray-400 text-xs">Compression</label>
                    <span className="text-gray-400 text-xs">{compression}/10</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={compression}
                    onChange={e => setCompression(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">Watermark</p>
                      <p className="text-gray-500 text-xs">Add branding to your export</p>
                    </div>
                    <button
                      onClick={() => setWatermark(w => !w)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${watermark ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${watermark ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {watermark && (
                    <input
                      value={watermarkText}
                      onChange={e => setWatermarkText(e.target.value)}
                      placeholder="Your brand name..."
                      className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  )}
                </div>

                <div className="flex gap-3">
                  {displayVideoUrl ? (
                    <a
                      href={displayVideoUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Download
                    </a>
                  ) : (
                    <button disabled className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-800 text-gray-500 text-sm font-medium cursor-not-allowed">
                      No video ready
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="w-72 border-l border-gray-800 flex flex-col bg-gray-900 overflow-y-auto shrink-0">
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-white text-sm font-semibold">Studio Tools</h3>
        </div>

        <div className="flex-1 p-4 space-y-5 overflow-y-auto">
          {/* Character Consistency */}
          <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
            <p className="text-white text-sm font-medium">Character Consistency</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gray-700 border border-dashed border-gray-600 flex items-center justify-center cursor-pointer hover:border-indigo-500 transition-colors">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <div className="flex-1">
                <p className="text-gray-400 text-xs">Upload reference image</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-gray-400 text-xs">Lock Character</span>
                  <button
                    onClick={() => setCharLock(c => !c)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${charLock ? 'bg-indigo-600' : 'bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${charLock ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Brand Kit */}
          <div className="bg-gray-800/60 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-white text-sm font-medium">Brand Kit</p>
              <button
                onClick={() => setApplyBrand(b => !b)}
                className={`relative w-9 h-5 rounded-full transition-colors ${applyBrand ? 'bg-indigo-600' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${applyBrand ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            {applyBrand && (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {['#6366F1', '#8B5CF6', '#F59E0B', '#10B981'].map(c => (
                    <div key={c} className="w-6 h-6 rounded-full border border-gray-700 cursor-pointer hover:ring-2 ring-white/30 transition-all" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <p className="text-gray-500 text-xs">Ooumph Sans · Logo: bottom-right</p>
              </div>
            )}
          </div>

          {/* AI Suggestions */}
          <div>
            <p className="text-white text-sm font-medium mb-2">AI Suggestions</p>
            <div className="space-y-2">
              {AI_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  className="w-full flex items-start gap-2 px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-left transition-colors border border-gray-700/50 group"
                >
                  <span className="text-indigo-400 mt-0.5 text-xs">✦</span>
                  <span className="text-gray-300 text-xs group-hover:text-white transition-colors">{s}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Stats — real */}
          <div className="bg-gray-800/60 rounded-xl p-4 space-y-2">
            <p className="text-white text-sm font-medium">This Month</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-white font-bold text-lg">{stats.videos}</p>
                <p className="text-gray-500 text-[10px]">Videos</p>
              </div>
              <div>
                <p className="text-white font-bold text-lg">{formatDurationMin(stats.durationSec)}</p>
                <p className="text-gray-500 text-[10px]">Duration</p>
              </div>
              <div>
                <p className="text-white font-bold text-lg">${stats.cost.toFixed(2)}</p>
                <p className="text-gray-500 text-[10px]">Cost</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
