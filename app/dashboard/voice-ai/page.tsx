'use client'

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ModelId = 'elevenlabs' | 'openai' | 'playht' | 'murf' | 'azure' | 'google'
type CloneStatus = 'Training' | 'Ready' | 'Failed'

interface VoiceModel {
  id: ModelId
  name: string
  provider: string
  initial: string
  initialColor: string
  capabilities: string[]
  quality: number
  speed: 'Ultra-fast' | 'Fast' | 'Standard'
  pricePerChar: string
  languages: number
  active: boolean
}

interface CloneRecord {
  id: string
  name: string
  status: CloneStatus
  samples: number
  createdAt: string
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const VOICE_MODELS: VoiceModel[] = [
  {
    id: 'elevenlabs', name: 'ElevenLabs v3', provider: 'ElevenLabs', initial: 'E', initialColor: 'bg-purple-600',
    capabilities: ['Emotion Control', 'Voice Cloning', 'Real-time', '29 languages'],
    quality: 5, speed: 'Fast', pricePerChar: '$0.0003', languages: 29, active: true,
  },
  {
    id: 'openai', name: 'OpenAI TTS', provider: 'OpenAI', initial: 'O', initialColor: 'bg-emerald-600',
    capabilities: ['6 Voices', 'Ultra-fast', 'Cheap', 'Streaming'],
    quality: 3, speed: 'Ultra-fast', pricePerChar: '$0.000015', languages: 1, active: false,
  },
  {
    id: 'playht', name: 'PlayHT 2.0', provider: 'PlayHT', initial: 'P', initialColor: 'bg-blue-600',
    capabilities: ['Realistic', 'Ultra-fast Cloning', 'Emotion Control', '142 languages'],
    quality: 5, speed: 'Ultra-fast', pricePerChar: '$0.0002', languages: 142, active: false,
  },
  {
    id: 'murf', name: 'Murf AI', provider: 'Murf', initial: 'M', initialColor: 'bg-orange-600',
    capabilities: ['Studio Quality', '120+ Voices', 'Collaboration', 'Video Sync'],
    quality: 4, speed: 'Standard', pricePerChar: '$0.00025', languages: 20, active: false,
  },
  {
    id: 'azure', name: 'Azure Neural TTS', provider: 'Microsoft', initial: 'A', initialColor: 'bg-sky-600',
    capabilities: ['Enterprise', '300+ Voices', 'SSML', 'Real-time'],
    quality: 4, speed: 'Fast', pricePerChar: '$0.000016', languages: 110, active: false,
  },
  {
    id: 'google', name: 'Google WaveNet', provider: 'Google', initial: 'G', initialColor: 'bg-rose-600',
    capabilities: ['Natural Prosody', 'WaveNet', 'Neural2', '40+ languages'],
    quality: 4, speed: 'Standard', pricePerChar: '$0.000016', languages: 40, active: false,
  },
]

const MOCK_CLONES: CloneRecord[] = [
  { id: 'cl1', name: 'My Voice Clone', status: 'Ready', samples: 4, createdAt: '2026-05-20' },
  { id: 'cl2', name: 'CEO Voice', status: 'Training', samples: 6, createdAt: '2026-05-25' },
  { id: 'cl3', name: 'Old Test Clone', status: 'Failed', samples: 1, createdAt: '2026-05-18' },
]

const DAILY_USAGE = [420, 680, 310, 890, 1200, 740, 560]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_DAILY = Math.max(...DAILY_USAGE)

const SPEED_COLORS: Record<string, string> = {
  'Ultra-fast': 'bg-emerald-900/60 text-emerald-300 border-emerald-800/50',
  'Fast': 'bg-blue-900/60 text-blue-300 border-blue-800/50',
  'Standard': 'bg-gray-800 text-gray-400 border-gray-700',
}

function QualityDots({ count }: { count: number }) {
  return (
    <span className="flex gap-0.5 items-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < count ? 'bg-indigo-400' : 'bg-gray-700'}`} />
      ))}
    </span>
  )
}

function CloneStatusBadge({ status }: { status: CloneStatus }) {
  const styles: Record<CloneStatus, string> = {
    Ready: 'bg-emerald-900/60 text-emerald-400 border-emerald-800/50',
    Training: 'bg-yellow-900/60 text-yellow-400 border-yellow-800/50',
    Failed: 'bg-red-900/60 text-red-400 border-red-800/50',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${styles[status]}`}>{status}</span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VoiceAIPage() {
  const [models, setModels] = useState<VoiceModel[]>(VOICE_MODELS)
  const [activeModel, setActiveModel] = useState<ModelId | null>('elevenlabs')
  const [clones, setClones] = useState<CloneRecord[]>(MOCK_CLONES)
  const [showConnectModal, setShowConnectModal] = useState<ModelId | null>(null)
  const [connectingKey, setConnectingKey] = useState('')
  const [connecting, setConnecting] = useState(false)

  // API keys panel state
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    ElevenLabs: '', OpenAI: '', PlayHT: '', Murf: '', Azure: '', Google: '',
  })
  const [testingKey, setTestingKey] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, boolean>>({})

  // Clone form
  const [cloneName, setCloneName] = useState('')
  const [clonePrivacy, setClonePrivacy] = useState<'Private' | 'Team'>('Private')

  // Active model settings
  const [defaultVoice, setDefaultVoice] = useState('Aria')
  const [defaultSpeed, setDefaultSpeed] = useState(1.0)
  const [defaultPitch, setDefaultPitch] = useState(0)
  const [usageFor, setUsageFor] = useState({ cmo: true, voiceover: true, inbox: false, video: false })

  const isConnected = models.some(m => m.active)
  const activeModelObj = models.find(m => m.active)

  const creditsUsed = 1840
  const creditsTotal = 4240
  const creditsPct = Math.round((creditsUsed / creditsTotal) * 100)

  const usageByFeature = [
    { label: 'Voiceover Studio', pct: 58, color: 'bg-indigo-500' },
    { label: 'CMO Voice', pct: 27, color: 'bg-violet-500' },
    { label: 'Inbox Auto-reply', pct: 15, color: 'bg-emerald-500' },
  ]

  async function handleConnect(modelId: ModelId) {
    setConnecting(true)
    await new Promise(r => setTimeout(r, 1000))
    setModels(prev => prev.map(m => m.id === modelId ? { ...m, active: true } : m))
    setActiveModel(modelId)
    setConnecting(false)
    setShowConnectModal(null)
    setConnectingKey('')
  }

  async function testApiKey(provider: string) {
    setTestingKey(provider)
    await new Promise(r => setTimeout(r, 900))
    setTestResults(prev => ({ ...prev, [provider]: apiKeys[provider].length > 6 }))
    setTestingKey(null)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">

      {/* ── Hero Section ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-sm">
              🎤
            </div>
            Voice AI
          </h1>
          <p className="text-gray-400 text-sm mt-1 ml-12">Configure AI voice models for your agents and automation</p>
        </div>

        {/* Connection status banner */}
        {isConnected ? (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-950/40 border border-emerald-800/50">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-sm font-medium">Active · {activeModelObj?.provider}</span>
            <span className="text-gray-600 text-xs">·</span>
            <span className="text-gray-400 text-xs">2,400 credits remaining</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-950/30 border border-amber-800/50">
            <span className="text-amber-400 text-sm">Not Connected</span>
            <button className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors">
              Connect Now
            </button>
          </div>
        )}
      </div>

      {/* ── Model Cards Grid ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-white font-semibold text-sm mb-4">Voice AI Models</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map(model => (
            <div
              key={model.id}
              className={`relative bg-gray-900 border rounded-2xl p-5 transition-all ${
                model.active
                  ? 'border-indigo-600/60 ring-1 ring-indigo-600/20'
                  : 'border-gray-800 opacity-60 grayscale'
              }`}
            >
              {/* Active / Inactive badge */}
              {model.active ? (
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-900/60 border border-emerald-800/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-emerald-400 text-xs">Active</span>
                </div>
              ) : (
                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700">
                  <span className="text-gray-500 text-xs">🔒 Inactive</span>
                </div>
              )}

              {/* Provider logo */}
              <div className="flex items-center gap-3 mb-4 pr-20">
                <div className={`w-10 h-10 rounded-xl ${model.initialColor} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                  {model.initial}
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">{model.name}</h3>
                  <span className="text-gray-500 text-xs">{model.provider}</span>
                </div>
              </div>

              {/* Capability tags */}
              <div className="flex flex-wrap gap-1 mb-3">
                {model.capabilities.map(cap => (
                  <span key={cap} className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-xs border border-gray-700">
                    {cap}
                  </span>
                ))}
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 mb-4">
                <QualityDots count={model.quality} />
                <span className={`px-1.5 py-0.5 rounded text-xs border ${SPEED_COLORS[model.speed]}`}>
                  {model.speed}
                </span>
                <span className="text-gray-600 text-xs">{model.pricePerChar}/char</span>
              </div>

              {/* CTA */}
              {model.active ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-950/30 border border-emerald-800/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-emerald-400 text-xs">Connected</span>
                  </div>
                  <button
                    onClick={() => setActiveModel(model.id)}
                    className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
                  >
                    Configure
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConnectModal(model.id)}
                  className="w-full py-2 rounded-xl border border-indigo-600/50 hover:bg-indigo-600/10 text-indigo-400 hover:text-indigo-300 text-xs font-medium transition-colors"
                >
                  Connect to Activate
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Active Model Configuration ────────────────────────────────────────── */}
      {activeModelObj && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${activeModelObj.initialColor} flex items-center justify-center text-white font-bold text-sm`}>
              {activeModelObj.initial}
            </div>
            <h2 className="text-white font-semibold">{activeModelObj.name} — Configuration</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">Default Voice</label>
                <select
                  value={defaultVoice}
                  onChange={e => setDefaultVoice(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option>Aria</option>
                  <option>Marcus</option>
                  <option>Luna</option>
                  <option>Kai</option>
                  <option>David</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-gray-400 text-xs">Default Speed</label>
                  <span className="text-gray-500 text-xs font-mono">{defaultSpeed.toFixed(1)}×</span>
                </div>
                <input type="range" min={0.5} max={2.0} step={0.1} value={defaultSpeed}
                  onChange={e => setDefaultSpeed(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-gray-400 text-xs">Default Pitch</label>
                  <span className="text-gray-500 text-xs font-mono">{defaultPitch > 0 ? '+' : ''}{defaultPitch}%</span>
                </div>
                <input type="range" min={-50} max={50} step={5} value={defaultPitch}
                  onChange={e => setDefaultPitch(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1"
                />
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-3">Use this voice for</label>
              <div className="space-y-2.5">
                {[
                  { key: 'cmo', label: 'CMO Agent responses' },
                  { key: 'voiceover', label: 'Content voiceover' },
                  { key: 'inbox', label: 'Inbox auto-reply' },
                  { key: 'video', label: 'Video narration' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usageFor[key as keyof typeof usageFor]}
                      onChange={e => setUsageFor(prev => ({ ...prev, [key]: e.target.checked }))}
                      className="accent-indigo-500 w-3.5 h-3.5"
                    />
                    <span className="text-gray-300 text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
              Save Configuration
            </button>
          </div>
        </div>
      )}

      {/* ── Voice Cloning Section ─────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
        <h2 className="text-white font-semibold">Voice Cloning</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Clone creation form */}
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs block mb-1.5">Clone Name</label>
              <input
                value={cloneName}
                onChange={e => setCloneName(e.target.value)}
                placeholder="e.g. My Voice Clone"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="border-2 border-dashed border-gray-700 rounded-xl p-5 text-center hover:border-indigo-600 transition-colors cursor-pointer">
              <div className="text-2xl mb-2">🎤</div>
              <p className="text-gray-400 text-sm">Drop audio samples here</p>
              <p className="text-gray-600 text-xs mt-1">Minimum 30 seconds · MP3, WAV, M4A</p>
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-1.5">Privacy</label>
              <div className="flex gap-2">
                {(['Private', 'Team'] as const).map(p => (
                  <button key={p} onClick={() => setClonePrivacy(p)}
                    className={`flex-1 py-1.5 rounded-lg border text-sm font-medium transition-colors ${clonePrivacy === p ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <button
              disabled={!cloneName}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              Create Voice Clone
            </button>
          </div>

          {/* Clone history */}
          <div>
            <h3 className="text-gray-400 text-xs font-medium mb-3 uppercase tracking-wide">Clone History</h3>
            <div className="space-y-2">
              {clones.map(clone => (
                <div key={clone.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-700/50">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-xs text-white font-bold flex-shrink-0">
                    {clone.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{clone.name}</p>
                    <p className="text-gray-500 text-xs">{clone.samples} samples · {clone.createdAt}</p>
                  </div>
                  <CloneStatusBadge status={clone.status} />
                  {clone.status === 'Ready' && (
                    <button className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">Use</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Usage Stats ───────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
        <h2 className="text-white font-semibold">Usage Statistics</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Credits */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Credits used this month</span>
              <span className="text-white text-sm font-medium">{creditsUsed.toLocaleString()} / {creditsTotal.toLocaleString()}</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all ${creditsPct > 80 ? 'bg-red-500' : creditsPct > 60 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                style={{ width: `${creditsPct}%` }}
              />
            </div>
            <div className="space-y-2">
              {usageByFeature.map(f => (
                <div key={f.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-400 text-xs">{f.label}</span>
                    <span className="text-gray-500 text-xs">{f.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${f.color}`} style={{ width: `${f.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily chart */}
          <div>
            <span className="text-gray-400 text-sm block mb-3">Daily Usage — Last 7 Days</span>
            <div className="flex items-end gap-2 h-28">
              {DAILY_USAGE.map((val, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-sm bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-default"
                    style={{ height: `${(val / MAX_DAILY) * 100}%` }}
                    title={`${val} chars`}
                  />
                  <span className="text-gray-600 text-xs">{DAYS[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── API Settings Panel ────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-white font-semibold">API Settings</h2>
        <p className="text-gray-500 text-sm">Connect your voice AI providers to activate their models.</p>

        <div className="space-y-3">
          {Object.entries({
            ElevenLabs: 'ElevenLabs API Key',
            OpenAI: 'OpenAI API Key',
            PlayHT: 'PlayHT API Key',
            Murf: 'Murf API Key',
            Azure: 'Azure Speech Key',
            Google: 'Google Cloud API Key',
          }).map(([provider, label]) => (
            <div key={provider} className="flex items-center gap-3">
              <span className="w-28 text-gray-400 text-xs flex-shrink-0">{provider}</span>
              <input
                type="password"
                value={apiKeys[provider]}
                onChange={e => setApiKeys(prev => ({ ...prev, [provider]: e.target.value }))}
                placeholder={label}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => testApiKey(provider)}
                disabled={!apiKeys[provider] || testingKey === provider}
                className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-400 hover:text-white text-xs transition-colors flex-shrink-0"
              >
                {testingKey === provider ? '...' : 'Test'}
              </button>
              {testResults[provider] !== undefined && (
                <span className={`text-xs flex-shrink-0 ${testResults[provider] ? 'text-emerald-400' : 'text-red-400'}`}>
                  {testResults[provider] ? '✓' : '✗'}
                </span>
              )}
              {/* Webhook (ElevenLabs only) */}
              {provider === 'ElevenLabs' && (
                <span className="text-gray-600 text-xs flex-shrink-0 hidden lg:block">Streaming ✓</span>
              )}
            </div>
          ))}
        </div>

        <button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
          Save All Keys
        </button>
      </div>

      {/* ── Connect Model Modal ───────────────────────────────────────────────── */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={() => setShowConnectModal(null)} />
          <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            {(() => {
              const model = models.find(m => m.id === showConnectModal)!
              return (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl ${model.initialColor} flex items-center justify-center text-white font-bold`}>
                        {model.initial}
                      </div>
                      <h2 className="text-white font-semibold">Connect {model.name}</h2>
                    </div>
                    <button onClick={() => setShowConnectModal(null)} className="text-gray-500 hover:text-white transition-colors">✕</button>
                  </div>
                  <p className="text-gray-400 text-sm">Enter your {model.provider} API key to activate this model.</p>
                  <div>
                    <label className="text-gray-400 text-xs block mb-1.5">API Key</label>
                    <input
                      type="password"
                      value={connectingKey}
                      onChange={e => setConnectingKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConnect(showConnectModal)}
                      disabled={connecting || !connectingKey}
                      className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                    >
                      {connecting ? 'Connecting...' : 'Activate Model'}
                    </button>
                    <button onClick={() => setShowConnectModal(null)} className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">
                      Cancel
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
