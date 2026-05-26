'use client'

import { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type VoiceTab = 'ai' | 'cloned' | 'stock'
type RightTab = 'editor' | 'history'
type EQPreset = 'Voice Clarity' | 'Broadcast' | 'Podcast' | 'Telephone'
type ExportFormat = 'MP3' | 'WAV' | 'AAC' | 'OGG' | 'FLAC'
type EmotionPreset = 'Neutral' | 'Excited' | 'Professional' | 'Warm' | 'Authoritative' | 'Conversational'

interface VoiceModel {
  id: string
  name: string
  language: string
  accent: string
  gender: 'Male' | 'Female' | 'Neutral'
  provider: 'ElevenLabs' | 'OpenAI' | 'PlayHT' | 'Murf'
  quality: number
}

interface Track {
  id: string
  label: string
  color: string
  volume: number
  muted: boolean
  solo: boolean
  hasContent: boolean
}

interface GenerationRecord {
  id: string
  scriptPreview: string
  voiceName: string
  duration: string
  date: string
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const AI_VOICES: VoiceModel[] = [
  { id: 'v1', name: 'Aria', language: 'English', accent: 'US', gender: 'Female', provider: 'ElevenLabs', quality: 5 },
  { id: 'v2', name: 'Marcus', language: 'English', accent: 'UK', gender: 'Male', provider: 'OpenAI', quality: 4 },
  { id: 'v3', name: 'Luna', language: 'English', accent: 'Australian', gender: 'Female', provider: 'PlayHT', quality: 5 },
  { id: 'v4', name: 'Kai', language: 'English', accent: 'US', gender: 'Male', provider: 'ElevenLabs', quality: 4 },
  { id: 'v5', name: 'Sofia', language: 'Spanish', accent: 'Castilian', gender: 'Female', provider: 'Murf', quality: 4 },
  { id: 'v6', name: 'Jin', language: 'Korean', accent: 'Seoul', gender: 'Male', provider: 'PlayHT', quality: 3 },
  { id: 'v7', name: 'Zara', language: 'English', accent: 'Nigerian', gender: 'Female', provider: 'ElevenLabs', quality: 4 },
  { id: 'v8', name: 'David', language: 'English', accent: 'British Formal', gender: 'Male', provider: 'OpenAI', quality: 5 },
]

const CLONED_VOICES: VoiceModel[] = [
  { id: 'c1', name: 'My Voice Clone', language: 'English', accent: 'US', gender: 'Male', provider: 'ElevenLabs', quality: 5 },
]

const STOCK_VOICES: VoiceModel[] = [
  { id: 's1', name: 'Narrator Classic', language: 'English', accent: 'US', gender: 'Neutral', provider: 'Murf', quality: 3 },
  { id: 's2', name: 'News Reader', language: 'English', accent: 'US', gender: 'Male', provider: 'OpenAI', quality: 3 },
]

const MUSIC_CATEGORIES = ['Corporate', 'Energetic', 'Calm', 'Podcast', 'Cinematic']

const MOCK_HISTORY: GenerationRecord[] = [
  { id: 'h1', scriptPreview: 'Welcome to Ooumph, the AI-powered marketing platform...', voiceName: 'Aria', duration: '0:42', date: '2026-05-25' },
  { id: 'h2', scriptPreview: 'This quarter our team achieved record-breaking results in...', voiceName: 'David', duration: '1:15', date: '2026-05-24' },
  { id: 'h3', scriptPreview: 'Introducing the all-new feature set that will transform...', voiceName: 'Marcus', duration: '2:08', date: '2026-05-23' },
  { id: 'h4', scriptPreview: 'Thank you for joining us today. In this tutorial we will...', voiceName: 'Luna', duration: '3:21', date: '2026-05-22' },
]

const PROVIDER_COLORS: Record<string, string> = {
  ElevenLabs: 'bg-purple-900/60 text-purple-300 border-purple-800/60',
  OpenAI: 'bg-emerald-900/60 text-emerald-300 border-emerald-800/60',
  PlayHT: 'bg-blue-900/60 text-blue-300 border-blue-800/60',
  Murf: 'bg-orange-900/60 text-orange-300 border-orange-800/60',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function QualityDots({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < count ? 'bg-indigo-400' : 'bg-gray-700'}`} />
      ))}
    </span>
  )
}

function SliderRow({
  label, value, min, max, step, onChange, displayValue,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; displayValue?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-400 text-xs">{label}</span>
        <span className="text-gray-500 text-xs font-mono">{displayValue ?? value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500 h-1"
      />
    </div>
  )
}

// ─── Waveform visualization ───────────────────────────────────────────────────

function Waveform({ playing }: { playing: boolean }) {
  const bars = Array.from({ length: 80 }, (_, i) => {
    const base = 20 + Math.sin(i * 0.4) * 15 + Math.cos(i * 0.7) * 10 + Math.random() * 20
    return Math.max(4, Math.min(80, base))
  })
  return (
    <div className="flex items-center gap-px h-16 overflow-hidden">
      {bars.map((h, i) => (
        <div
          key={i}
          style={{ height: `${h}%` }}
          className={`flex-1 rounded-sm transition-all ${
            playing ? 'bg-indigo-500 animate-pulse' : 'bg-indigo-600/60'
          } ${i < 30 ? 'bg-emerald-500/70' : ''}`}
        />
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VoiceoverStudioPage() {
  const [voiceTab, setVoiceTab] = useState<VoiceTab>('ai')
  const [rightTab, setRightTab] = useState<RightTab>('editor')
  const [script, setScript] = useState('')
  const [autoSplit, setAutoSplit] = useState(false)
  const [selectedVoiceId, setSelectedVoiceId] = useState('v1')
  const [voiceSearch, setVoiceSearch] = useState('')
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)

  // Voice settings
  const [speed, setSpeed] = useState(1.0)
  const [pitch, setPitch] = useState(0)
  const [volume, setVolume] = useState(80)
  const [stability, setStability] = useState(65)
  const [clarity, setClarity] = useState(75)
  const [styleExag, setStyleExag] = useState(30)
  const [emotion, setEmotion] = useState<EmotionPreset>('Professional')

  // Music
  const [addMusic, setAddMusic] = useState(false)
  const [musicCategory, setMusicCategory] = useState('Corporate')
  const [musicVol, setMusicVol] = useState(20)
  const [fadeIn, setFadeIn] = useState(true)
  const [fadeOut, setFadeOut] = useState(true)

  // Transport / waveform
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalTime] = useState(134) // 2m14s mock
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Tracks
  const [tracks, setTracks] = useState<Track[]>([
    { id: 't1', label: 'Voiceover', color: 'bg-indigo-500', volume: 80, muted: false, solo: false, hasContent: true },
    { id: 't2', label: 'Background Music', color: 'bg-emerald-500', volume: 20, muted: false, solo: false, hasContent: false },
    { id: 't3', label: 'SFX / Sounds', color: 'bg-amber-500', volume: 60, muted: false, solo: false, hasContent: false },
  ])

  // Export
  const [exportFormat, setExportFormat] = useState<ExportFormat>('MP3')
  const [bitrate, setBitrate] = useState('320')
  const [sampleRate, setSampleRate] = useState('44.1kHz')

  // EQ
  const [eqPreset, setEqPreset] = useState<EQPreset>('Voice Clarity')

  // Generating state
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  // API slide-over
  const [showApiPanel, setShowApiPanel] = useState(false)
  const [apiProvider, setApiProvider] = useState('ElevenLabs')
  const [apiKey, setApiKey] = useState('')
  const [apiTesting, setApiTesting] = useState(false)
  const [apiTestResult, setApiTestResult] = useState<'ok' | 'fail' | null>(null)

  // Clone modal
  const [showCloneModal, setShowCloneModal] = useState(false)

  // ── derived ────────────────────────────────────────────────────────────────
  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0
  const charCount = script.length
  const estCost = (charCount * 0.000015).toFixed(4)
  const estDuration = wordCount > 0 ? `~${Math.floor((wordCount / 150) * 60 / 60)}m ${Math.round((wordCount / 150) * 60 % 60)}s at normal speed` : '—'

  const voiceListForTab = voiceTab === 'ai' ? AI_VOICES : voiceTab === 'cloned' ? CLONED_VOICES : STOCK_VOICES
  const filteredVoices = voiceListForTab.filter(v =>
    v.name.toLowerCase().includes(voiceSearch.toLowerCase()) ||
    v.language.toLowerCase().includes(voiceSearch.toLowerCase())
  )
  const selectedVoice = [...AI_VOICES, ...CLONED_VOICES, ...STOCK_VOICES].find(v => v.id === selectedVoiceId)

  // SSML insert
  function insertSSML(tag: string) {
    const snippets: Record<string, string> = {
      Pause: '<break time="500ms"/>',
      Emphasis: '<emphasis level="strong">text</emphasis>',
      Speed: '<prosody rate="slow">text</prosody>',
      Pitch: '<prosody pitch="+5st">text</prosody>',
      Break: '<break strength="strong"/>',
    }
    setScript(s => s + snippets[tag])
  }

  // Transport play/pause
  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => {
        setCurrentTime(t => {
          if (t >= totalTime) { setPlaying(false); return 0 }
          return t + 1
        })
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [playing, totalTime])

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  async function handlePreview(voiceId: string) {
    setPreviewingId(voiceId)
    setPreviewing(true)
    await new Promise(r => setTimeout(r, 1200))
    setPreviewing(false)
    setPreviewingId(null)
  }

  async function handleGenerate() {
    if (!script.trim()) return
    setGenerating(true)
    await new Promise(r => setTimeout(r, 2200))
    setGenerating(false)
    setGenerated(true)
    setTracks(prev => prev.map(t => t.id === 't1' ? { ...t, hasContent: true } : t))
  }

  function toggleMute(id: string) {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, muted: !t.muted } : t))
  }
  function toggleSolo(id: string) {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, solo: !t.solo } : t))
  }
  function setTrackVolume(id: string, v: number) {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, volume: v } : t))
  }

  const speedPresets = [{ label: 'Slow', v: 0.75 }, { label: 'Normal', v: 1.0 }, { label: 'Fast', v: 1.25 }, { label: 'Presentation', v: 0.9 }]
  const emotions: EmotionPreset[] = ['Neutral', 'Excited', 'Professional', 'Warm', 'Authoritative', 'Conversational']
  const eqPresets: EQPreset[] = ['Voice Clarity', 'Broadcast', 'Podcast', 'Telephone']
  const formats: ExportFormat[] = ['MP3', 'WAV', 'AAC', 'OGG', 'FLAC']

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm">
            🎙
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-none">Voiceover Studio</h1>
            <p className="text-gray-500 text-xs mt-0.5">Professional AI voice production</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full bg-emerald-900/40 border border-emerald-800/50 text-emerald-400 text-xs font-medium">
            2,840 credits remaining
          </span>
          <button
            onClick={() => setShowApiPanel(true)}
            className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 transition-colors"
            title="API Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Body: Left + Right panels ────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 border-r border-gray-800 overflow-y-auto flex flex-col gap-0">

          {/* Script Editor */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-white text-sm font-semibold">Script</h2>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">{wordCount} words</span>
                <span className="text-gray-700">·</span>
                <span className="text-gray-500">{estDuration}</span>
              </div>
            </div>

            {/* SSML toolbar */}
            <div className="flex flex-wrap gap-1 mb-2">
              {['Pause', 'Emphasis', 'Speed', 'Pitch', 'Break'].map(tag => (
                <button
                  key={tag}
                  onClick={() => insertSSML(tag)}
                  className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs border border-gray-700 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>

            <textarea
              value={script}
              onChange={e => setScript(e.target.value)}
              rows={7}
              placeholder="Paste your script here..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
            />

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoSplit(v => !v)}
                  className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${autoSplit ? 'bg-indigo-600' : 'bg-gray-700'}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${autoSplit ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-gray-500 text-xs">Auto-split by paragraph</span>
              </div>
              <span className="text-gray-600 text-xs">~${estCost} · {charCount} chars</span>
            </div>
          </div>

          {/* Voice Selector */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white text-sm font-semibold">Voice</h2>
            </div>

            <input
              value={voiceSearch}
              onChange={e => setVoiceSearch(e.target.value)}
              placeholder="Search voices..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-indigo-500 mb-3"
            />

            {/* Voice tabs */}
            <div className="flex gap-1 mb-3">
              {(['ai', 'cloned', 'stock'] as VoiceTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setVoiceTab(t)}
                  className={`flex-1 py-1 rounded text-xs font-medium transition-colors capitalize ${voiceTab === t ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}
                >
                  {t === 'ai' ? 'AI Voices' : t === 'cloned' ? 'Cloned' : 'Stock'}
                </button>
              ))}
            </div>

            {/* Voice cards */}
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {filteredVoices.map(voice => (
                <div
                  key={voice.id}
                  onClick={() => setSelectedVoiceId(voice.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                    selectedVoiceId === voice.id
                      ? 'bg-indigo-950/60 border-indigo-600/60'
                      : 'bg-gray-800/40 border-gray-700/50 hover:border-gray-600'
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs text-white font-bold flex-shrink-0">
                    {voice.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-white text-xs font-medium">{voice.name}</span>
                      <span className="text-gray-500 text-xs">{voice.accent}</span>
                      <span className={`px-1.5 py-px rounded text-xs border ${PROVIDER_COLORS[voice.provider]}`}>
                        {voice.provider}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-gray-600 text-xs">{voice.gender}</span>
                      <QualityDots count={voice.quality} />
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handlePreview(voice.id) }}
                    disabled={previewing}
                    className="px-1.5 py-1 rounded bg-gray-700 hover:bg-indigo-600 text-gray-400 hover:text-white text-xs transition-colors flex-shrink-0"
                  >
                    {previewingId === voice.id && previewing ? '...' : '▶'}
                  </button>
                </div>
              ))}
              {filteredVoices.length === 0 && (
                <p className="text-gray-600 text-xs text-center py-3">No voices match your search</p>
              )}
            </div>

            {voiceTab === 'cloned' && (
              <button
                onClick={() => setShowCloneModal(true)}
                className="mt-3 w-full py-2 rounded-lg border border-dashed border-gray-700 text-gray-500 hover:text-white hover:border-gray-500 text-xs transition-colors"
              >
                + Clone a Voice
              </button>
            )}
          </div>

          {/* Voice Settings */}
          <div className="p-4 border-b border-gray-800 space-y-3">
            <h2 className="text-white text-sm font-semibold">Voice Settings</h2>

            {/* Speed with presets */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-400 text-xs">Speed</span>
                <span className="text-gray-500 text-xs font-mono">{speed.toFixed(2)}×</span>
              </div>
              <input type="range" min={0.5} max={2.0} step={0.05} value={speed}
                onChange={e => setSpeed(Number(e.target.value))}
                className="w-full accent-indigo-500 h-1 mb-1.5"
              />
              <div className="flex gap-1">
                {speedPresets.map(p => (
                  <button key={p.label} onClick={() => setSpeed(p.v)}
                    className={`flex-1 py-0.5 rounded text-xs transition-colors ${Math.abs(speed - p.v) < 0.01 ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <SliderRow label="Pitch" value={pitch} min={-50} max={50} step={1} onChange={setPitch} displayValue={`${pitch > 0 ? '+' : ''}${pitch}%`} />
            <SliderRow label="Volume" value={volume} min={0} max={100} step={1} onChange={setVolume} displayValue={`${volume}%`} />
            <SliderRow label="Stability" value={stability} min={0} max={100} step={1} onChange={setStability} displayValue={`${stability}%`} />
            <SliderRow label="Clarity" value={clarity} min={0} max={100} step={1} onChange={setClarity} displayValue={`${clarity}%`} />
            <SliderRow label="Style exaggeration" value={styleExag} min={0} max={100} step={1} onChange={setStyleExag} displayValue={`${styleExag}%`} />

            {/* Emotion presets */}
            <div>
              <span className="text-gray-400 text-xs block mb-1.5">Emotion</span>
              <div className="flex flex-wrap gap-1">
                {emotions.map(e => (
                  <button
                    key={e}
                    onClick={() => setEmotion(e)}
                    className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${emotion === e ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Background Music */}
          <div className="p-4 border-b border-gray-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-white text-sm font-semibold">Background Music</h2>
              <button
                onClick={() => setAddMusic(v => !v)}
                className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${addMusic ? 'bg-indigo-600' : 'bg-gray-700'}`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${addMusic ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {addMusic && (
              <>
                <div className="flex flex-wrap gap-1">
                  {MUSIC_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setMusicCategory(cat)}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${musicCategory === cat ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-400 text-xs">Mix — Voice {100 - musicVol}% / Music {musicVol}%</span>
                  </div>
                  <input type="range" min={5} max={50} step={5} value={musicVol}
                    onChange={e => setMusicVol(Number(e.target.value))}
                    className="w-full accent-indigo-500 h-1"
                  />
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={fadeIn} onChange={e => setFadeIn(e.target.checked)} className="accent-indigo-500 w-3 h-3" />
                    <span className="text-gray-400 text-xs">Fade in</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={fadeOut} onChange={e => setFadeOut(e.target.checked)} className="accent-indigo-500 w-3 h-3" />
                    <span className="text-gray-400 text-xs">Fade out</span>
                  </label>
                </div>
              </>
            )}
          </div>

          {/* Generate button */}
          <div className="p-4">
            <button
              onClick={handleGenerate}
              disabled={generating || !script.trim()}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  🎙 Generate Voiceover
                  {charCount > 0 && <span className="text-indigo-300 font-normal text-xs">(~${estCost})</span>}
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Right tab bar */}
          <div className="flex border-b border-gray-800 flex-shrink-0 px-4">
            {(['editor', 'history'] as RightTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${rightTab === tab ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
              >
                {tab === 'editor' ? 'Audio Editor' : 'Generation History'}
              </button>
            ))}
          </div>

          {rightTab === 'editor' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Waveform Section */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white text-sm font-semibold">Waveform</span>
                  <div className="flex items-center gap-2">
                    {/* Volume meter */}
                    <div className="flex items-end gap-px h-5">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          style={{ height: `${playing ? 20 + Math.random() * 80 : 30}%` }}
                          className={`w-1.5 rounded-sm transition-all ${playing ? 'bg-emerald-400 animate-pulse' : 'bg-gray-700'}`}
                        />
                      ))}
                    </div>
                    <span className="text-gray-500 text-xs font-mono">{formatTime(currentTime)} / {formatTime(totalTime)}</span>
                  </div>
                </div>

                {/* Timeline ruler */}
                <div className="flex justify-between mb-1 px-1">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <span key={i} className="text-gray-700 text-xs font-mono">{formatTime(Math.round(i * totalTime / 8))}</span>
                  ))}
                </div>

                {/* Waveform visual */}
                <div className="relative bg-gray-800 rounded-lg p-3 mb-3">
                  <Waveform playing={playing} />
                  {/* Playhead */}
                  <div
                    className="absolute top-2 bottom-2 w-0.5 bg-white/80 pointer-events-none"
                    style={{ left: `${(currentTime / totalTime) * 100}%` }}
                  />
                </div>

                {/* Transport controls */}
                <div className="flex items-center justify-center gap-3">
                  <button onClick={() => setCurrentTime(0)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm transition-colors">⏮</button>
                  <button onClick={() => setCurrentTime(t => Math.max(0, t - 10))} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm transition-colors">⏪</button>
                  <button onClick={() => setPlaying(v => !v)} className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-base transition-colors">
                    {playing ? '⏸' : '▶'}
                  </button>
                  <button onClick={() => setCurrentTime(t => Math.min(totalTime, t + 10))} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm transition-colors">⏩</button>
                  <button onClick={() => setCurrentTime(totalTime)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm transition-colors">⏭</button>
                </div>

                {generated && (
                  <div className="mt-3 p-2 rounded-lg bg-emerald-950/30 border border-emerald-800/40 flex items-center gap-2">
                    <span className="text-emerald-400 text-xs">Voiceover generated</span>
                    <span className="text-gray-600 text-xs">·</span>
                    <span className="text-gray-500 text-xs">{selectedVoice?.name} · {emotion} · {speed.toFixed(1)}×</span>
                  </div>
                )}
              </div>

              {/* Audio Tracks */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white text-sm font-semibold">Audio Tracks</h3>
                  <button
                    onClick={() => setTracks(prev => [...prev, { id: `t${Date.now()}`, label: 'New Track', color: 'bg-pink-500', volume: 60, muted: false, solo: false, hasContent: false }])}
                    className="px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs transition-colors"
                  >
                    + Add Track
                  </button>
                </div>
                <div className="space-y-2">
                  {tracks.map(track => (
                    <div key={track.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${track.muted ? 'border-gray-800 opacity-50' : 'border-gray-700/50'} bg-gray-800/30`}>
                      <div className={`w-2 h-10 rounded-full flex-shrink-0 ${track.color}`} />
                      <span className="text-gray-300 text-xs font-medium w-28 flex-shrink-0 truncate">{track.label}</span>

                      {/* Mini waveform clip */}
                      <div className="flex-1 h-8 rounded bg-gray-800 flex items-center px-2 overflow-hidden">
                        {track.hasContent ? (
                          <div className="flex items-center gap-px w-full h-full">
                            {Array.from({ length: 30 }).map((_, i) => (
                              <div key={i} style={{ height: `${20 + Math.sin(i * 0.8) * 35 + 15}%` }}
                                className={`flex-1 rounded-sm ${track.color} opacity-70`} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-700 text-xs">Empty</span>
                        )}
                      </div>

                      {/* Volume */}
                      <input type="range" min={0} max={100} step={5} value={track.volume}
                        onChange={e => setTrackVolume(track.id, Number(e.target.value))}
                        className="w-16 accent-indigo-500 h-1 flex-shrink-0"
                      />
                      <span className="text-gray-600 text-xs w-6 text-right">{track.volume}</span>

                      <button onClick={() => toggleMute(track.id)}
                        className={`px-1.5 py-0.5 rounded text-xs font-bold transition-colors ${track.muted ? 'bg-red-900/60 text-red-400' : 'bg-gray-700 text-gray-500 hover:text-white'}`}>
                        M
                      </button>
                      <button onClick={() => toggleSolo(track.id)}
                        className={`px-1.5 py-0.5 rounded text-xs font-bold transition-colors ${track.solo ? 'bg-yellow-900/60 text-yellow-400' : 'bg-gray-700 text-gray-500 hover:text-white'}`}>
                        S
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Edit Tools */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-white text-sm font-semibold mb-3">Edit Tools</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">
                    <span>✂</span> Trim clip
                  </button>
                  <button className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">
                    <span>|</span> Split at playhead
                  </button>
                  <button className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">
                    <span>📉</span> Noise reduction
                  </button>
                  <button className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">
                    <span>⚡</span> Normalize audio
                  </button>
                </div>
                <div>
                  <span className="text-gray-400 text-xs block mb-2">EQ Preset</span>
                  <div className="flex gap-1 flex-wrap">
                    {eqPresets.map(p => (
                      <button
                        key={p}
                        onClick={() => setEqPreset(p)}
                        className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${eqPreset === p ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Export */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-white text-sm font-semibold mb-3">Export</h3>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <span className="text-gray-400 text-xs block mb-1.5">Format</span>
                    <div className="flex flex-wrap gap-1">
                      {formats.map(f => (
                        <button key={f} onClick={() => setExportFormat(f)}
                          className={`px-2 py-0.5 rounded text-xs border transition-colors ${exportFormat === f ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs block mb-1.5">Bitrate</span>
                    <div className="flex flex-wrap gap-1">
                      {['128', '192', '320'].map(b => (
                        <button key={b} onClick={() => setBitrate(b)}
                          className={`px-2 py-0.5 rounded text-xs border transition-colors ${bitrate === b ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
                          {b} kbps
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs block mb-1.5">Sample Rate</span>
                    <div className="flex flex-wrap gap-1">
                      {['22kHz', '44.1kHz', '48kHz'].map(s => (
                        <button key={s} onClick={() => setSampleRate(s)}
                          className={`px-2 py-0.5 rounded text-xs border transition-colors ${sampleRate === s ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors">
                    Download {exportFormat}
                  </button>
                  <button className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">
                    Add to Video
                  </button>
                  <button className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">
                    Publishing Hub
                  </button>
                </div>
              </div>
            </div>
          )}

          {rightTab === 'history' && (
            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-3">
                {MOCK_HISTORY.map(rec => (
                  <div key={rec.id} className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-lg flex-shrink-0">
                      🎙
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-300 text-xs truncate">{rec.scriptPreview}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-gray-500 text-xs">{rec.voiceName}</span>
                        <span className="text-gray-700 text-xs">·</span>
                        <span className="text-gray-500 text-xs">{rec.duration}</span>
                        <span className="text-gray-700 text-xs">·</span>
                        <span className="text-gray-600 text-xs">{rec.date}</span>
                      </div>
                    </div>
                    <button className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-indigo-600 text-gray-400 hover:text-white text-xs transition-colors flex-shrink-0">
                      Re-download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── API Settings Slide-over ──────────────────────────────────────────── */}
      {showApiPanel && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={() => setShowApiPanel(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-white font-semibold">API Settings</h2>
              <button onClick={() => setShowApiPanel(false)} className="text-gray-500 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">Voice API Provider</label>
                <select value={apiProvider} onChange={e => setApiProvider(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                  <option>ElevenLabs</option>
                  <option>OpenAI TTS</option>
                  <option>PlayHT</option>
                  <option>Murf</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              {apiTestResult === 'ok' && (
                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-sm">
                  Connection successful
                </div>
              )}
              {apiTestResult === 'fail' && (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/40 text-red-400 text-sm">
                  Connection failed — check your API key
                </div>
              )}
              <button
                onClick={async () => {
                  setApiTesting(true)
                  setApiTestResult(null)
                  await new Promise(r => setTimeout(r, 1000))
                  setApiTestResult(apiKey.length > 10 ? 'ok' : 'fail')
                  setApiTesting(false)
                }}
                disabled={apiTesting || !apiKey}
                className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-sm transition-colors"
              >
                {apiTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm transition-colors">
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clone Voice Modal ────────────────────────────────────────────────── */}
      {showCloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={() => setShowCloneModal(false)} />
          <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">Clone a Voice</h2>
              <button onClick={() => setShowCloneModal(false)} className="text-gray-500 hover:text-white transition-colors">✕</button>
            </div>
            <p className="text-gray-400 text-sm">Upload at least 30 seconds of clean audio to create a voice clone.</p>
            <div>
              <label className="text-gray-400 text-xs block mb-1.5">Clone Name</label>
              <input placeholder="My Voice Clone" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:border-indigo-600 transition-colors cursor-pointer">
              <div className="text-2xl mb-2">🎤</div>
              <p className="text-gray-400 text-sm">Drop audio files here or click to upload</p>
              <p className="text-gray-600 text-xs mt-1">MP3, WAV, M4A — min 30 seconds</p>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm transition-colors">Start Cloning</button>
              <button onClick={() => setShowCloneModal(false)} className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
