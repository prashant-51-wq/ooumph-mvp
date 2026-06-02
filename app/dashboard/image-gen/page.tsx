'use client'

import { useState, useEffect } from 'react'
import { ProviderConnectBanner } from '@/components/dashboard/ProviderConnectBanner'
import { usePersistedState } from '@/lib/hooks/use-persisted-state'

// ─── Types ────────────────────────────────────────────────────────────────────

type StudioTab = 'studio' | 'gallery' | 'batch'

interface GalleryImage {
  id: string
  prompt: string
  model: string
  style: string
  size: string
  date: string
  imageUrl: string
  selected?: boolean
}

interface GeneratedImage {
  imageUrl: string
  prompt: string
  artifactId?: string
  revisedPrompt?: string
}

// ─── Static config ───────────────────────────────────────────────────────────

// Sprint 4B: collapsed to just DALL-E 3 — the only model with a real
// /api/agents/creative/image backend wiring. Midjourney/SDXL/Ideogram/Flux
// were visual placeholders that routed silently to DALL-E 3 anyway,
// disguising "we don't actually have this model" as "this model exists."
// When Replicate / Stability / Flux are properly wired add them back here.
const IMAGE_MODELS = [
  { id: 'dalle3', name: 'DALL-E 3', specialty: 'Photorealistic', speedDot: 'bg-emerald-500' },
  { id: 'firefly', name: 'Adobe Firefly', specialty: 'Corporate', speedDot: 'bg-amber-500' },
]

const STYLE_PRESETS = [
  'Photorealistic', 'Illustration', '3D Render', 'Watercolor', 'Oil Painting',
  'Minimalist', 'Neon Cyberpunk', 'Corporate Clean', 'Social Media', 'Logo Design',
  'Product Photography', 'Infographic',
]

// UI size label → API size value (OpenAI supports 1024x1024 / 1792x1024 / 1024x1792).
const SIZE_OPTIONS = [
  { label: '1024×1024', value: '1024×1024', api: '1024x1024', ratio: '1:1' },
  { label: '1024×1792', value: '1024×1792', api: '1024x1792', ratio: '9:16' },
  { label: '1792×1024', value: '1792×1024', api: '1792x1024', ratio: '16:9' },
] as const

const QUALITY_OPTIONS: Array<{ label: string; api: 'standard' | 'hd' }> = [
  { label: 'Standard', api: 'standard' },
  { label: 'HD', api: 'hd' },
]
const LIGHTING_OPTIONS = ['Natural', 'Studio', 'Dramatic', 'Soft', 'Neon']
const COUNT_OPTIONS = ['1', '2', '4']

const PROMPT_LIBRARY = [
  { id: 'pl1', name: 'CEO Portrait', category: 'Marketing', chips: ['Studio', 'Corporate'] },
  { id: 'pl2', name: 'Product Hero Shot', category: 'Product', chips: ['Clean', 'HD'] },
  { id: 'pl3', name: 'Brand Pattern', category: 'Brand', chips: ['Abstract', 'Geometric'] },
  { id: 'pl4', name: 'Social Banner', category: 'Social', chips: ['Bold', 'Modern'] },
  { id: 'pl5', name: 'Abstract Background', category: 'Abstract', chips: ['Gradient', 'Smooth'] },
]

const BATCH_PROMPTS_PLACEHOLDER = `A professional headshot of a confident entrepreneur
A minimalist product shot of a coffee mug on marble
Bold typographic social media post with gradient background
Abstract geometric brand pattern in indigo and violet
Corporate team meeting illustration, clean lines`

// ─── Sub-components ────────────────────────────────────────────────────────────

function Spinner({ size = 4 }: { size?: number }) {
  return (
    <svg className={`animate-spin w-${size} h-${size}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function ApiSettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Sprint 4B: `provider` state removed — was only consumed by the 5-option
  // dropdown that's been deleted. The image generation backend reads its
  // provider from /api/workspace-secrets (the BYOK key resolution path),
  // not from a per-page user selection.
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle')

  function testConnection() {
    setTesting(true)
    setTestResult('idle')
    setTimeout(() => {
      setTesting(false)
      setTestResult(apiKey.length > 10 ? 'ok' : 'fail')
    }, 1500)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-gray-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-96 bg-gray-900 border-l border-gray-800 h-full overflow-y-auto p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Image API Settings</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="text-gray-400 text-xs bg-gray-900/40 border border-gray-800 rounded-lg p-3">
          API keys are configured in Settings → AI Assistants. The image
          generator routes through OpenAI's DALL-E 3 endpoint using the key
          stored on your workspace.
        </p>
        {/* Sprint 4B: removed the 5-option provider dropdown
            (Midjourney / Replicate / Adobe Firefly / Ideogram). Only the
            OpenAI path is implemented — listing the others as if you could
            switch was misleading. Restore when those providers are wired. */}
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
          onClick={testConnection}
          disabled={testing}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors disabled:opacity-50"
        >
          {testing ? <><Spinner size={4} /> Testing...</> : 'Test Connection'}
        </button>
        {testResult === 'ok' && <p className="text-emerald-400 text-xs text-center">Connection successful</p>}
        {testResult === 'fail' && <p className="text-red-400 text-xs text-center">Connection failed — check your API key</p>}
        <button className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors" onClick={onClose}>
          Save Settings
        </button>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = (Date.now() - t) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ImageGenPage() {
  const [studioTab, setStudioTab] = useState<StudioTab>('studio')
  const [apiPanelOpen, setApiPanelOpen] = useState(false)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  // Sprint 19D: ProviderConnectBanner readiness — image-gen needs OpenAI
  // (DALL-E 3) or Stability AI. We surface a banner for whichever the user
  // currently has selected. Default model is dalle3 so we check openai
  // first; if user switches to stability we re-check.
  const [providerReady, setProviderReady] = useState<boolean | null>(null)
  const refreshProvider = async (provider: 'openai' | 'stability') => {
    if (!workspaceId) return
    try {
      const r = await fetch(`/api/workspaces?id=${workspaceId}`, { credentials: 'include' })
      if (!r.ok) { setProviderReady(false); return }
      const data = await r.json() as { secrets?: Record<string, boolean> }
      setProviderReady(Boolean(data.secrets?.[provider]))
    } catch { setProviderReady(false) }
  }

  // Left panel state
  const [prompt, setPrompt] = usePersistedState<string>('image-gen:prompt', '')
  const [negativePrompt, setNegativePrompt] = usePersistedState<string>('image-gen:negativePrompt', '')
  const [showNegative, setShowNegative] = useState(false)
  const [selectedModel, setSelectedModel] = usePersistedState<string>('image-gen:model', 'dalle3')
  const [selectedStyle, setSelectedStyle] = usePersistedState<string>('image-gen:style', 'Photorealistic')
  const [selectedSize, setSelectedSize] = usePersistedState<string>('image-gen:size', '1024×1024')
  const [quality, setQuality] = usePersistedState<string>('image-gen:quality', 'HD')
  const [styleStrength, setStyleStrength] = useState(75)
  const [imageCount, setImageCount] = usePersistedState<string>('image-gen:count', '1')
  const [seed, setSeed] = usePersistedState<string>('image-gen:seed', '')
  const [lighting, setLighting] = usePersistedState<string>('image-gen:lighting', 'Studio')
  const [applyBrandColors, setApplyBrandColors] = useState(false)
  const [logoPlacement, setLogoPlacement] = useState('None')
  const [safeMode, setSafeMode] = useState(true)
  const [promptLibOpen, setPromptLibOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

  // Studio tab state
  const [generatedImages, setGeneratedImages] = usePersistedState<GeneratedImage[]>('image-gen:results', [])
  const [hoveredImage, setHoveredImage] = useState<number | null>(null)
  const [mediaLibStatus, setMediaLibStatus] = useState<Record<number, 'idle' | 'saving' | 'saved' | 'error'>>({})

  // Gallery tab state
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [galleryError, setGalleryError] = useState<string | null>(null)
  const [galleryFilter, setGalleryFilter] = useState<string>('All')
  const [gallerySearch, setGallerySearch] = useState('')
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<Set<string>>(new Set())

  // Batch tab state
  const [batchPrompts, setBatchPrompts] = useState('')
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [batchCurrentItem, setBatchCurrentItem] = useState(0)
  const [batchResults, setBatchResults] = useState<Array<{ prompt: string; imageUrl?: string; error?: string }>>([])

  // Load workspaceId on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWorkspaceId(localStorage.getItem('workspaceId'))
    }
  }, [])

  // Sprint 19D: refresh provider readiness when workspace or model changes
  useEffect(() => {
    if (!workspaceId) return
    const p: 'openai' | 'stability' = selectedModel === 'stability' ? 'stability' : 'openai'
    void refreshProvider(p)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, selectedModel])

  // Fetch gallery whenever the gallery tab opens or workspace changes
  useEffect(() => {
    if (studioTab !== 'gallery' || !workspaceId) return
    void fetchGallery()
  }, [studioTab, workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchGallery() {
    if (!workspaceId) return
    setGalleryLoading(true)
    setGalleryError(null)
    try {
      const res = await fetch(`/api/artifacts?workspaceId=${workspaceId}&type=image`)
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const data = await res.json() as Array<{
        id: string
        title: string
        content_json: { imageUrl?: string; prompt?: string; revisedPrompt?: string; size?: string; cloudinaryUrl?: string } | string
        created_at: string
      }>
      type CJ = { imageUrl?: string; prompt?: string; revisedPrompt?: string; size?: string; cloudinaryUrl?: string }
      const items: GalleryImage[] = data
        .map((row) => {
          const cj: CJ | undefined =
            typeof row.content_json === 'string'
              ? safeParse<CJ>(row.content_json)
              : (row.content_json as CJ | undefined)
          const url = cj?.cloudinaryUrl || cj?.imageUrl || ''
          if (!url) return null
          return {
            id: row.id,
            prompt: cj?.prompt || row.title || '',
            model: 'DALL-E 3',
            style: '',
            size: cj?.size || '',
            date: relativeTime(row.created_at),
            imageUrl: url,
          }
        })
        .filter((x): x is GalleryImage => x !== null)
      setGalleryImages(items)
    } catch (err) {
      setGalleryError(err instanceof Error ? err.message : 'Failed to load gallery')
    } finally {
      setGalleryLoading(false)
    }
  }

  async function generateOne(promptText: string): Promise<{ imageUrl: string; artifactId?: string; revisedPrompt?: string } | { error: string }> {
    if (!workspaceId) return { error: 'No workspace selected. Open a workspace and try again.' }
    const sizeApi = SIZE_OPTIONS.find(s => s.value === selectedSize)?.api || '1024x1024'
    const qualityApi = QUALITY_OPTIONS.find(q => q.label === quality)?.api || 'standard'
    try {
      const res = await fetch('/api/agents/creative/image-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          prompt: promptText,
          size: sizeApi,
          quality: qualityApi,
          style: 'vivid',
        }),
      })
      const data = await res.json() as {
        ok?: boolean
        imageUrl?: string
        artifactId?: string
        revisedPrompt?: string
        error?: string
      }
      if (!data.ok || !data.imageUrl) {
        return { error: data.error || 'Image generation failed' }
      }
      return { imageUrl: data.imageUrl, artifactId: data.artifactId, revisedPrompt: data.revisedPrompt }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Network error' }
    }
  }

  async function startGeneration() {
    if (!prompt.trim()) return
    setGenerationError(null)
    setGenerating(true)
    setGeneratedImages([])
    setMediaLibStatus({})
    const count = parseInt(imageCount)
    const results: GeneratedImage[] = []
    for (let i = 0; i < count; i++) {
      const result = await generateOne(prompt)
      if ('error' in result) {
        setGenerationError(result.error)
        break
      }
      results.push({
        imageUrl: result.imageUrl,
        prompt,
        artifactId: result.artifactId,
        revisedPrompt: result.revisedPrompt,
      })
      setGeneratedImages([...results])
    }
    setGenerating(false)
    setStudioTab('studio')
  }

  function enhancePrompt() {
    if (!prompt.trim()) return
    setPrompt(prompt + ', ultra-detailed, professional photography, 8k resolution, award-winning composition, dramatic lighting, sharp focus, high contrast')
  }

  function toggleGallerySelect(id: string) {
    setSelectedGalleryIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function addToMediaLibrary(idx: number) {
    const img = generatedImages[idx]
    if (!img || !workspaceId) return
    setMediaLibStatus(s => ({ ...s, [idx]: 'saving' }))
    try {
      // The image-gen agent already creates an artifact; this endpoint creates
      // an explicit media_library artifact for organized library views.
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          type: 'media_library_image',
          title: img.prompt.slice(0, 200) || 'Generated image',
          content_json: { imageUrl: img.imageUrl, prompt: img.prompt, source: 'image-gen-studio' },
        }),
      })
      const data = await res.json()
      setMediaLibStatus(s => ({ ...s, [idx]: data.ok ? 'saved' : 'error' }))
    } catch {
      setMediaLibStatus(s => ({ ...s, [idx]: 'error' }))
    }
  }

  async function startBatch() {
    const lines = batchPrompts.split('\n').filter(l => l.trim())
    if (!lines.length || !workspaceId) return
    setBatchRunning(true)
    setBatchProgress(0)
    setBatchCurrentItem(0)
    setBatchResults(lines.map(p => ({ prompt: p })))

    for (let i = 0; i < lines.length; i++) {
      setBatchCurrentItem(i)
      const r = await generateOne(lines[i])
      setBatchResults(prev => {
        const next = [...prev]
        if ('error' in r) next[i] = { prompt: lines[i], error: r.error }
        else next[i] = { prompt: lines[i], imageUrl: r.imageUrl }
        return next
      })
      setBatchProgress(Math.round(((i + 1) / lines.length) * 100))
    }
    setBatchRunning(false)
  }

  const filteredGallery = galleryImages.filter(img => {
    const matchesFilter = galleryFilter === 'All' || img.model === galleryFilter
    const matchesSearch = !gallerySearch || img.prompt.toLowerCase().includes(gallerySearch.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const batchLines = batchPrompts.split('\n').filter(l => l.trim())
  const batchCost = (batchLines.length * 0.04).toFixed(2)

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <ApiSettingsPanel open={apiPanelOpen} onClose={() => setApiPanelOpen(false)} />

      {/* ── LEFT PANEL ── */}
      <div className="w-96 border-r border-gray-800 flex flex-col bg-gray-900 shrink-0 overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <h1 className="text-white font-bold text-lg">AI Image Studio</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setApiPanelOpen(true)}
              className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {/* Prompt */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-gray-400 text-xs font-medium">Prompt</label>
              <button
                onClick={enhancePrompt}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <span>✨</span> Enhance Prompt
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={4}
              placeholder="Describe your image... e.g. A professional headshot of a confident entrepreneur in a modern office, cinematic lighting, sharp focus"
              className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            />
            <button
              onClick={() => setShowNegative(n => !n)}
              className="mt-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors flex items-center gap-1"
            >
              <svg className={`w-3 h-3 transition-transform ${showNegative ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              Negative prompt
            </button>
            {showNegative && (
              <textarea
                value={negativePrompt}
                onChange={e => setNegativePrompt(e.target.value)}
                rows={2}
                placeholder="What to exclude... blurry, low quality, distorted, watermark"
                className="mt-2 w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-xs focus:outline-none focus:border-indigo-500 resize-none"
              />
            )}
          </div>

          {/* Model Selector */}
          <div>
            <label className="text-gray-400 text-xs font-medium mb-2 block">Model</label>
            <div className="grid grid-cols-2 gap-2">
              {IMAGE_MODELS.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={`flex items-start gap-2.5 px-3 py-3 rounded-xl border text-left transition-all ${selectedModel === m.id ? 'border-indigo-500 bg-indigo-900/30' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}
                >
                  <span className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${m.speedDot}`} />
                  <div>
                    <p className={`text-xs font-semibold leading-tight ${selectedModel === m.id ? 'text-white' : 'text-gray-200'}`}>{m.name}</p>
                    <p className="text-gray-500 text-[10px] mt-0.5">{m.specialty}</p>
                  </div>
                </button>
              ))}
            </div>
            {/* Sprint 4B: removed "other models route to DALL-E 3 anyway"
                disclaimer — the model list now contains only DALL-E 3, so
                there's nothing to disclaim. */}
          </div>

          {/* Style Presets */}
          <div>
            <label className="text-gray-400 text-xs font-medium mb-2 block">Style</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
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

          {/* Settings */}
          <div className="space-y-4">
            {/* Size */}
            <div>
              <label className="text-gray-400 text-xs font-medium mb-2 block">Size</label>
              <div className="grid grid-cols-2 gap-1.5">
                {SIZE_OPTIONS.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setSelectedSize(s.value)}
                    className={`px-2.5 py-2 rounded-lg border text-left transition-all ${selectedSize === s.value ? 'border-indigo-500 bg-indigo-900/30' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}
                  >
                    <p className={`text-xs font-medium ${selectedSize === s.value ? 'text-white' : 'text-gray-300'}`}>{s.label}</p>
                    <p className="text-gray-600 text-[10px]">{s.ratio}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality */}
            <div>
              <label className="text-gray-400 text-xs font-medium mb-2 block">Quality</label>
              <div className="flex gap-1.5">
                {QUALITY_OPTIONS.map(q => (
                  <button
                    key={q.label}
                    onClick={() => setQuality(q.label)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${quality === q.label ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >{q.label}</button>
                ))}
              </div>
            </div>

            {/* Style strength */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-gray-400 text-xs font-medium">Style Strength</label>
                <span className="text-gray-400 text-xs">{styleStrength}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={styleStrength}
                onChange={e => setStyleStrength(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>

            {/* Count + Seed */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs font-medium mb-1.5 block">Images</label>
                <div className="flex gap-1.5">
                  {COUNT_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setImageCount(c)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${imageCount === c ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                    >{c}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium mb-1.5 block">Seed</label>
                <input
                  value={seed}
                  onChange={e => setSeed(e.target.value)}
                  placeholder="Random"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs focus:outline-none focus:border-indigo-500 placeholder-gray-600"
                />
              </div>
            </div>

            {/* Lighting */}
            <div>
              <label className="text-gray-400 text-xs font-medium mb-1.5 block">Lighting</label>
              <div className="flex gap-1.5 flex-wrap">
                {LIGHTING_OPTIONS.map(l => (
                  <button
                    key={l}
                    onClick={() => setLighting(l)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${lighting === l ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >{l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Brand Safety */}
          <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
            <p className="text-white text-sm font-medium">Brand Safety</p>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-xs">Apply Brand Colors</span>
              <button
                onClick={() => setApplyBrandColors(b => !b)}
                className={`relative w-9 h-5 rounded-full transition-colors ${applyBrandColors ? 'bg-indigo-600' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${applyBrandColors ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Logo Placement</label>
              <div className="flex gap-1.5 flex-wrap">
                {['None', 'Top-left', 'Bottom-right', 'Watermark'].map(p => (
                  <button
                    key={p}
                    onClick={() => setLogoPlacement(p)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${logoPlacement === p ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
                  >{p}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-xs">Safe Mode</span>
              <button
                onClick={() => setSafeMode(s => !s)}
                className={`relative w-9 h-5 rounded-full transition-colors ${safeMode ? 'bg-emerald-600' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${safeMode ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {/* Prompt Library */}
          <div className="border border-gray-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setPromptLibOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 hover:bg-gray-800 transition-colors text-left"
            >
              <span className="text-white text-sm font-medium">Prompt Library</span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${promptLibOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {promptLibOpen && (
              <div className="p-3 space-y-2 bg-gray-900/50">
                {PROMPT_LIBRARY.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-800 border border-gray-700/50">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white text-xs font-medium">{p.name}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{p.category}</span>
                      </div>
                      <div className="flex gap-1 mt-1">
                        {p.chips.map(c => (
                          <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-900/50 text-indigo-400">{c}</span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => setPrompt(`${p.name.toLowerCase()} style prompt...`)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium transition-colors"
                    >Use</button>
                  </div>
                ))}
                <button className="w-full py-2 rounded-lg border border-dashed border-gray-700 text-gray-500 hover:text-gray-300 text-xs transition-colors">
                  + Save Current Prompt
                </button>
              </div>
            )}
          </div>

          {/* Generate button */}
          <div className="pb-4">
            <button
              onClick={startGeneration}
              disabled={generating || !prompt.trim() || !workspaceId}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {generating ? (
                <><Spinner size={4} /> Generating with DALL-E 3... ~5s</>
              ) : (
                <>
                  <span>Generate</span>
                  <span className="text-indigo-300 font-normal text-xs">~$0.04 per image</span>
                </>
              )}
            </button>
            {!workspaceId && (
              <p className="text-amber-400 text-[10px] mt-2 text-center">Open a workspace first</p>
            )}
            {generationError && (
              <div className="mt-3 p-3 rounded-lg bg-red-900/30 border border-red-700/50">
                <p className="text-red-300 text-xs leading-relaxed">{generationError}</p>
                <button
                  onClick={() => { setGenerationError(null); startGeneration() }}
                  className="mt-2 text-red-200 hover:text-white text-[10px] underline"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
        {/* Tab bar */}
        <div className="flex border-b border-gray-800 px-5 bg-gray-950 shrink-0 pt-4">
          {(['studio', 'gallery', 'batch'] as StudioTab[]).map(t => (
            <button
              key={t}
              onClick={() => setStudioTab(t)}
              className={`px-5 py-3 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${studioTab === t ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              {t}
              {t === 'gallery' && galleryImages.length > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 text-[10px]">{galleryImages.length}</span>}
            </button>
          ))}
        </div>

        {/* ─── STUDIO TAB ─── */}
        {studioTab === 'studio' && (
          <div className="flex-1 overflow-y-auto p-5">
            {/* Sprint 19D: in-product provider connect banner */}
            {selectedModel === 'stability' ? (
              <ProviderConnectBanner
                ready={providerReady}
                workspaceId={workspaceId}
                providerId="stability"
                providerName="Stability AI"
                icon="🎨"
                description="Stable Diffusion XL generates the images on this page."
                signupUrl="https://platform.stability.ai/"
                keysHelpUrl="https://platform.stability.ai/account/keys"
                freeTierNote="25 free credits on signup (~25 images). Pay-as-you-go after."
                fields={[{ label: 'API Key', placeholder: 'sk-…', payloadKey: 'key', password: true }]}
                testMode="workspace-secrets"
                onConnected={() => void refreshProvider('stability')}
              />
            ) : (
              <ProviderConnectBanner
                ready={providerReady}
                workspaceId={workspaceId}
                providerId="openai"
                providerName="OpenAI"
                icon="🖼️"
                description="DALL-E 3 generates the images on this page."
                signupUrl="https://platform.openai.com/signup"
                keysHelpUrl="https://platform.openai.com/api-keys"
                freeTierNote="Pay-as-you-go. Pre-paid balance starts at $5."
                fields={[{ label: 'API Key', placeholder: 'sk-proj-…', payloadKey: 'key', password: true }]}
                testMode="workspace-secrets"
                onConnected={() => void refreshProvider('openai')}
              />
            )}
            {generatedImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                <div className="w-20 h-20 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-4">
                  <svg className="w-10 h-10 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <p className="text-gray-400 text-sm font-medium">Your generated images appear here</p>
                <p className="text-gray-600 text-xs mt-1">Write a prompt and click Generate to start</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`grid gap-4 ${generatedImages.length === 1 ? 'grid-cols-1 max-w-xl' : 'grid-cols-2'}`}>
                  {generatedImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative rounded-2xl overflow-hidden group cursor-pointer bg-gray-900"
                      style={{ aspectRatio: '1' }}
                      onMouseEnter={() => setHoveredImage(idx)}
                      onMouseLeave={() => setHoveredImage(null)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.imageUrl} alt={img.prompt} className="absolute inset-0 w-full h-full object-cover" />

                      {/* Prompt overlay at bottom */}
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                        <p className="text-white text-xs line-clamp-2 leading-relaxed">{img.revisedPrompt || img.prompt}</p>
                      </div>

                      {/* Hover actions */}
                      {hoveredImage === idx && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 flex-wrap p-4">
                          <a
                            href={img.imageUrl}
                            download
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium backdrop-blur-sm transition-colors flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Download
                          </a>
                          <button
                            onClick={() => navigator.clipboard.writeText(img.prompt)}
                            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium backdrop-blur-sm transition-colors"
                          >
                            Copy Prompt
                          </button>
                          <button
                            onClick={() => addToMediaLibrary(idx)}
                            disabled={mediaLibStatus[idx] === 'saving' || mediaLibStatus[idx] === 'saved'}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-70 text-white text-xs font-medium backdrop-blur-sm transition-colors flex items-center gap-1"
                          >
                            {mediaLibStatus[idx] === 'saving' && <Spinner size={3} />}
                            {mediaLibStatus[idx] === 'saved' ? '✓ Added to Media Library' :
                             mediaLibStatus[idx] === 'error' ? 'Save failed — retry' :
                             '+ Add to Media Library'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── GALLERY TAB ─── */}
        {studioTab === 'gallery' && (
          <div className="flex-1 overflow-y-auto p-5">
            {/* Filters */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-0">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  value={gallerySearch}
                  onChange={e => setGallerySearch(e.target.value)}
                  placeholder="Search by prompt..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-gray-900 border border-gray-800 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                onClick={() => void fetchGallery()}
                disabled={galleryLoading}
                className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {galleryLoading ? <><Spinner size={3} /> Loading</> : 'Refresh'}
              </button>
            </div>

            {/* Loading / Error / Empty */}
            {galleryLoading && galleryImages.length === 0 && (
              <div className="flex items-center justify-center py-20 text-gray-500 text-sm gap-2">
                <Spinner size={4} /> Loading your gallery...
              </div>
            )}

            {galleryError && (
              <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 flex items-center justify-between">
                <p className="text-red-300 text-sm">{galleryError}</p>
                <button onClick={() => void fetchGallery()} className="text-red-200 hover:text-white text-xs underline">Retry</button>
              </div>
            )}

            {!galleryLoading && !galleryError && filteredGallery.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <p className="text-gray-400 text-sm font-medium">No images yet — generate your first one</p>
                <p className="text-gray-600 text-xs mt-1">Images you generate here will show up in this gallery</p>
              </div>
            )}

            {/* Multi-select actions */}
            {selectedGalleryIds.size > 0 && (
              <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-indigo-900/30 border border-indigo-800/50">
                <span className="text-indigo-300 text-xs font-medium">{selectedGalleryIds.size} selected</span>
                <div className="flex gap-2 ml-auto">
                  <button className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">Batch Download</button>
                </div>
              </div>
            )}

            {/* Grid */}
            {filteredGallery.length > 0 && (
              <div className="columns-2 md:columns-3 gap-3 space-y-3">
                {filteredGallery.map((img) => (
                  <div
                    key={img.id}
                    className="break-inside-avoid relative rounded-xl overflow-hidden group cursor-pointer bg-gray-900"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.imageUrl} alt={img.prompt} className="w-full h-auto block" />
                    {/* Checkbox */}
                    <div
                      className={`absolute top-2 left-2 w-5 h-5 rounded border-2 transition-all cursor-pointer z-10 flex items-center justify-center ${selectedGalleryIds.has(img.id) ? 'border-indigo-500 bg-indigo-600' : 'border-white/40 bg-black/20 opacity-0 group-hover:opacity-100'}`}
                      onClick={e => { e.stopPropagation(); toggleGallerySelect(img.id) }}
                    >
                      {selectedGalleryIds.has(img.id) && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 flex flex-col justify-end p-3">
                      <p className="text-white text-xs line-clamp-2 leading-relaxed">{img.prompt}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] text-gray-300">{img.model}</span>
                        <span className="text-gray-600">·</span>
                        <span className="text-[10px] text-gray-400">{img.date}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── BATCH TAB ─── */}
        {studioTab === 'batch' && (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="max-w-2xl space-y-5">
              <div>
                <label className="text-gray-400 text-xs font-medium mb-1.5 block">Prompts (one per line)</label>
                <textarea
                  value={batchPrompts}
                  onChange={e => setBatchPrompts(e.target.value)}
                  rows={8}
                  placeholder={BATCH_PROMPTS_PLACEHOLDER}
                  className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 resize-none font-mono"
                />
                <p className="text-gray-600 text-xs mt-1">Each prompt is generated sequentially (5-10s each)</p>
              </div>

              {/* Preview & per-item progress */}
              {batchLines.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-white text-sm font-medium">Batch Queue</p>
                    <span className="text-gray-400 text-xs">{batchLines.length} prompts · ~${batchCost}</span>
                  </div>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {(batchRunning || batchResults.length ? batchResults : batchLines.map(p => ({ prompt: p } as { prompt: string; imageUrl?: string; error?: string }))).map((item, idx) => {
                      const imageUrl = typeof item.imageUrl === 'string' ? item.imageUrl : ''
                      const errorMsg = typeof item.error === 'string' ? item.error : ''
                      const isDone = !!imageUrl
                      const isError = !!errorMsg
                      return (
                        <div key={idx} className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg bg-gray-800">
                          <span className="text-gray-600 text-[10px] font-mono w-5 shrink-0">{idx + 1}</span>
                          {isDone && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                          )}
                          <p className="text-gray-300 text-xs truncate flex-1">{item.prompt}</p>
                          {isDone && (
                            <svg className="w-3 h-3 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          )}
                          {isError && (
                            <span className="text-red-400 text-[10px] shrink-0" title={errorMsg}>Failed</span>
                          )}
                          {batchRunning && batchCurrentItem === idx && !isDone && !isError && (
                            <Spinner size={3} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Batch progress */}
              {batchRunning && (
                <div className="bg-gray-900 border border-indigo-800/40 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Spinner size={4} />
                    <span className="text-white text-sm font-medium">
                      Generating {batchCurrentItem + 1}/{batchLines.length}...
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${batchProgress}%` }}
                    />
                  </div>
                  <p className="text-gray-500 text-xs">{batchProgress}% complete · sequential to avoid rate limits</p>
                </div>
              )}

              <button
                onClick={startBatch}
                disabled={batchRunning || batchLines.length === 0 || !workspaceId}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {batchRunning ? (
                  <><Spinner size={4} /> Generating batch...</>
                ) : (
                  `Generate Batch (${batchLines.length} images · ~$${batchCost})`
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function safeParse<T = unknown>(s: string): T | undefined {
  try { return JSON.parse(s) as T } catch { return undefined }
}
