'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

type Tab = 'voiceover' | 'transcription'

interface Voice {
  voice_id: string
  name: string
  category?: string
}

interface VoiceoverResult {
  audioBase64: string
  mimeType: string
  charCount: number
}

interface TranscriptResult {
  transcript: string
  summary?: string
  paragraphs?: string[]
  duration?: number
  wordCount?: number
}

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'hi', label: 'Hindi' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
]

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs transition-colors"
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

function SetupError({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-red-950/40 border border-red-800/40 p-4">
      <p className="text-red-400 text-sm">{message}</p>
      <Link
        href="/dashboard/settings"
        className="inline-block mt-2 text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
      >
        Go to Settings to configure API keys →
      </Link>
    </div>
  )
}

export default function VoiceoverPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('voiceover')

  // Voiceover state
  const [voText, setVoText] = useState('')
  const [voVoiceId, setVoVoiceId] = useState('21m00Tcm4TlvDq8ikWAM') // Rachel default
  const [voStability, setVoStability] = useState(0.5)
  const [voSimilarity, setVoSimilarity] = useState(0.75)
  const [voLoading, setVoLoading] = useState(false)
  const [voError, setVoError] = useState('')
  const [voRequiresSetup, setVoRequiresSetup] = useState(false)
  const [voResult, setVoResult] = useState<VoiceoverResult | null>(null)
  const [voices, setVoices] = useState<Voice[]>([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Transcription state
  const [trUrl, setTrUrl] = useState('')
  const [trLanguage, setTrLanguage] = useState('en')
  const [trLoading, setTrLoading] = useState(false)
  const [trError, setTrError] = useState('')
  const [trRequiresSetup, setTrRequiresSetup] = useState(false)
  const [trResult, setTrResult] = useState<TranscriptResult | null>(null)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (wid) loadVoices(wid)
  }, [])

  async function loadVoices(wid: string) {
    setVoicesLoading(true)
    try {
      const res = await fetch(`/api/agents/creative/voiceover?workspaceId=${wid}`)
      const data = await res.json()
      if (data.ok && Array.isArray(data.voices) && data.voices.length > 0) {
        setVoices(data.voices)
        setVoVoiceId(data.voices[0].voice_id)
      }
    } catch {
      // If voice loading fails, user still sees the default ID input
    } finally {
      setVoicesLoading(false)
    }
  }

  async function generateVoiceover() {
    if (!voText.trim()) {
      setVoError('Please enter the text you want to convert.')
      return
    }
    setVoLoading(true)
    setVoError('')
    setVoRequiresSetup(false)
    setVoResult(null)

    try {
      const res = await fetch('/api/agents/creative/voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          text: voText,
          voiceId: voVoiceId,
          stability: voStability,
          similarityBoost: voSimilarity,
        }),
      })
      const data = await res.json()

      if (data.requiresSetup) {
        setVoRequiresSetup(true)
        setVoError(data.error)
        return
      }
      if (!data.ok) {
        setVoError(data.error || 'Voiceover generation failed.')
        return
      }

      setVoResult({ audioBase64: data.audioBase64, mimeType: data.mimeType, charCount: data.charCount })
    } catch (e) {
      setVoError(String(e))
    } finally {
      setVoLoading(false)
    }
  }

  function downloadAudio() {
    if (!voResult) return
    const blob = new Blob(
      [Uint8Array.from(atob(voResult.audioBase64), c => c.charCodeAt(0))],
      { type: voResult.mimeType }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'voiceover.mp3'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function transcribeAudio() {
    if (!trUrl.trim()) {
      setTrError('Please enter a URL to an audio file.')
      return
    }
    setTrLoading(true)
    setTrError('')
    setTrRequiresSetup(false)
    setTrResult(null)

    try {
      const res = await fetch('/api/agents/creative/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, audioUrl: trUrl, language: trLanguage }),
      })
      const data = await res.json()

      if (data.requiresSetup) {
        setTrRequiresSetup(true)
        setTrError(data.error)
        return
      }
      if (!data.ok) {
        setTrError(data.error || 'Transcription failed.')
        return
      }

      setTrResult({
        transcript: data.transcript,
        summary: data.summary,
        paragraphs: data.paragraphs,
        duration: data.duration,
        wordCount: data.wordCount,
      })
    } catch (e) {
      setTrError(String(e))
    } finally {
      setTrLoading(false)
    }
  }

  function formatDuration(seconds?: number) {
    if (!seconds) return null
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm">
            🎙️
          </div>
          <h1 className="text-2xl font-bold text-white">Voice Studio</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">AI voiceovers and audio transcription</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 mb-6">
        {([
          { id: 'voiceover' as Tab, icon: '🎙️', label: 'Voiceover' },
          { id: 'transcription' as Tab, icon: '📝', label: 'Transcription' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 ${
              activeTab === tab.id
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── VOICEOVER TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'voiceover' && (
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
            {/* Script textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-gray-400 text-xs">
                  Script or text to convert <span className="text-red-400">*</span>
                </label>
                <span className={`text-xs ${voText.length > 4500 ? 'text-orange-400' : 'text-gray-600'}`}>
                  {voText.length.toLocaleString()} / 5,000
                </span>
              </div>
              <textarea
                value={voText}
                onChange={e => setVoText(e.target.value)}
                maxLength={5000}
                rows={6}
                placeholder="Enter the script or text you'd like converted to speech..."
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Voice selector */}
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Voice</label>
              {voicesLoading ? (
                <div className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-500 text-sm animate-pulse">
                  Loading voices...
                </div>
              ) : voices.length > 0 ? (
                <select
                  value={voVoiceId}
                  onChange={e => setVoVoiceId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  {voices.map(v => (
                    <option key={v.voice_id} value={v.voice_id}>
                      {v.name}{v.category ? ` — ${v.category}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={voVoiceId}
                  onChange={e => setVoVoiceId(e.target.value)}
                  placeholder="ElevenLabs voice ID (e.g. 21m00Tcm4TlvDq8ikWAM)"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-2 gap-5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-gray-400 text-xs">Stability</label>
                  <span className="text-gray-500 text-xs font-mono">{voStability.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={voStability}
                  onChange={e => setVoStability(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between mt-0.5">
                  <span className="text-gray-600 text-xs">Variable</span>
                  <span className="text-gray-600 text-xs">Stable</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-gray-400 text-xs">Similarity</label>
                  <span className="text-gray-500 text-xs font-mono">{voSimilarity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={voSimilarity}
                  onChange={e => setVoSimilarity(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between mt-0.5">
                  <span className="text-gray-600 text-xs">Low</span>
                  <span className="text-gray-600 text-xs">High</span>
                </div>
              </div>
            </div>

            {voError && (
              voRequiresSetup
                ? <SetupError message={voError} />
                : <p className="text-red-400 text-sm">{voError}</p>
            )}

            <button
              onClick={generateVoiceover}
              disabled={voLoading || !workspaceId}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-6 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {voLoading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating voiceover...
                </>
              ) : (
                '🎙️ Generate Voiceover'
              )}
            </button>
          </div>

          {/* Voiceover result */}
          {voResult && (
            <div className="bg-gray-900 border border-emerald-800/40 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold text-sm">Generated Audio</h3>
                <span className="text-gray-500 text-xs">{voResult.charCount.toLocaleString()} characters</span>
              </div>

              {/* Audio player */}
              <audio
                ref={audioRef}
                controls
                src={`data:${voResult.mimeType};base64,${voResult.audioBase64}`}
                className="w-full"
              />

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={downloadAudio}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  Download MP3
                </button>
                <button
                  onClick={() => setVoResult(null)}
                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TRANSCRIPTION TAB ────────────────────────────────────────────────── */}
      {activeTab === 'transcription' && (
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
            {/* Audio URL */}
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">
                Audio URL <span className="text-red-400">*</span>
              </label>
              <input
                value={trUrl}
                onChange={e => setTrUrl(e.target.value)}
                placeholder="https://example.com/podcast-episode.mp3"
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
              />
              <p className="text-gray-600 text-xs mt-1.5">Paste a direct link to an MP3, WAV, M4A, or other audio file.</p>
            </div>

            {/* Language */}
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Language</label>
              <select
                value={trLanguage}
                onChange={e => setTrLanguage(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                {LANGUAGE_OPTIONS.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>

            {trError && (
              trRequiresSetup
                ? <SetupError message={trError} />
                : <p className="text-red-400 text-sm">{trError}</p>
            )}

            <button
              onClick={transcribeAudio}
              disabled={trLoading || !workspaceId}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-6 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {trLoading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Transcribing...
                </>
              ) : (
                '📝 Transcribe Audio'
              )}
            </button>
          </div>

          {/* Transcription result */}
          {trResult && (
            <div className="space-y-4">
              {/* Stats badges */}
              <div className="flex gap-2 flex-wrap">
                {trResult.duration !== undefined && (
                  <span className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-full">
                    Duration: {formatDuration(trResult.duration)}
                  </span>
                )}
                {trResult.wordCount !== undefined && (
                  <span className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-full">
                    {trResult.wordCount.toLocaleString()} words
                  </span>
                )}
              </div>

              {/* Summary */}
              {trResult.summary && (
                <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-5">
                  <p className="text-indigo-400 text-xs font-medium uppercase tracking-wide mb-2">AI Summary</p>
                  <p className="text-gray-300 text-sm leading-relaxed">{trResult.summary}</p>
                </div>
              )}

              {/* Full transcript */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold text-sm">Full Transcript</h3>
                  <CopyButton text={trResult.transcript} label="Copy Transcript" />
                </div>
                <textarea
                  readOnly
                  value={trResult.transcript}
                  rows={12}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 text-sm resize-none focus:outline-none scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
                />
              </div>

              <button
                onClick={() => setTrResult(null)}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
