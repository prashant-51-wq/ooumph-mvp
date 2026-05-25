'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

type Tab = 'runway' | 'heygen'

const RATIO_OPTIONS = [
  { label: 'Landscape 16:9', value: '1280:768' },
  { label: 'Portrait 9:16', value: '768:1280' },
  { label: 'Square 1:1', value: '960:960' },
  { label: 'Cinematic', value: '1584:672' },
]

const BG_OPTIONS = [
  { label: 'White', value: 'white' },
  { label: 'Dark', value: 'dark' },
  { label: 'Custom URL', value: 'custom' },
]

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
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

export default function VideoGenPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('runway')

  // ── Runway state ────────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState<5 | 10>(5)
  const [ratio, setRatio] = useState('1280:768')
  const [useImage, setUseImage] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [generating, setGenerating] = useState(false)
  const [runwayError, setRunwayError] = useState('')
  const [runwaySetupError, setRunwaySetupError] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [taskStatus, setTaskStatus] = useState<'idle' | 'processing' | 'done' | 'failed'>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [taskProgress, setTaskProgress] = useState<number | null>(null)
  const [taskStatusText, setTaskStatusText] = useState('')
  const [startTime, setStartTime] = useState<number | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // ── HeyGen state ────────────────────────────────────────────────────────────
  const [script, setScript] = useState('')
  const [avatars, setAvatars] = useState<any[]>([])
  const [voices, setVoices] = useState<any[]>([])
  const [selectedAvatar, setSelectedAvatar] = useState<string>('')
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [videoTitle, setVideoTitle] = useState('')
  const [background, setBackground] = useState('white')
  const [customBg, setCustomBg] = useState('')
  const [heygenLoading, setHeygenLoading] = useState(false)
  const [heygenError, setHeygenError] = useState('')
  const [heygenSetupError, setHeygenSetupError] = useState(false)
  const [heygenVideoId, setHeygenVideoId] = useState<string | null>(null)
  const [heygenStatus, setHeygenStatus] = useState<'idle' | 'processing' | 'done' | 'failed'>('idle')
  const [heygenVideoUrl, setHeygenVideoUrl] = useState<string | null>(null)
  const [heygenThumbnail, setHeygenThumbnail] = useState<string | null>(null)
  const [avatarsLoading, setAvatarsLoading] = useState(false)
  const [voicesLoading, setVoicesLoading] = useState(false)
  const heygenPollRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
  }, [])

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      if (heygenPollRef.current) clearInterval(heygenPollRef.current)
    }
  }, [])

  // Load avatars + voices when HeyGen tab is first activated
  useEffect(() => {
    if (activeTab === 'heygen' && workspaceId && avatars.length === 0) {
      loadAvatarsAndVoices()
    }
  }, [activeTab, workspaceId])

  async function loadAvatarsAndVoices() {
    setAvatarsLoading(true)
    setVoicesLoading(true)
    try {
      const [avatarRes, voiceRes] = await Promise.all([
        fetch('/api/agents/video/heygen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'avatars', workspaceId }),
        }),
        fetch('/api/agents/video/heygen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'voices', workspaceId }),
        }),
      ])
      const [avatarData, voiceData] = await Promise.all([avatarRes.json(), voiceRes.json()])

      if (avatarData.ok && Array.isArray(avatarData.avatars)) {
        setAvatars(avatarData.avatars)
        if (avatarData.avatars.length > 0) setSelectedAvatar(avatarData.avatars[0].avatar_id || avatarData.avatars[0].id || '')
      }
      if (voiceData.ok && Array.isArray(voiceData.voices)) {
        setVoices(voiceData.voices)
        if (voiceData.voices.length > 0) setSelectedVoice(voiceData.voices[0].voice_id || voiceData.voices[0].id || '')
      }
    } catch (e) {
      console.error('Failed to load HeyGen assets:', e)
    } finally {
      setAvatarsLoading(false)
      setVoicesLoading(false)
    }
  }

  // ── Runway: Generate video ───────────────────────────────────────────────
  async function generateRunwayVideo() {
    if (!prompt.trim() || prompt.trim().length < 3) {
      setRunwayError('Please enter a prompt (at least 3 characters).')
      return
    }
    if (useImage && !imageUrl.trim()) {
      setRunwayError('Please enter an image URL.')
      return
    }

    setGenerating(true)
    setRunwayError('')
    setRunwaySetupError(false)
    setTaskId(null)
    setVideoUrl(null)
    setTaskStatus('idle')

    try {
      const res = await fetch('/api/agents/video/runway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: useImage ? 'image_to_video' : 'text_to_video',
          prompt,
          duration,
          ratio,
          ...(useImage ? { imageUrl } : {}),
        }),
      })
      const data = await res.json()

      if (data.requiresSetup) {
        setRunwaySetupError(true)
        setRunwayError(data.error)
        return
      }
      if (!data.ok) {
        setRunwayError(data.error || 'Video generation failed.')
        return
      }

      setTaskId(data.taskId)
      setTaskStatus('processing')
      setTaskStatusText('Processing...')
      setStartTime(Date.now())
      startRunwayPolling(data.taskId)
    } catch (e) {
      setRunwayError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  function startRunwayPolling(tid: string) {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/agents/video/runway', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status', taskId: tid, workspaceId }),
        })
        const data = await res.json()

        if (data.task?.progress !== undefined) {
          setTaskProgress(data.task.progress)
        }
        if (data.task?.status) {
          setTaskStatusText(data.task.status === 'RUNNING' ? 'Rendering...' : data.task.status)
        }

        if (data.task?.videoUrl) {
          setVideoUrl(data.task.videoUrl)
          setTaskStatus('done')
          clearInterval(interval)
          pollIntervalRef.current = null
        } else if (data.task?.status === 'FAILED') {
          setTaskStatus('failed')
          setRunwayError('Video generation failed on Runway.')
          clearInterval(interval)
          pollIntervalRef.current = null
        }
      } catch {
        // Keep polling on network errors
      }
    }, 4000)

    pollIntervalRef.current = interval
  }

  async function cancelRunwayVideo() {
    if (!taskId) return
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    setTaskStatus('idle')
    try {
      await fetch('/api/agents/video/runway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', taskId, workspaceId }),
      })
    } catch { /* best effort */ }
  }

  // ── HeyGen: Generate video ───────────────────────────────────────────────
  async function generateHeyGenVideo() {
    if (!script.trim()) {
      setHeygenError('Please enter a script.')
      return
    }
    setHeygenLoading(true)
    setHeygenError('')
    setHeygenSetupError(false)
    setHeygenVideoId(null)
    setHeygenVideoUrl(null)
    setHeygenThumbnail(null)
    setHeygenStatus('idle')

    try {
      const res = await fetch('/api/agents/video/heygen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: 'generate',
          script,
          avatarId: selectedAvatar,
          voiceId: selectedVoice,
          title: videoTitle,
          background: background === 'custom' ? customBg : background,
        }),
      })
      const data = await res.json()

      if (data.requiresSetup) {
        setHeygenSetupError(true)
        setHeygenError(data.error)
        return
      }
      if (!data.ok) {
        setHeygenError(data.error || 'HeyGen video generation failed.')
        return
      }

      setHeygenVideoId(data.videoId)
      setHeygenStatus('processing')
      startHeygenPolling(data.videoId)
    } catch (e) {
      setHeygenError(String(e))
    } finally {
      setHeygenLoading(false)
    }
  }

  function startHeygenPolling(vid: string) {
    if (heygenPollRef.current) clearInterval(heygenPollRef.current)

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/agents/video/heygen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status', videoId: vid, workspaceId }),
        })
        const data = await res.json()

        if (data.video?.videoUrl) {
          setHeygenVideoUrl(data.video.videoUrl)
          setHeygenThumbnail(data.video.thumbnailUrl || null)
          setHeygenStatus('done')
          clearInterval(interval)
          heygenPollRef.current = null
        } else if (data.video?.status === 'failed' || data.video?.status === 'error') {
          setHeygenStatus('failed')
          setHeygenError('HeyGen video generation failed.')
          clearInterval(interval)
          heygenPollRef.current = null
        }
      } catch { /* Keep polling */ }
    }, 5000)

    heygenPollRef.current = interval
  }

  function elapsedSeconds() {
    if (!startTime) return 0
    return Math.round((Date.now() - startTime) / 1000)
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            🎬
          </div>
          <h1 className="text-2xl font-bold text-white">AI Video Studio</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">Generate videos with Runway AI &amp; HeyGen avatars</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 mb-6">
        {([
          { id: 'runway' as Tab, icon: '🎞️', label: 'Text-to-Video (Runway)' },
          { id: 'heygen' as Tab, icon: '🧑‍💼', label: 'Avatar Video (HeyGen)' },
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

      {/* ── RUNWAY TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'runway' && (
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
            {/* Prompt */}
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">
                Prompt <span className="text-red-400">*</span>
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={4}
                placeholder="A cinematic shot of a futuristic city at night, neon lights reflecting on wet streets..."
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="text-gray-400 text-xs mb-2 block">Duration</label>
              <div className="flex gap-2">
                {([5, 10] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      duration === d
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {d} seconds
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect ratio */}
            <div>
              <label className="text-gray-400 text-xs mb-2 block">Aspect Ratio</label>
              <div className="flex flex-wrap gap-2">
                {RATIO_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setRatio(opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      ratio === opt.value
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* From image toggle */}
            <div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useImage}
                  onChange={e => setUseImage(e.target.checked)}
                  className="w-4 h-4 rounded accent-indigo-500"
                />
                <span className="text-gray-300 text-sm">Generate from image</span>
              </label>
              {useImage && (
                <input
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="mt-2 w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>

            {runwayError && (
              runwaySetupError
                ? <SetupError message={runwayError} />
                : <p className="text-red-400 text-sm">{runwayError}</p>
            )}

            <button
              onClick={generateRunwayVideo}
              disabled={generating || !workspaceId || taskStatus === 'processing'}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-6 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {generating ? (
                <><Spinner /> Starting generation...</>
              ) : (
                '🎬 Generate Video'
              )}
            </button>
          </div>

          {/* Status / polling area */}
          {taskStatus === 'processing' && taskId && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Spinner />
                  <span className="text-white text-sm font-medium">
                    {taskStatusText || 'Processing...'}
                  </span>
                  {taskProgress !== null && (
                    <span className="text-gray-400 text-xs">{Math.round(taskProgress * 100)}%</span>
                  )}
                </div>
                <button
                  onClick={cancelRunwayVideo}
                  className="px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-900 text-red-400 hover:text-red-300 text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
              {taskProgress !== null && (
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round(taskProgress * 100)}%` }}
                  />
                </div>
              )}
              <p className="text-gray-500 text-xs mt-3">
                Task ID: {taskId} · Polling every 4s · Elapsed: {elapsedSeconds()}s
              </p>
            </div>
          )}

          {taskStatus === 'done' && videoUrl && (
            <div className="bg-gray-900 border border-emerald-800/40 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> Video generated
                  {startTime && <span className="text-gray-500 text-xs font-normal">in {elapsedSeconds()}s</span>}
                </h3>
              </div>
              <video controls src={videoUrl} className="w-full rounded-lg" />
              <div className="flex gap-2">
                <button
                  onClick={() => window.open(videoUrl, '_blank')}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
                >
                  Download
                </button>
                <button
                  onClick={() => { setVideoUrl(null); setTaskStatus('idle'); setTaskId(null) }}
                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {taskStatus === 'failed' && (
            <div className="bg-red-950/40 border border-red-800/40 rounded-2xl p-6">
              <p className="text-red-400 text-sm">Video generation failed. Please try again.</p>
              <button
                onClick={() => setTaskStatus('idle')}
                className="mt-3 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── HEYGEN TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'heygen' && (
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
            {/* Script */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-gray-400 text-xs">
                  Script <span className="text-red-400">*</span>
                </label>
                <span className={`text-xs ${script.length > 2700 ? 'text-orange-400' : 'text-gray-600'}`}>
                  {script.length} / 3,000
                </span>
              </div>
              <textarea
                value={script}
                onChange={e => setScript(e.target.value.slice(0, 3000))}
                rows={5}
                placeholder="Hello! Welcome to Ooumph — your all-in-one AI marketing platform..."
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Avatar selector */}
            <div>
              <label className="text-gray-400 text-xs mb-2 block">Avatar</label>
              {avatarsLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-2 animate-pulse">
                      <div className="w-16 h-16 rounded-full bg-gray-800" />
                      <div className="w-12 h-3 rounded bg-gray-800" />
                    </div>
                  ))}
                </div>
              ) : avatars.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-48 overflow-y-auto pr-1">
                  {avatars.map((avatar: any) => {
                    const aid = avatar.avatar_id || avatar.id || ''
                    const aname = avatar.avatar_name || avatar.name || aid
                    const aimg = avatar.preview_image_url || avatar.thumbnail_url || ''
                    return (
                      <button
                        key={aid}
                        onClick={() => setSelectedAvatar(aid)}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${
                          selectedAvatar === aid
                            ? 'ring-2 ring-indigo-500 bg-indigo-950/30'
                            : 'hover:bg-gray-800'
                        }`}
                      >
                        {aimg ? (
                          <img
                            src={aimg}
                            alt={aname}
                            className="w-16 h-16 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center text-2xl">
                            🧑
                          </div>
                        )}
                        <span className="text-gray-300 text-xs text-center leading-tight line-clamp-2">{aname}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No avatars loaded. Check your HeyGen API key in Settings.</p>
              )}
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
                  value={selectedVoice}
                  onChange={e => setSelectedVoice(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  {voices.map((v: any) => {
                    const vid = v.voice_id || v.id || ''
                    const vname = v.name || vid
                    const vlang = v.language || ''
                    return (
                      <option key={vid} value={vid}>
                        {vname}{vlang ? ` — ${vlang}` : ''}
                      </option>
                    )
                  })}
                </select>
              ) : (
                <p className="text-gray-500 text-sm">No voices loaded.</p>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Title (optional)</label>
              <input
                value={videoTitle}
                onChange={e => setVideoTitle(e.target.value)}
                placeholder="My HeyGen Video"
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Background */}
            <div>
              <label className="text-gray-400 text-xs mb-2 block">Background</label>
              <div className="flex gap-2 flex-wrap">
                {BG_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setBackground(opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      background === opt.value
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {background === 'custom' && (
                <input
                  value={customBg}
                  onChange={e => setCustomBg(e.target.value)}
                  placeholder="https://example.com/background.jpg"
                  className="mt-2 w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>

            {heygenError && (
              heygenSetupError
                ? <SetupError message={heygenError} />
                : <p className="text-red-400 text-sm">{heygenError}</p>
            )}

            <button
              onClick={generateHeyGenVideo}
              disabled={heygenLoading || !workspaceId || heygenStatus === 'processing'}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-6 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {heygenLoading ? (
                <><Spinner /> Starting generation...</>
              ) : (
                '🧑‍💼 Generate Avatar Video'
              )}
            </button>
          </div>

          {/* HeyGen progress */}
          {heygenStatus === 'processing' && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center gap-3">
                <Spinner />
                <span className="text-white text-sm font-medium">Generating avatar video...</span>
              </div>
              <p className="text-gray-500 text-xs mt-3">Video ID: {heygenVideoId} · Polling every 5s</p>
            </div>
          )}

          {heygenStatus === 'done' && heygenVideoUrl && (
            <div className="bg-gray-900 border border-emerald-800/40 rounded-2xl p-6 space-y-4">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Avatar video ready
              </h3>
              {heygenThumbnail && (
                <img src={heygenThumbnail} alt="Video thumbnail" className="w-40 rounded-lg" />
              )}
              <video controls src={heygenVideoUrl} className="w-full rounded-lg" />
              <div className="flex gap-2">
                <button
                  onClick={() => window.open(heygenVideoUrl, '_blank')}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
                >
                  Download
                </button>
                <button
                  onClick={() => { setHeygenVideoUrl(null); setHeygenStatus('idle'); setHeygenVideoId(null) }}
                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {heygenStatus === 'failed' && (
            <div className="bg-red-950/40 border border-red-800/40 rounded-2xl p-6">
              <p className="text-red-400 text-sm">Avatar video generation failed. Please try again.</p>
              <button
                onClick={() => setHeygenStatus('idle')}
                className="mt-3 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
