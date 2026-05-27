'use client'

/**
 * /dashboard/voice-library
 *
 * Voice profile directory. Custom <audio>-based mini player per row so the
 * page never layout-shifts when a sample plays. Provider + gender + status
 * filters. Add/edit modal handles the workspace-scoped UNIQUE 409 cleanly.
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  Header + filter strip + "New voice"                            │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │  Grid of voice cards                                            │
 *   │   ┌──────────────────────────────────────────────────────────┐ │
 *   │   │  Voice name  ⭐ default                                  │ │
 *   │   │  provider · gender · accent · status                      │ │
 *   │   │  ▶ ━━━━━━━━━━━━━━━━━━ 0:08 / 0:24                        │ │
 *   │   │  Native ID: vp_xxx  [edit] [delete]                       │ │
 *   │   └──────────────────────────────────────────────────────────┘ │
 *   └─────────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Music, RefreshCw, AlertCircle, Plus, X, Star, Trash2, Edit3,
  Play, Pause, Volume2, AlertTriangle, Sparkles, Save, Search,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface VoiceProfile {
  id: string
  workspace_id: string
  voice_name: string
  native_provider_voice_id: string
  provider: string
  gender: string | null
  accent_label: string | null
  sample_url: string | null
  status: string
  is_default: number | boolean
  created_at: string
  updated_at: string | null
}

const PROVIDER_BADGE: Record<string, string> = {
  elevenlabs:   'bg-purple-900/30 text-purple-300 border-purple-800',
  openai:       'bg-emerald-900/30 text-emerald-300 border-emerald-800',
  vapi:         'bg-blue-900/30 text-blue-300 border-blue-800',
  azure:        'bg-sky-900/30 text-sky-300 border-sky-800',
  amazon_polly: 'bg-amber-900/30 text-amber-300 border-amber-800',
}

const GENDER_BADGE: Record<string, string> = {
  male:    'bg-sky-900/30 text-sky-300 border-sky-800',
  female:  'bg-rose-900/30 text-rose-300 border-rose-800',
  neutral: 'bg-gray-800 text-gray-400 border-gray-700',
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function VoiceLibraryPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [voices, setVoices] = useState<VoiceProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState<string>('all')
  const [genderFilter, setGenderFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [editId, setEditId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        const id: string | null = data?.user?.workspaceId
          || (typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null)
        setWorkspaceId(id)
        if (!id) setError('No workspace selected — finish onboarding first.')
      })
      .catch(() => { if (!cancelled) setError('Failed to load session') })
    return () => { cancelled = true }
  }, [])

  const fetchAll = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/voice-profiles?workspaceId=${workspaceId}`)
      const rows = await res.json() as VoiceProfile[]
      setVoices(Array.isArray(rows) ? rows : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Available providers based on current voices
  const providersAvailable = useMemo(() => {
    const set = new Set<string>()
    for (const v of voices) set.add(v.provider)
    return Array.from(set).sort()
  }, [voices])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return voices.filter(v => {
      if (providerFilter !== 'all' && v.provider !== providerFilter) return false
      if (genderFilter !== 'all' && (v.gender || '') !== genderFilter) return false
      if (statusFilter !== 'all' && v.status !== statusFilter) return false
      if (q) {
        const hay = [v.voice_name, v.native_provider_voice_id, v.accent_label].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [voices, search, providerFilter, genderFilter, statusFilter])

  const deleteVoice = async (id: string) => {
    if (!workspaceId) return
    if (!confirm('Delete this voice profile? Past TTS generations using it will keep working.')) return
    try {
      const res = await fetch(`/api/voice-profiles?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const setDefault = async (id: string) => {
    if (!workspaceId) return
    try {
      await fetch('/api/voice-profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, workspaceId, isDefault: true }),
      })
      fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Music className="w-6 h-6 text-emerald-400" /> Voice Library
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Curated voices for TTS generation. UNIQUE per workspace × provider voice — no double-registration.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchAll}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={() => setShowNew(true)}
              disabled={!workspaceId}
              className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New voice
            </button>
          </div>
        </div>

        {/* Filter strip */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, native ID, accent…"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
            />
          </div>
          <select
            value={providerFilter} onChange={e => setProviderFilter(e.target.value)}
            className="bg-gray-900 border border-gray-800 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-indigo-600 focus:outline-none"
          >
            <option value="all">All providers</option>
            {providersAvailable.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={genderFilter} onChange={e => setGenderFilter(e.target.value)}
            className="bg-gray-900 border border-gray-800 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-indigo-600 focus:outline-none"
          >
            <option value="all">All genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="neutral">Neutral</option>
          </select>
          <select
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-gray-900 border border-gray-800 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-indigo-600 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="text-xs text-gray-500 mb-3">
          {filtered.length} of {voices.length} voice{voices.length === 1 ? '' : 's'}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading voice library…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
            <Volume2 className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            <p className="text-gray-300 text-lg mb-1">
              {voices.length === 0 ? 'No voice profiles yet' : 'No voices match your filters'}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              {voices.length === 0
                ? 'Add an ElevenLabs voice ID (or any provider voice) to start using it across TTS generations.'
                : 'Try clearing the search or switching the provider/gender/status filters.'}
            </p>
            {voices.length === 0 && (
              <button
                onClick={() => setShowNew(true)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm rounded-lg inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add first voice
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(v => (
              <VoiceCard
                key={v.id}
                voice={v}
                onEdit={() => setEditId(v.id)}
                onDelete={() => deleteVoice(v.id)}
                onSetDefault={() => setDefault(v.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showNew && workspaceId && (
        <VoiceModal
          workspaceId={workspaceId}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); fetchAll() }}
        />
      )}
      {editId && workspaceId && (
        <VoiceModal
          workspaceId={workspaceId}
          editing={voices.find(v => v.id === editId)}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); fetchAll() }}
        />
      )}
    </div>
  )
}

// ─── Voice Card with custom audio player ──────────────────────────────────

function VoiceCard({
  voice, onEdit, onDelete, onSetDefault,
}: {
  voice: VoiceProfile
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loadError, setLoadError] = useState(false)

  const isDefault = !!voice.is_default

  // Tear down audio when card unmounts (e.g. workspace switch)
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const togglePlay = () => {
    if (!voice.sample_url || loadError) return
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      // Pause all other audio elements playing in the page to keep one-at-a-time UX
      document.querySelectorAll('audio').forEach(el => {
        if (el !== audio && !el.paused) el.pause()
      })
      audio.play().catch(() => setLoadError(true))
    } else {
      audio.pause()
    }
  }

  const fmtTime = (s: number): string => {
    if (!Number.isFinite(s) || s <= 0) return '0:00'
    const mm = Math.floor(s / 60)
    const ss = Math.floor(s - mm * 60).toString().padStart(2, '0')
    return `${mm}:${ss}`
  }

  return (
    <article className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col hover:border-gray-700 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-base font-semibold text-white truncate">{voice.voice_name}</h3>
            {isDefault && (
              <span title="Default voice for this workspace" className="text-amber-400">
                <Star className="w-3.5 h-3.5 fill-current" />
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 font-mono truncate" title={voice.native_provider_voice_id}>
            {voice.native_provider_voice_id}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-gray-800 rounded"
            title="Edit"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-gray-800 rounded"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PROVIDER_BADGE[voice.provider] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
          {voice.provider}
        </span>
        {voice.gender && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${GENDER_BADGE[voice.gender] || GENDER_BADGE.neutral}`}>
            {voice.gender}
          </span>
        )}
        {voice.accent_label && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-gray-950 text-gray-400 border-gray-800">
            {voice.accent_label}
          </span>
        )}
        {voice.status === 'archived' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-gray-800 text-gray-500 border-gray-700">
            archived
          </span>
        )}
      </div>

      {/* Audio player (custom, no native controls so layout stays stable) */}
      {voice.sample_url ? (
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2.5 mb-3">
          <button
            onClick={togglePlay}
            disabled={loadError}
            className="flex-shrink-0 w-9 h-9 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-full inline-flex items-center justify-center"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <div className="flex-1 min-w-0">
            {/* Progress bar */}
            <div
              className="h-1 bg-gray-800 rounded-full overflow-hidden cursor-pointer"
              onClick={(e) => {
                const audio = audioRef.current
                if (!audio || !duration) return
                const rect = e.currentTarget.getBoundingClientRect()
                const pct = (e.clientX - rect.left) / rect.width
                audio.currentTime = pct * duration
              }}
            >
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500 tabular-nums">
              <span>{fmtTime((progress / 100) * duration)}</span>
              <span>{fmtTime(duration)}</span>
            </div>
          </div>
          {/* Hidden <audio> — drives the custom UI above without exposing native chrome */}
          <audio
            ref={audioRef}
            src={voice.sample_url}
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => { setIsPlaying(false); setProgress(0) }}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onTimeUpdate={(e) => {
              const a = e.currentTarget
              if (a.duration > 0) setProgress((a.currentTime / a.duration) * 100)
            }}
            onError={() => setLoadError(true)}
          />
        </div>
      ) : (
        <div className="bg-gray-950 border border-dashed border-gray-800 rounded-lg p-3 text-center text-[11px] text-gray-600 mb-3">
          No sample URL — add one to preview here
        </div>
      )}
      {loadError && (
        <div className="text-[11px] text-rose-400 mb-2 inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Sample failed to load
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-auto pt-2 border-t border-gray-800 flex items-center justify-between gap-2">
        <span className="text-[10px] text-gray-600">
          {voice.updated_at ? `Updated ${new Date(voice.updated_at).toLocaleDateString()}` : new Date(voice.created_at).toLocaleDateString()}
        </span>
        {!isDefault && voice.status === 'active' && (
          <button
            onClick={onSetDefault}
            className="px-2 py-1 text-[11px] bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 rounded inline-flex items-center gap-1"
          >
            <Star className="w-3 h-3" /> Set default
          </button>
        )}
      </div>
    </article>
  )
}

// ─── Voice Modal (create + edit) ──────────────────────────────────────────

function VoiceModal({
  workspaceId, editing, onClose, onSaved,
}: {
  workspaceId: string
  editing?: VoiceProfile
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!editing
  const [voiceName, setVoiceName] = useState(editing?.voice_name || '')
  const [nativeId, setNativeId] = useState(editing?.native_provider_voice_id || '')
  const [provider, setProvider] = useState(editing?.provider || 'elevenlabs')
  const [gender, setGender] = useState(editing?.gender || '')
  const [accentLabel, setAccentLabel] = useState(editing?.accent_label || '')
  const [sampleUrl, setSampleUrl] = useState(editing?.sample_url || '')
  const [isDefault, setIsDefault] = useState(!!editing?.is_default)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [existingId, setExistingId] = useState<string | null>(null)

  const submit = async () => {
    if (!voiceName.trim()) { setErr('Voice name required'); return }
    if (!nativeId.trim()) { setErr('Native provider voice ID required'); return }
    setSaving(true); setErr(null); setExistingId(null)
    try {
      const payload = {
        workspaceId,
        voiceName: voiceName.trim(),
        nativeProviderVoiceId: nativeId.trim(),
        provider,
        gender: gender || undefined,
        accentLabel: accentLabel.trim() || undefined,
        sampleUrl: sampleUrl.trim() || undefined,
        isDefault,
      }
      const res = await fetch('/api/voice-profiles', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { ...payload, id: editing!.id } : payload),
      })
      const data = await res.json() as { ok?: boolean; error?: string; existingId?: string }
      if (!res.ok || !data.ok) {
        if (res.status === 409) {
          setExistingId(data.existingId || null)
          throw new Error(data.error || 'Voice already registered')
        }
        throw new Error(data.error || 'Save failed')
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold flex items-center gap-2">
            {isEdit ? <Edit3 className="w-4 h-4 text-indigo-400" /> : <Sparkles className="w-4 h-4 text-emerald-400" />}
            {isEdit ? 'Edit voice profile' : 'New voice profile'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Voice name *" value={voiceName} onChange={setVoiceName} placeholder="Calm professional female" />
          <Field
            label="Native provider voice ID *"
            value={nativeId} onChange={setNativeId}
            placeholder="e.g. ElevenLabs voice id: EXAVITQu4vr4xnSDxMaL"
            disabled={isEdit}
            mono
          />
          {isEdit && (
            <p className="text-[10px] text-gray-600">
              Native ID is immutable — delete and recreate to change it (preserves the UNIQUE constraint).
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1.5">Provider</label>
              <select
                value={provider} onChange={e => setProvider(e.target.value)}
                disabled={isEdit}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-indigo-600 focus:outline-none disabled:opacity-60"
              >
                <option value="elevenlabs">ElevenLabs</option>
                <option value="openai">OpenAI</option>
                <option value="vapi">VAPI</option>
                <option value="azure">Azure</option>
                <option value="amazon_polly">Amazon Polly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1.5">Gender</label>
              <select
                value={gender} onChange={e => setGender(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-indigo-600 focus:outline-none"
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="neutral">Neutral</option>
              </select>
            </div>
          </div>

          <Field label="Accent label" value={accentLabel} onChange={setAccentLabel} placeholder="e.g. American Standard, British RP" />
          <Field label="Sample URL" value={sampleUrl} onChange={setSampleUrl} placeholder="https://… (MP3/WAV preview)" mono />

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)}
              className="accent-amber-500"
            />
            <Star className="w-3.5 h-3.5 text-amber-400" />
            Set as workspace default
          </label>
          <p className="text-[10px] text-gray-600 -mt-2">
            Marking a new default automatically demotes the previous default — exactly one per workspace.
          </p>

          {err && (
            <div className="p-2 bg-rose-950/40 border border-rose-900 rounded text-rose-300 text-xs">
              <AlertCircle className="w-3 h-3 inline mr-1" /> {err}
              {existingId && (
                <span className="block mt-1 text-[10px] text-rose-400">
                  Existing voice ID: <code className="font-mono">{existingId}</code>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
          <button
            onClick={submit} disabled={saving}
            className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add voice'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, mono, disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-xs uppercase text-gray-500 mb-1.5">{label}</label>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className={`w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none disabled:opacity-60 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}
