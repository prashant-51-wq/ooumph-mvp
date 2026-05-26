'use client'

import { useState, useEffect, useRef } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type MainTab = 'generate' | 'edit' | 'export'
type SidebarTab = 'myvideos' | 'templates' | 'stock'
type VideoStatus = 'Ready' | 'Generating' | 'Draft'

interface VideoProject {
  id: string
  name: string
  duration: string
  status: VideoStatus
  color: string
  model: string
  createdAt: string
}

interface TimelineClip {
  id: string
  start: number
  width: number
  color: string
  label: string
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_PROJECTS: VideoProject[] = [
  { id: '1', name: 'Product Launch Hero', duration: '0:30', status: 'Ready', color: 'bg-indigo-600', model: 'Kling 2.0', createdAt: '2h ago' },
  { id: '2', name: 'Social Media Reel', duration: '0:15', status: 'Ready', color: 'bg-violet-600', model: 'Runway Gen-3', createdAt: '5h ago' },
  { id: '3', name: 'Brand Intro', duration: '0:10', status: 'Generating', color: 'bg-fuchsia-600', model: 'Kling 2.0', createdAt: '12m ago' },
  { id: '4', name: 'Tutorial Draft', duration: '1:00', status: 'Draft', color: 'bg-cyan-700', model: 'Sora', createdAt: '1d ago' },
]

const VIDEO_MODELS = [
  { id: 'kling', name: 'Kling 2.0', speed: 'Fast', quality: '4K', color: 'from-indigo-500 to-blue-600' },
  { id: 'runway', name: 'Runway Gen-3', speed: 'Fast', quality: 'HD', color: 'from-emerald-500 to-teal-600' },
  { id: 'sora', name: 'Sora', speed: 'Slow', quality: '4K', color: 'from-orange-500 to-red-600' },
  { id: 'pika', name: 'Pika 2.0', speed: 'Fast', quality: 'HD', color: 'from-pink-500 to-rose-600' },
  { id: 'luma', name: 'Luma Dream', speed: 'Slow', quality: 'HD', color: 'from-purple-500 to-violet-600' },
]

const STYLE_PRESETS = ['Cinematic', 'Corporate', 'Social Media', 'Documentary', 'Animation', 'Product Demo', 'Vlog', 'Music Video']

const DURATION_OPTS = ['5s', '10s', '15s', '30s', '60s']
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

const VIDEO_HISTORY = [
  { id: 'h1', color: 'bg-indigo-800', label: 'V1 · 0:30' },
  { id: 'h2', color: 'bg-violet-800', label: 'V2 · 0:15' },
  { id: 'h3', color: 'bg-fuchsia-800', label: 'V3 · 0:10' },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: VideoStatus }) {
  const map: Record<VideoStatus, string> = {
    Ready: 'bg-emerald-900/50 text-emerald-400 border-emerald-800/50',
    Generating: 'bg-amber-900/50 text-amber-400 border-amber-800/50',
    Draft: 'bg-gray-800 text-gray-400 border-gray-700',
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

// ─── API Settings Slide-over ──────────────────────────────────────────────────

function ApiSettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [provider, setProvider] = useState('Kling')
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
          <h3 className="text-white font-semibold">Video API Settings</h3>
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
            {['Kling', 'Runway', 'Pika', 'Replicate', 'Luma'].map(p => (
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

// ─── Music Library Modal ───────────────────────────────────────────────────────

function MusicModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tracks = [
    { id: 'm1', name: 'Corporate Uplift', duration: '2:34', genre: 'Corporate' },
    { id: 'm2', name: 'Epic Cinematic', duration: '3:12', genre: 'Cinematic' },
    { id: 'm3', name: 'Social Bounce', duration: '1:45', genre: 'Upbeat' },
    { id: 'm4', name: 'Ambient Flow', duration: '4:00', genre: 'Ambient' },
    { id: 'm5', name: 'Tech Pulse', duration: '2:55', genre: 'Electronic' },
  ]
  const [selected, setSelected] = useState('')
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="text-white font-semibold">Music Library</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 space-y-2">
          {tracks.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-colors ${selected === t.id ? 'bg-indigo-600/20 border border-indigo-500/50' : 'bg-gray-800 hover:bg-gray-750 border border-transparent'}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-900/50 flex items-center justify-center text-indigo-400">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{t.name}</p>
                  <p className="text-gray-500 text-xs">{t.genre}</p>
                </div>
              </div>
              <span className="text-gray-500 text-xs">{t.duration}</span>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-gray-800 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">Cancel</button>
          <button
            onClick={onClose}
            disabled={!selected}
            className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >Add Track</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VideoGenPage() {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('myvideos')
  const [mainTab, setMainTab] = useState<MainTab>('generate')
  const [selectedProject, setSelectedProject] = useState<string>('1')
  const [apiPanelOpen, setApiPanelOpen] = useState(false)
  const [musicModalOpen, setMusicModalOpen] = useState(false)

  // Generate tab state
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState('kling')
  const [selectedStyle, setSelectedStyle] = useState('Cinematic')
  const [duration, setDuration] = useState('15s')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [resolution, setResolution] = useState('1080p')
  const [fps, setFps] = useState('24')
  const [scriptMode, setScriptMode] = useState(false)
  const [scriptText, setScriptText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState(0)
  const [genFrame, setGenFrame] = useState(0)
  const genTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Edit tab state
  const [overlayText, setOverlayText] = useState('')
  const [fontSize, setFontSize] = useState('32')
  const [textAnim, setTextAnim] = useState('Fade')
  const [colorGrade, setColorGrade] = useState('natural')
  const [trimStart, setTrimStart] = useState('0.0')
  const [trimEnd, setTrimEnd] = useState('15.0')
  const [playbackSpeed, setPlaybackSpeed] = useState('1x')

  // Export tab state
  const [exportFormat, setExportFormat] = useState('MP4')
  const [exportQuality, setExportQuality] = useState('HD (1080p)')
  const [compression, setCompression] = useState(7)
  const [watermark, setWatermark] = useState(false)
  const [watermarkText, setWatermarkText] = useState('')

  // Timeline / playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [playheadPos, setPlayheadPos] = useState(0)
  const [timelineZoom, setTimelineZoom] = useState(1)
  const playTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Right panel
  const [charLock, setCharLock] = useState(false)
  const [applyBrand, setApplyBrand] = useState(true)

  useEffect(() => {
    return () => {
      if (genTimerRef.current) clearInterval(genTimerRef.current)
      if (playTimerRef.current) clearInterval(playTimerRef.current)
    }
  }, [])

  // Playhead animation
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setPlayheadPos(p => {
          if (p >= 100) { setIsPlaying(false); return 0 }
          return p + 0.5
        })
      }, 50)
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current)
    }
    return () => { if (playTimerRef.current) clearInterval(playTimerRef.current) }
  }, [isPlaying])

  function startGeneration() {
    if (!prompt.trim() && !scriptMode) return
    setGenerating(true)
    setGenProgress(0)
    setGenFrame(0)
    const total = 480
    genTimerRef.current = setInterval(() => {
      setGenFrame(f => {
        const next = f + Math.floor(Math.random() * 8) + 3
        if (next >= total) {
          clearInterval(genTimerRef.current!)
          setGenerating(false)
          setGenProgress(100)
          return total
        }
        setGenProgress(Math.round((next / total) * 100))
        return next
      })
    }, 200)
  }

  const currentModel = VIDEO_MODELS.find(m => m.id === selectedModel)!

  // Timeline clips mock
  const videoClips: TimelineClip[] = [
    { id: 'v1', start: 0, width: 30, color: 'bg-indigo-600', label: 'Scene 1' },
    { id: 'v2', start: 32, width: 20, color: 'bg-violet-600', label: 'Scene 2' },
    { id: 'v3', start: 55, width: 25, color: 'bg-fuchsia-700', label: 'Scene 3' },
  ]
  const audioClips: TimelineClip[] = [
    { id: 'a1', start: 0, width: 80, color: 'bg-emerald-700', label: 'BGM' },
    { id: 'a2', start: 0, width: 55, color: 'bg-teal-700', label: 'Voiceover' },
  ]
  const captionClips: TimelineClip[] = [
    { id: 'c1', start: 5, width: 25, color: 'bg-amber-700', label: 'Title' },
    { id: 'c2', start: 35, width: 20, color: 'bg-yellow-700', label: 'Subtitle' },
  ]

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <ApiSettingsPanel open={apiPanelOpen} onClose={() => setApiPanelOpen(false)} />
      <MusicModal open={musicModalOpen} onClose={() => setMusicModalOpen(false)} />

      {/* ── LEFT SIDEBAR ── */}
      <div className="w-64 border-r border-gray-800 flex flex-col bg-gray-900 shrink-0">
        {/* Sidebar header */}
        <div className="p-4 border-b border-gray-800">
          <button className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
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
          {sidebarTab === 'myvideos' && MOCK_PROJECTS.map(proj => (
            <button
              key={proj.id}
              onClick={() => setSelectedProject(proj.id)}
              className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-colors ${selectedProject === proj.id ? 'bg-indigo-900/30 border border-indigo-700/40' : 'hover:bg-gray-800 border border-transparent'}`}
            >
              {/* Thumbnail */}
              <div className={`w-12 h-9 rounded-lg ${proj.color} shrink-0 flex items-center justify-center`}>
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

          {sidebarTab === 'templates' && (
            <div className="p-2 space-y-2">
              {['Product Launch', 'Brand Story', 'Tutorial', 'Testimonial', 'Ad Campaign', 'Event Recap'].map(t => (
                <button key={t} className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-gray-800 hover:bg-gray-750 text-left transition-colors border border-gray-700/50">
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
              {['Office Aerial', 'City Timelapse', 'Nature B-Roll', 'Tech Abstract', 'People Walking'].map((t, i) => (
                <button key={t} className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-gray-800 hover:bg-gray-750 text-left transition-colors border border-gray-700/50">
                  <div className={`w-10 h-8 rounded-lg flex items-center justify-center ${['bg-blue-800', 'bg-purple-800', 'bg-emerald-800', 'bg-cyan-800', 'bg-rose-800'][i]}`}>
                    <svg className="w-3 h-3 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                  <div>
                    <p className="text-gray-300 text-xs">{t}</p>
                    <p className="text-gray-600 text-[10px]">Free · HD</p>
                  </div>
                </button>
              ))}
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
            {(['generate', 'edit', 'export'] as MainTab[]).map(t => (
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
            {/* ─── VIDEO PREVIEW + TIMELINE ─── */}
            <div className="bg-gray-950 border-b border-gray-800">
              {/* Preview */}
              <div className="relative bg-black mx-4 mt-4 rounded-xl overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: '260px' }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  {generating ? (
                    <div className="text-center">
                      <Spinner size={8} />
                      <p className="text-gray-400 text-xs mt-3">Generating...</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-2">
                        <svg className="w-8 h-8 text-white/60" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                      <p className="text-gray-500 text-xs">Preview</p>
                    </div>
                  )}
                </div>
                {/* Play/Pause overlay */}
                <button
                  onClick={() => setIsPlaying(p => !p)}
                  className="absolute bottom-3 left-3 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                >
                  {isPlaying ? (
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  ) : (
                    <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  )}
                </button>
                {/* Timecode */}
                <div className="absolute bottom-3 left-14 bg-black/60 rounded px-2 py-0.5">
                  <span className="text-white text-xs font-mono">
                    {String(Math.floor(playheadPos * 0.15)).padStart(2, '0')}:{String(Math.round((playheadPos * 0.15 % 1) * 60)).padStart(2, '0')} / 0:15
                  </span>
                </div>
                {/* Fullscreen */}
                <button className="absolute bottom-3 right-3 w-8 h-8 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                </button>
              </div>

              {/* Timeline */}
              <div className="mx-4 mb-4 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-xs font-medium">Timeline</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setTimelineZoom(z => Math.max(0.5, z - 0.25))} className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 flex items-center justify-center text-sm transition-colors">−</button>
                    <span className="text-gray-500 text-xs w-8 text-center">{Math.round(timelineZoom * 100)}%</span>
                    <button onClick={() => setTimelineZoom(z => Math.min(2, z + 0.25))} className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 flex items-center justify-center text-sm transition-colors">+</button>
                  </div>
                </div>

                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  {/* Ruler */}
                  <div className="flex border-b border-gray-800 bg-gray-950 pl-16">
                    {[0, 5, 10, 15].map(s => (
                      <div key={s} className="flex-1 text-gray-600 text-[10px] py-1 pl-1 border-l border-gray-800 first:border-l-0">{s}s</div>
                    ))}
                  </div>

                  {/* Tracks */}
                  {[
                    { label: 'Video', clips: videoClips, color: 'text-indigo-400' },
                    { label: 'Audio', clips: audioClips, color: 'text-emerald-400' },
                    { label: 'Captions', clips: captionClips, color: 'text-amber-400' },
                  ].map(track => (
                    <div key={track.label} className="flex items-center border-b border-gray-800 last:border-b-0 h-9">
                      <div className="w-16 px-2 shrink-0">
                        <span className={`text-[10px] font-medium ${track.color}`}>{track.label}</span>
                      </div>
                      <div className="flex-1 relative h-full overflow-hidden">
                        {/* Playhead */}
                        <div
                          className="absolute top-0 bottom-0 w-px bg-red-500 z-10 pointer-events-none"
                          style={{ left: `${playheadPos}%` }}
                        />
                        {track.clips.map(clip => (
                          <div
                            key={clip.id}
                            className={`absolute top-1.5 bottom-1.5 rounded ${clip.color} opacity-80 hover:opacity-100 cursor-pointer flex items-center px-1.5`}
                            style={{ left: `${clip.start * timelineZoom}%`, width: `${clip.width * timelineZoom}%` }}
                          >
                            <span className="text-white text-[9px] font-medium truncate">{clip.label}</span>
                          </div>
                        ))}
                        <button className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-600 hover:text-gray-400 px-1 py-0.5 rounded bg-gray-800/50 hover:bg-gray-700/80 transition-colors">+ Add</button>
                      </div>
                    </div>
                  ))}
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
                  <div className="flex flex-wrap gap-2">
                    {VIDEO_MODELS.map(model => (
                      <button
                        key={model.id}
                        onClick={() => setSelectedModel(model.id)}
                        className={`relative px-3 py-2 rounded-xl border text-left transition-all ${selectedModel === model.id ? 'border-indigo-500 bg-indigo-900/30' : 'border-gray-700 bg-gray-900 hover:border-gray-600'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${selectedModel === model.id ? 'text-white' : 'text-gray-300'}`}>{model.name}</span>
                        </div>
                        <div className="flex gap-1.5 mt-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${model.speed === 'Fast' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-amber-900/50 text-amber-400'}`}>{model.speed}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-400 font-medium">{model.quality}</span>
                        </div>
                      </button>
                    ))}
                  </div>
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
                        >{d}</button>
                      ))}
                    </div>
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

                {/* Script-to-Video toggle */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">Script-to-Video</p>
                      <p className="text-gray-500 text-xs mt-0.5">Write a script and auto-generate scenes</p>
                    </div>
                    <button
                      onClick={() => setScriptMode(s => !s)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${scriptMode ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${scriptMode ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {scriptMode && (
                    <div className="mt-4 space-y-3">
                      <textarea
                        value={scriptText}
                        onChange={e => setScriptText(e.target.value)}
                        rows={4}
                        placeholder="Scene 1: Open on a sleek product on a studio surface...\nScene 2: Close-up reveal of the product logo..."
                        className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-xs focus:outline-none focus:border-indigo-500 resize-none"
                      />
                      <div className="bg-gray-800 rounded-lg p-3 space-y-1.5">
                        <p className="text-gray-400 text-xs font-medium">Scene Breakdown</p>
                        {['Scene 1 · 0:00–0:05 · Studio shot', 'Scene 2 · 0:05–0:10 · Product close-up', 'Scene 3 · 0:10–0:15 · CTA overlay'].map(scene => (
                          <div key={scene} className="flex items-center gap-2 text-xs text-gray-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                            {scene}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Generate button */}
                <button
                  onClick={startGeneration}
                  disabled={generating}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {generating ? <><Spinner size={4} /> Generating video...</> : (
                    <>
                      <span>Generate Video</span>
                      <span className="text-indigo-300 font-normal text-xs">~$0.45</span>
                    </>
                  )}
                </button>

                {/* Generation progress */}
                {generating && (
                  <div className="bg-gray-900 border border-indigo-800/40 rounded-xl p-4 animate-pulse-subtle">
                    <div className="flex items-center gap-2 mb-3">
                      <Spinner size={4} />
                      <span className="text-white text-sm font-medium">Generating...</span>
                    </div>
                    <p className="text-indigo-300 text-xs mb-2">
                      Frame {genFrame}/480 · Model: {currentModel.name} · ETA: {Math.max(0, Math.round(45 - (genProgress * 0.45)))}s
                    </p>
                    <div className="w-full bg-gray-800 rounded-full h-1.5">
                      <div
                        className="bg-indigo-500 h-1.5 rounded-full transition-all duration-200"
                        style={{ width: `${genProgress}%` }}
                      />
                    </div>
                    <p className="text-gray-600 text-[10px] mt-2">{genProgress}% complete · {resolution} · {aspectRatio} · {fps} FPS</p>
                  </div>
                )}
              </div>
            )}

            {/* ─── EDIT TAB ─── */}
            {mainTab === 'edit' && (
              <div className="p-4 space-y-5">
                {/* Text Overlay */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                  <p className="text-white text-sm font-medium">Text Overlay</p>
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
                  <label className="text-gray-400 text-xs mb-2 block">Color Grading</label>
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
                  <p className="text-white text-sm font-medium">Trim</p>
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

                {/* B-Roll + Music */}
                <div className="flex gap-3">
                  <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors border border-gray-700">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Add B-Roll
                  </button>
                  <button
                    onClick={() => setMusicModalOpen(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors border border-gray-700"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                    Add Music
                  </button>
                </div>
              </div>
            )}

            {/* ─── EXPORT TAB ─── */}
            {mainTab === 'export' && (
              <div className="p-4 space-y-5">
                {/* Format */}
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

                {/* Quality */}
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

                {/* Compression */}
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

                {/* Watermark */}
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

                {/* Export actions */}
                <div className="flex gap-3">
                  <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors border border-gray-700">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    Publish to Hub
                  </button>
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
                  className="w-full flex items-start gap-2 px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-750 text-left transition-colors border border-gray-700/50 group"
                >
                  <span className="text-indigo-400 mt-0.5 text-xs">✦</span>
                  <span className="text-gray-300 text-xs group-hover:text-white transition-colors">{s}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Video History */}
          <div>
            <p className="text-white text-sm font-medium mb-2">Version History</p>
            <div className="flex gap-2">
              {VIDEO_HISTORY.map(h => (
                <button
                  key={h.id}
                  className={`flex-1 aspect-video rounded-lg ${h.color} flex items-end p-1.5 hover:ring-2 ring-indigo-500 transition-all group`}
                >
                  <span className="text-white/70 text-[9px] bg-black/40 rounded px-1 py-0.5 group-hover:text-white transition-colors">{h.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-gray-800/60 rounded-xl p-4 space-y-2">
            <p className="text-white text-sm font-medium">This Month</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-white font-bold text-lg">24</p>
                <p className="text-gray-500 text-[10px]">Videos</p>
              </div>
              <div>
                <p className="text-white font-bold text-lg">8.4m</p>
                <p className="text-gray-500 text-[10px]">Duration</p>
              </div>
              <div>
                <p className="text-white font-bold text-lg">$12.80</p>
                <p className="text-gray-500 text-[10px]">Cost</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
