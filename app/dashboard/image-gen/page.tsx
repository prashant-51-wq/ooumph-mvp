'use client'

import { useState, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type StudioTab = 'studio' | 'gallery' | 'batch'

interface GalleryImage {
  id: string
  prompt: string
  model: string
  style: string
  size: string
  date: string
  color: string
  selected?: boolean
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_GALLERY: GalleryImage[] = [
  { id: 'g1', prompt: 'Corporate executive portrait, soft studio lighting, shallow depth of field', model: 'DALL-E 3', style: 'Photorealistic', size: '1024×1024', date: '2h ago', color: 'bg-gradient-to-br from-blue-800 to-indigo-900' },
  { id: 'g2', prompt: 'Minimalist product shot of wireless headphones on white surface, dramatic shadows', model: 'Midjourney v6', style: 'Product Photography', size: '1792×1024', date: '3h ago', color: 'bg-gradient-to-br from-gray-700 to-gray-900' },
  { id: 'g3', prompt: 'Vibrant brand identity logo mark, geometric abstract, indigo and violet palette', model: 'Ideogram v2', style: 'Logo Design', size: '1024×1024', date: '5h ago', color: 'bg-gradient-to-br from-indigo-700 to-violet-900' },
  { id: 'g4', prompt: 'Neon cyberpunk city at night, rain-slicked streets, holographic billboards', model: 'Flux Pro', style: 'Neon Cyberpunk', size: '1792×1024', date: '8h ago', color: 'bg-gradient-to-br from-purple-900 to-fuchsia-900' },
  { id: 'g5', prompt: 'Watercolor illustration of a coffee shop interior, warm tones, loose strokes', model: 'DALL-E 3', style: 'Watercolor', size: '1024×1024', date: '12h ago', color: 'bg-gradient-to-br from-amber-800 to-orange-900' },
  { id: 'g6', prompt: 'Clean infographic layout with data visualization elements, corporate style', model: 'Adobe Firefly', style: 'Infographic', size: '1024×1792', date: '1d ago', color: 'bg-gradient-to-br from-cyan-800 to-teal-900' },
  { id: 'g7', prompt: 'Luxury fashion editorial, model in avant-garde outfit, high contrast black and white', model: 'Midjourney v6', style: 'B&W', size: '1024×1792', date: '1d ago', color: 'bg-gradient-to-br from-gray-800 to-black' },
  { id: 'g8', prompt: '3D render of futuristic smartphone floating in space, product render style', model: 'Stable Diffusion XL', style: '3D Render', size: '1024×1024', date: '2d ago', color: 'bg-gradient-to-br from-blue-900 to-cyan-900' },
  { id: 'g9', prompt: 'Social media banner for tech startup, modern gradient, bold typography', model: 'Flux Pro', style: 'Social Media', size: '1792×1024', date: '2d ago', color: 'bg-gradient-to-br from-emerald-800 to-green-900' },
  { id: 'g10', prompt: 'Oil painting style portrait of a business executive, rich textures, gallery quality', model: 'Adobe Firefly', style: 'Oil Painting', size: '1024×1024', date: '3d ago', color: 'bg-gradient-to-br from-rose-900 to-pink-900' },
]

const IMAGE_MODELS = [
  { id: 'dalle3', name: 'DALL-E 3', specialty: 'Photorealistic', speedDot: 'bg-emerald-500' },
  { id: 'mj6', name: 'Midjourney v6', specialty: 'Artistic', speedDot: 'bg-amber-500' },
  { id: 'sdxl', name: 'Stable Diffusion XL', specialty: 'Versatile', speedDot: 'bg-emerald-500' },
  { id: 'ideogram', name: 'Ideogram v2', specialty: 'Logo & Brand', speedDot: 'bg-emerald-500' },
  { id: 'flux', name: 'Flux Pro', specialty: 'Photorealistic', speedDot: 'bg-emerald-500' },
  { id: 'firefly', name: 'Adobe Firefly', specialty: 'Corporate', speedDot: 'bg-amber-500' },
]

const STYLE_PRESETS = [
  'Photorealistic', 'Illustration', '3D Render', 'Watercolor', 'Oil Painting',
  'Minimalist', 'Neon Cyberpunk', 'Corporate Clean', 'Social Media', 'Logo Design',
  'Product Photography', 'Infographic',
]

const SIZE_OPTIONS = [
  { label: '512×512', value: '512×512', ratio: '1:1' },
  { label: '1024×1024', value: '1024×1024', ratio: '1:1' },
  { label: '1024×1792', value: '1024×1792', ratio: '9:16' },
  { label: '1792×1024', value: '1792×1024', ratio: '16:9' },
  { label: '2048×2048', value: '2048×2048', ratio: '1:1' },
]

const QUALITY_OPTIONS = ['Standard', 'HD', 'Ultra']
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
  const [provider, setProvider] = useState('DALL-E 3 (OpenAI)')
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
        <div>
          <label className="text-gray-400 text-xs mb-1.5 block">API Provider</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
          >
            {['DALL-E 3 (OpenAI)', 'Midjourney (Unofficial)', 'Replicate (SDXL/Flux)', 'Adobe Firefly', 'Ideogram API'].map(p => (
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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ImageGenPage() {
  const [studioTab, setStudioTab] = useState<StudioTab>('studio')
  const [apiPanelOpen, setApiPanelOpen] = useState(false)

  // Left panel state
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [showNegative, setShowNegative] = useState(false)
  const [selectedModel, setSelectedModel] = useState('dalle3')
  const [selectedStyle, setSelectedStyle] = useState('Photorealistic')
  const [selectedSize, setSelectedSize] = useState('1024×1024')
  const [quality, setQuality] = useState('HD')
  const [styleStrength, setStyleStrength] = useState(75)
  const [imageCount, setImageCount] = useState('1')
  const [seed, setSeed] = useState('')
  const [lighting, setLighting] = useState('Studio')
  const [applyBrandColors, setApplyBrandColors] = useState(false)
  const [logoPlacement, setLogoPlacement] = useState('None')
  const [safeMode, setSafeMode] = useState(true)
  const [promptLibOpen, setPromptLibOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState(0)

  // Studio tab state
  const [generatedImages, setGeneratedImages] = useState<{ color: string; prompt: string }[]>([])
  const [upscaling, setUpscaling] = useState<number | null>(null)
  const [upscaleProgress, setUpscaleProgress] = useState(0)
  const [showComparison, setShowComparison] = useState(false)
  const [compareSlider, setCompareSlider] = useState(50)
  const [editMode, setEditMode] = useState(false)
  const [brushSize, setBrushSize] = useState(20)
  const [hoveredImage, setHoveredImage] = useState<number | null>(null)

  // Gallery tab state
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>(MOCK_GALLERY)
  const [galleryFilter, setGalleryFilter] = useState<string>('All')
  const [gallerySearch, setGallerySearch] = useState('')
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<Set<string>>(new Set())

  // Batch tab state
  const [batchPrompts, setBatchPrompts] = useState('')
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [batchCurrentItem, setBatchCurrentItem] = useState(0)

  const COLORS = [
    'bg-gradient-to-br from-indigo-800 to-violet-900',
    'bg-gradient-to-br from-blue-800 to-cyan-900',
    'bg-gradient-to-br from-rose-800 to-pink-900',
    'bg-gradient-to-br from-amber-700 to-orange-900',
  ]

  function startGeneration() {
    if (!prompt.trim()) return
    setGenerating(true)
    setGenProgress(0)
    const count = parseInt(imageCount)
    let prog = 0
    const interval = setInterval(() => {
      prog += Math.random() * 12 + 5
      if (prog >= 100) {
        prog = 100
        setGenProgress(100)
        clearInterval(interval)
        setGenerating(false)
        setGeneratedImages(Array.from({ length: count }, (_, i) => ({
          color: COLORS[i % COLORS.length],
          prompt,
        })))
        setStudioTab('studio')
      } else {
        setGenProgress(Math.round(prog))
      }
    }, 200)
  }

  function enhancePrompt() {
    if (!prompt.trim()) return
    setPrompt(prompt + ', ultra-detailed, professional photography, 8k resolution, award-winning composition, dramatic lighting, sharp focus, high contrast')
  }

  function startUpscale(idx: number) {
    setUpscaling(idx)
    setUpscaleProgress(0)
    const interval = setInterval(() => {
      setUpscaleProgress(p => {
        if (p >= 100) {
          clearInterval(interval)
          setUpscaling(null)
          setShowComparison(true)
          return 100
        }
        return p + 8
      })
    }, 150)
  }

  function toggleGallerySelect(id: string) {
    setSelectedGalleryIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startBatch() {
    const lines = batchPrompts.split('\n').filter(l => l.trim())
    if (!lines.length) return
    setBatchRunning(true)
    setBatchProgress(0)
    setBatchCurrentItem(0)
    let item = 0
    const interval = setInterval(() => {
      item += 1
      setBatchCurrentItem(item)
      setBatchProgress(Math.round((item / lines.length) * 100))
      if (item >= lines.length) {
        clearInterval(interval)
        setBatchRunning(false)
      }
    }, 800)
  }

  const filteredGallery = galleryImages.filter(img => {
    const matchesFilter = galleryFilter === 'All' || img.model === galleryFilter || img.style === galleryFilter
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
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-900/40 border border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 text-xs font-medium">847 credits</span>
            </div>
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
                    key={q}
                    onClick={() => setQuality(q)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${quality === q ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >{q}</button>
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
              disabled={generating || !prompt.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {generating ? (
                <><Spinner size={4} /> Generating...</>
              ) : (
                <>
                  <span>Generate</span>
                  <span className="text-indigo-300 font-normal text-xs">~$0.04 per image</span>
                </>
              )}
            </button>
            {generating && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-400 text-xs">Generating image{parseInt(imageCount) > 1 ? 's' : ''}...</span>
                  <span className="text-gray-400 text-xs">{genProgress}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all duration-200"
                    style={{ width: `${genProgress}%` }}
                  />
                </div>
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
              {t === 'gallery' && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 text-[10px]">{galleryImages.length}</span>}
            </button>
          ))}
        </div>

        {/* ─── STUDIO TAB ─── */}
        {studioTab === 'studio' && (
          <div className="flex-1 overflow-y-auto p-5">
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
                {/* Generated images grid */}
                <div className={`grid gap-4 ${generatedImages.length === 1 ? 'grid-cols-1 max-w-xl' : generatedImages.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                  {generatedImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative rounded-2xl overflow-hidden group cursor-pointer"
                      style={{ aspectRatio: '1' }}
                      onMouseEnter={() => setHoveredImage(idx)}
                      onMouseLeave={() => setHoveredImage(null)}
                    >
                      <div className={`absolute inset-0 ${img.color}`} />
                      {/* Prompt overlay at bottom */}
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                        <p className="text-white text-xs line-clamp-2 leading-relaxed">{img.prompt}</p>
                      </div>
                      {/* Hover actions */}
                      {hoveredImage === idx && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 flex-wrap p-4">
                          <button className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium backdrop-blur-sm transition-colors flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Download
                          </button>
                          <button className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium backdrop-blur-sm transition-colors flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            Edit
                          </button>
                          <button
                            onClick={() => startUpscale(idx)}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-medium backdrop-blur-sm transition-colors flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5" /></svg>
                            Upscale 4×
                          </button>
                          <button className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium backdrop-blur-sm transition-colors flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Variations
                          </button>
                          <button className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium backdrop-blur-sm transition-colors">
                            Copy Prompt
                          </button>
                          <button className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium backdrop-blur-sm transition-colors">
                            + Library
                          </button>
                        </div>
                      )}
                      {/* Upscale progress */}
                      {upscaling === idx && (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                          <Spinner size={8} />
                          <p className="text-white text-xs">Upscaling... {upscaleProgress}%</p>
                          <div className="w-32 bg-gray-800 rounded-full h-1">
                            <div className="bg-indigo-500 h-1 rounded-full transition-all" style={{ width: `${upscaleProgress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Before/After comparison */}
                {showComparison && (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-white text-sm font-medium">Before / After Upscale</p>
                      <button onClick={() => setShowComparison(false)} className="text-gray-500 hover:text-white text-xs">Dismiss</button>
                    </div>
                    <div className="relative rounded-xl overflow-hidden h-48 bg-gray-800">
                      <div className={`absolute inset-0 ${generatedImages[0]?.color}`} />
                      <div
                        className="absolute inset-y-0 right-0 bg-gradient-to-br from-indigo-900 to-violet-900"
                        style={{ left: `${compareSlider}%` }}
                      />
                      <div className="absolute inset-y-0 flex items-center" style={{ left: `calc(${compareSlider}% - 1px)` }}>
                        <div className="w-0.5 h-full bg-white" />
                        <div className="absolute w-6 h-6 rounded-full bg-white shadow-lg flex items-center justify-center -translate-x-3 cursor-col-resize">
                          <svg className="w-3 h-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                        </div>
                      </div>
                      <div className="absolute top-2 left-2 bg-black/60 rounded px-1.5 py-0.5 text-[10px] text-white">Original</div>
                      <div className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 text-[10px] text-white">4× Upscaled</div>
                    </div>
                    <input type="range" min={5} max={95} value={compareSlider} onChange={e => setCompareSlider(Number(e.target.value))} className="w-full accent-indigo-500" />
                  </div>
                )}

                {/* Edit overlay */}
                {editMode && (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-white text-sm font-medium">Edit Canvas</p>
                      <button onClick={() => setEditMode(false)} className="text-gray-500 hover:text-white text-xs">Close</button>
                    </div>
                    <div className="flex gap-2">
                      {['Erase', 'Inpaint', 'Outpaint'].map(tool => (
                        <button key={tool} className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">{tool}</button>
                      ))}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-gray-500 text-xs">Brush Size</label>
                        <span className="text-gray-500 text-xs">{brushSize}px</span>
                      </div>
                      <input type="range" min={5} max={100} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-full accent-indigo-500" />
                    </div>
                    <div className="h-40 rounded-xl bg-gray-800 border border-dashed border-gray-700 flex items-center justify-center">
                      <p className="text-gray-600 text-xs">Canvas — paint to mask area for regeneration</p>
                    </div>
                    <button className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
                      Regenerate Selection
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setEditMode(e => !e)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  {editMode ? 'Close Editor' : 'Open Edit Canvas'}
                </button>
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
              <div className="flex gap-1.5 flex-wrap">
                {['All', 'DALL-E 3', 'Midjourney v6', 'Flux Pro'].map(f => (
                  <button
                    key={f}
                    onClick={() => setGalleryFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${galleryFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'}`}
                  >{f}</button>
                ))}
              </div>
            </div>

            {/* Multi-select actions */}
            {selectedGalleryIds.size > 0 && (
              <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-indigo-900/30 border border-indigo-800/50">
                <span className="text-indigo-300 text-xs font-medium">{selectedGalleryIds.size} selected</span>
                <div className="flex gap-2 ml-auto">
                  <button className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">Batch Download</button>
                  <button className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">Add to Library</button>
                  <button className="px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-900 text-red-400 text-xs transition-colors">Delete</button>
                </div>
              </div>
            )}

            {/* Masonry grid */}
            <div className="columns-2 md:columns-3 gap-3 space-y-3">
              {filteredGallery.map((img, idx) => (
                <div
                  key={img.id}
                  className="break-inside-avoid relative rounded-xl overflow-hidden group cursor-pointer"
                  style={{ aspectRatio: idx % 3 === 0 ? '1' : idx % 3 === 1 ? '16/9' : '9/16' }}
                >
                  <div className={`absolute inset-0 ${img.color}`} />
                  {/* Checkbox */}
                  <div
                    className={`absolute top-2 left-2 w-5 h-5 rounded border-2 transition-all cursor-pointer z-10 flex items-center justify-center ${selectedGalleryIds.has(img.id) ? 'border-indigo-500 bg-indigo-600' : 'border-white/40 bg-black/20 opacity-0 group-hover:opacity-100'}`}
                    onClick={e => { e.stopPropagation(); toggleGallerySelect(img.id) }}
                  >
                    {selectedGalleryIds.has(img.id) && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    )}
                  </div>
                  {/* Hover info */}
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
                <p className="text-gray-600 text-xs mt-1">Or upload a CSV file</p>
              </div>

              {/* Preview */}
              {batchLines.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-white text-sm font-medium">Batch Preview</p>
                    <span className="text-gray-400 text-xs">{batchLines.length} prompts · ~${batchCost}</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {batchLines.map((line, idx) => (
                      <div key={idx} className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg bg-gray-800">
                        <span className="text-gray-600 text-[10px] font-mono w-5 shrink-0">{idx + 1}</span>
                        <p className="text-gray-300 text-xs truncate">{line}</p>
                        {batchRunning && batchCurrentItem > idx && (
                          <svg className="w-3 h-3 text-emerald-400 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        )}
                        {batchRunning && batchCurrentItem === idx && (
                          <Spinner size={3} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Batch progress */}
              {batchRunning && (
                <div className="bg-gray-900 border border-indigo-800/40 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Spinner size={4} />
                    <span className="text-white text-sm font-medium">
                      Generating {batchCurrentItem}/{batchLines.length}...
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${batchProgress}%` }}
                    />
                  </div>
                  <p className="text-gray-500 text-xs">{batchProgress}% complete</p>
                </div>
              )}

              <button
                onClick={startBatch}
                disabled={batchRunning || batchLines.length === 0}
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
