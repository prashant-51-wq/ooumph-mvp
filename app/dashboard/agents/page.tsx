'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Agent registry ──────────────────────────────────────────────────────────

const AGENT_TREE = [
  {
    id: 'strategy',
    name: 'Strategy Supervisor',
    icon: '🧠',
    description: 'Generates the one-page marketing strategy from your brand profile. Gates all downstream agents.',
    endpoint: '/api/agents/strategy',
    status: 'active',
    tools: ['Brave Search', 'Firecrawl', 'Claude Sonnet'],
    workers: [],
  },
  {
    id: 'content',
    name: 'Content Supervisor',
    icon: '📅',
    description: 'Builds the 30-day content calendar across all selected channels.',
    endpoint: '/api/agents/content',
    status: 'active',
    tools: ['Claude Sonnet', 'Groq'],
    workers: [
      { id: 'blog', name: 'Blog Writer', icon: '✍️', description: 'Writes long-form blog posts and LinkedIn articles.', endpoint: '/api/agents/blog', tools: ['Claude Sonnet'] },
      { id: 'repurpose', name: 'Content Repurposer', icon: '♻️', description: 'Transforms one piece of content into multiple formats.', endpoint: '/api/agents/repurpose', tools: ['Claude Sonnet'] },
      { id: 'pr', name: 'PR Writer', icon: '📰', description: 'Drafts press releases and media pitches.', endpoint: '/api/agents/pr', tools: ['Claude Sonnet'] },
    ],
  },
  {
    id: 'creative',
    name: 'Creative Supervisor',
    icon: '🎨',
    description: 'Coordinates image, video, voiceover, and visual asset generation.',
    endpoint: '/api/agents/creative',
    status: 'active',
    tools: ['DALL-E 3', 'ElevenLabs', 'Runway', 'HeyGen', 'Cloudinary'],
    workers: [
      { id: 'image-gen', name: 'Image Generator', icon: '🖼️', description: 'DALL-E 3 image generation with Cloudinary upload.', endpoint: '/api/agents/creative/image-gen', tools: ['DALL-E 3', 'Cloudinary'] },
      { id: 'voiceover', name: 'Voiceover Agent', icon: '🎙️', description: 'ElevenLabs text-to-speech for any script.', endpoint: '/api/agents/creative/voiceover', tools: ['ElevenLabs'] },
      { id: 'transcribe', name: 'Transcription Agent', icon: '📝', description: 'Transcribes audio files via Deepgram/Whisper.', endpoint: '/api/agents/creative/transcribe', tools: ['Deepgram', 'Whisper'] },
      { id: 'runway', name: 'Runway Video Agent', icon: '🎬', description: 'Text-to-video and image-to-video via Runway ML.', endpoint: '/api/agents/video/runway', tools: ['Runway ML'] },
      { id: 'heygen', name: 'HeyGen Avatar Agent', icon: '👤', description: 'AI avatar video creation with custom scripts.', endpoint: '/api/agents/video/heygen', tools: ['HeyGen'] },
    ],
  },
  {
    id: 'leads',
    name: 'Leads Supervisor',
    icon: '🎯',
    description: 'Handles lead generation planning, CRM management, and enrichment.',
    endpoint: '/api/agents/leads',
    status: 'active',
    tools: ['Claude Sonnet', 'Apollo.io', 'Hunter.io'],
    workers: [
      { id: 'leads-enrich', name: 'Lead Enrichment', icon: '🔍', description: 'Enriches leads via Apollo.io and Hunter.io.', endpoint: '/api/agents/leads/enrich', tools: ['Apollo.io', 'Hunter.io'] },
    ],
  },
  {
    id: 'ads',
    name: 'Ads Supervisor',
    icon: '📢',
    description: 'Creates and monitors paid campaigns across Meta, Google, and LinkedIn.',
    endpoint: '/api/agents/ads',
    status: 'active',
    tools: ['Meta Ads API', 'Google Ads API', 'LinkedIn Ads API'],
    workers: [
      { id: 'ads-meta', name: 'Meta Ads Agent', icon: '📘', description: 'Creates Facebook/Instagram ad campaigns.', endpoint: '/api/agents/ads/meta', tools: ['Meta Ads API'] },
      { id: 'ads-google', name: 'Google Ads Agent', icon: '🔍', description: 'Creates Google Search and Display campaigns.', endpoint: '/api/agents/ads/google', tools: ['Google Ads API'] },
    ],
  },
  {
    id: 'publish',
    name: 'Publishing Supervisor',
    icon: '🚀',
    description: 'Publishes approved content to WordPress, Ghost, Buffer, and newsletters.',
    endpoint: '/api/agents/publish',
    status: 'active',
    tools: ['WordPress REST API', 'Ghost Admin API', 'Buffer', 'Resend'],
    workers: [
      { id: 'publish-social', name: 'Social Scheduler', icon: '📱', description: 'Schedules posts to Buffer across all platforms.', endpoint: '/api/agents/publish/social', tools: ['Buffer'] },
    ],
  },
  {
    id: 'email-marketing',
    name: 'Email Marketing Agent',
    icon: '📧',
    description: 'Sends newsletters and email sequences via Resend/Brevo/Mailchimp.',
    endpoint: '/api/agents/email-marketing',
    status: 'active',
    tools: ['Resend', 'Brevo', 'Mailchimp'],
    workers: [],
  },
  {
    id: 'payments',
    name: 'Payments Agent',
    icon: '💳',
    description: 'Creates Stripe and Razorpay payment links and tracks revenue.',
    endpoint: '/api/agents/payments',
    status: 'active',
    tools: ['Stripe', 'Razorpay'],
    workers: [
      { id: 'payments-stripe', name: 'Stripe Agent', icon: '💳', description: 'Creates Stripe checkout sessions and payment links.', endpoint: '/api/agents/payments/stripe', tools: ['Stripe'] },
      { id: 'payments-razorpay', name: 'Razorpay Agent', icon: '💰', description: 'Creates Razorpay payment links for Indian payments.', endpoint: '/api/agents/payments/razorpay', tools: ['Razorpay'] },
    ],
  },
  {
    id: 'voice-ai',
    name: 'Voice AI Agent',
    icon: '📞',
    description: 'Makes outbound voice calls and books meetings via Vapi.',
    endpoint: '/api/agents/voice/vapi',
    status: 'active',
    tools: ['Vapi', 'Cal.com'],
    workers: [],
  },
  {
    id: 'analytics',
    name: 'Analytics Agent',
    icon: '📊',
    description: 'Fetches performance data from GA4, Meta, Google Search Console.',
    endpoint: '/api/agents/analytics',
    status: 'active',
    tools: ['Google Analytics 4', 'Google Search Console', 'Meta Insights'],
    workers: [],
  },
  {
    id: 'research',
    name: 'Research Agent',
    icon: '🔍',
    description: 'Monitors trends, competitor signals, and brand mentions.',
    endpoint: '/api/agents/research',
    status: 'active',
    tools: ['Brave Search', 'Firecrawl'],
    workers: [],
  },
  {
    id: 'notify',
    name: 'Notification Agent',
    icon: '🔔',
    description: 'Sends approval alerts via Slack and Telegram.',
    endpoint: '/api/agents/notify',
    status: 'active',
    tools: ['Slack', 'Telegram'],
    workers: [],
  },
  // ── Week 4: Missing departments ───────────────────────────────────────────
  {
    id: 'sales',
    name: 'Sales Supervisor',
    icon: '💼',
    description: 'Owns pipeline, quota, forecast, and deal review. Coordinates the full sales org.',
    endpoint: '/api/agents/sales',
    status: 'coming_soon',
    tools: ['Apollo.io', 'Hunter.io', 'HubSpot', 'Cal.com', 'Claude Sonnet'],
    workers: [
      { id: 'sdr', name: 'SDR Agent', icon: '📣', description: 'Outbound prospecting and cold email sequences targeting ICPs.', endpoint: '/api/agents/sales/sdr', tools: ['Apollo.io', 'Hunter.io'] },
      { id: 'bdr', name: 'BDR Agent', icon: '📥', description: 'Handles inbound leads, qualifies MQLs to SQLs.', endpoint: '/api/agents/sales/bdr', tools: ['HubSpot'] },
      { id: 'ae', name: 'AE / Closer Agent', icon: '🤝', description: 'Drafts proposals, handles objections, and prepares closing materials.', endpoint: '/api/agents/sales/ae', tools: ['Claude Sonnet'] },
      { id: 'account-mgr', name: 'Account Manager', icon: '🔄', description: 'Manages upsell, expansion, and renewal workflows for existing accounts.', endpoint: '/api/agents/sales/account-manager', tools: ['HubSpot'] },
      { id: 'cs', name: 'Customer Success Agent', icon: '🌟', description: 'Onboarding, health scoring, and churn risk alerts.', endpoint: '/api/agents/sales/cs', tools: ['HubSpot'] },
    ],
  },
  {
    id: 'retargeting',
    name: 'Retargeting Supervisor',
    icon: '🎯',
    description: 'Designs and runs funnel-stage-aware retargeting campaigns across Meta and Google.',
    endpoint: '/api/agents/retargeting',
    status: 'coming_soon',
    tools: ['Meta Ads API', 'Google Ads API', 'Segment'],
    workers: [
      { id: 'audience-builder', name: 'Audience Builder', icon: '👥', description: 'Creates custom audiences from website visitors, video viewers, and CRM lists.', endpoint: '/api/agents/retargeting/audience', tools: ['Meta Ads API', 'Google Ads API'] },
      { id: 'lookalike', name: 'Lookalike Generator', icon: '🪞', description: 'Builds lookalike audiences from your top converters.', endpoint: '/api/agents/retargeting/lookalike', tools: ['Meta Ads API'] },
      { id: 'ad-fatigue', name: 'Ad Fatigue Detector', icon: '😴', description: 'Monitors CTR decay and flags creatives that need refreshing.', endpoint: '/api/agents/retargeting/fatigue', tools: ['Meta Ads API', 'Google Ads API'] },
    ],
  },
  {
    id: 'scheduling',
    name: 'Scheduling Supervisor',
    icon: '📅',
    description: 'Manages meeting scheduling, reminders, no-show recovery, and post-call summaries via Cal.com and Vapi.',
    endpoint: '/api/agents/scheduling',
    status: 'coming_soon',
    tools: ['Cal.com', 'Vapi', 'Claude Sonnet'],
    workers: [
      { id: 'scheduler', name: 'Scheduling Agent', icon: '🗓', description: 'Proposes meeting times based on prospect + AE calendars and sends invites.', endpoint: '/api/agents/scheduling/schedule', tools: ['Cal.com'] },
      { id: 'pre-brief', name: 'Pre-meeting Brief Agent', icon: '📋', description: 'Produces a 1-pager on the prospect 30 min before the call.', endpoint: '/api/agents/scheduling/brief', tools: ['Brave Search', 'Firecrawl', 'Claude Sonnet'] },
      { id: 'post-summary', name: 'Post-meeting Summary Agent', icon: '📝', description: 'Listens to call recordings (Vapi), summarizes, and drafts follow-up.', endpoint: '/api/agents/scheduling/summary', tools: ['Vapi', 'Claude Sonnet'] },
      { id: 'no-show', name: 'No-show Recovery Agent', icon: '🔄', description: 'Auto-follows up if prospect misses the meeting and attempts to rebook.', endpoint: '/api/agents/scheduling/noshow', tools: ['Cal.com', 'Resend'] },
    ],
  },
  {
    id: 'branding',
    name: 'Branding Supervisor',
    icon: '🎨',
    description: 'Guards brand consistency across voice, visual identity, and all published content.',
    endpoint: '/api/agents/branding',
    status: 'coming_soon',
    tools: ['Claude Sonnet', 'Cloudinary'],
    workers: [
      { id: 'voice-keeper', name: 'Brand Voice Keeper', icon: '🗣️', description: 'Reviews every output for tone and messaging consistency.', endpoint: '/api/agents/branding/voice', tools: ['Claude Sonnet'] },
      { id: 'visual-guardian', name: 'Visual Identity Guardian', icon: '👁️', description: 'Checks colors, logo usage, and typography across all generated visuals.', endpoint: '/api/agents/branding/visual', tools: ['Claude Vision', 'Cloudinary'] },
      { id: 'naming', name: 'Naming Agent', icon: '✏️', description: 'Generates on-brand names for products, features, and campaigns.', endpoint: '/api/agents/branding/naming', tools: ['Claude Sonnet'] },
      { id: 'style-guide', name: 'Style Guide Maintainer', icon: '📖', description: 'Keeps the brand book current and updates after major brand decisions.', endpoint: '/api/agents/branding/style', tools: ['Claude Sonnet'] },
    ],
  },
]

type TestState = 'idle' | 'running' | 'ok' | 'fail'

interface AgentRun {
  id: string
  agent_name: string
  status: string
  created_at: string
  completed_at?: string
  error_message?: string
}

function agentLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function ToolBadge({ name }: { name: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-xs bg-gray-800 border border-gray-700 text-gray-400">{name}</span>
  )
}

function RunRow({ run }: { run: AgentRun }) {
  const color = run.status === 'completed' ? 'text-green-400' : run.status === 'failed' ? 'text-red-400' : run.status === 'running' ? 'text-indigo-400' : 'text-gray-500'
  const ago = Math.round((Date.now() - new Date(run.created_at).getTime()) / 60000)
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-gray-800 last:border-0">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${run.status === 'completed' ? 'bg-green-500' : run.status === 'failed' ? 'bg-red-500' : run.status === 'running' ? 'bg-indigo-400 animate-pulse' : 'bg-gray-600'}`} />
      <span className="text-gray-300 text-xs flex-1 truncate">{agentLabel(run.agent_name)}</span>
      <span className={`text-xs ${color} capitalize`}>{run.status}</span>
      <span className="text-gray-600 text-xs">{ago < 1 ? 'just now' : `${ago}m ago`}</span>
    </div>
  )
}

function AgentCard({
  agent,
  runs,
  onTest,
}: {
  agent: typeof AGENT_TREE[0]
  runs: AgentRun[]
  onTest: (id: string, endpoint: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [testState, setTestState] = useState<TestState>('idle')

  const agentRuns = runs.filter(r => r.agent_name === agent.id || r.agent_name.startsWith(agent.id))
  const lastRun = agentRuns[0]
  const statusColor = lastRun?.status === 'completed' ? 'text-green-400' : lastRun?.status === 'failed' ? 'text-red-400' : lastRun?.status === 'running' ? 'text-indigo-400' : 'text-gray-600'

  const runTest = async () => {
    setTestState('running')
    try {
      const wid = localStorage.getItem('workspaceId')
      const res = await fetch(agent.endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      // If GET is not supported, try a lightweight OPTIONS/HEAD
      if (res.ok || res.status === 405) {
        setTestState('ok')
      } else {
        setTestState('fail')
      }
    } catch {
      setTestState('fail')
    }
    setTimeout(() => setTestState('idle'), 4000)
    onTest(agent.id, agent.endpoint)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-xl flex-shrink-0">{agent.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-medium text-sm">{agent.name}</h3>
            {agent.status === 'coming_soon' ? (
              <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-950 border border-yellow-800 text-yellow-400">Coming Soon</span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-xs bg-green-950 border border-green-800 text-green-400">Active</span>
            )}
            {lastRun && (
              <span className={`text-xs ${statusColor}`}>
                Last: {lastRun.status}
              </span>
            )}
          </div>
          <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{agent.description}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={runTest}
            disabled={testState === 'running'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              testState === 'ok' ? 'bg-green-950 border-green-700 text-green-400' :
              testState === 'fail' ? 'bg-red-950 border-red-700 text-red-400' :
              testState === 'running' ? 'bg-gray-800 border-gray-700 text-gray-400' :
              'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600 hover:text-indigo-400'
            }`}>
            {testState === 'running' ? 'Testing...' : testState === 'ok' ? '✓ OK' : testState === 'fail' ? '✕ Failed' : '▷ Test'}
          </button>
          <button onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors text-xs">
            {expanded ? '▴' : '▾'}
          </button>
        </div>
      </div>

      {/* Tools */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {agent.tools.map(t => <ToolBadge key={t} name={t} />)}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-800 p-4 space-y-4">
          {/* Endpoint */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Endpoint</p>
            <code className="text-xs text-indigo-300 bg-gray-800 px-2 py-1 rounded">{agent.endpoint}</code>
          </div>

          {/* Workers */}
          {agent.workers.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Workers ({agent.workers.length})</p>
              <div className="space-y-2">
                {agent.workers.map(w => (
                  <div key={w.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800 border border-gray-700">
                    <span className="text-base flex-shrink-0">{w.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium">{w.name}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{w.description}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {w.tools.map(t => <ToolBadge key={t} name={t} />)}
                      </div>
                    </div>
                    <code className="text-xs text-gray-600 hidden sm:block">{w.endpoint}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent runs for this agent */}
          {agentRuns.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Recent runs</p>
              <div>
                {agentRuns.slice(0, 5).map(r => <RunRow key={r.id} run={r} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AgentsPage() {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [testLog, setTestLog] = useState<{ id: string; endpoint: string; time: string }[]>([])

  const loadRuns = useCallback(async () => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { setLoading(false); return }
    try {
      const res = await fetch(`/api/agent-runs?workspaceId=${wid}&limit=50`)
      const data: AgentRun[] = await res.json()
      setRuns(Array.isArray(data) ? data : [])
    } catch { setRuns([]) }
    setLoading(false)
  }, [])

  useEffect(() => { loadRuns() }, [loadRuns])

  const handleTest = (id: string, endpoint: string) => {
    setTestLog(prev => [{ id, endpoint, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 10))
  }

  const filtered = search
    ? AGENT_TREE.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.description.toLowerCase().includes(search.toLowerCase()) ||
        a.tools.some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : AGENT_TREE

  const totalWorkers = AGENT_TREE.reduce((sum, a) => sum + a.workers.length, 0)
  const runningCount = runs.filter(r => r.status === 'running').length
  const completedToday = runs.filter(r => {
    const d = new Date(r.created_at)
    const now = new Date()
    return d.getDate() === now.getDate() && r.status === 'completed'
  }).length

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">🤖 AI Agents</h1>
        <p className="text-gray-400 text-sm mt-1">All active agents, their workers, tools, and recent activity.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Active Supervisors', value: AGENT_TREE.filter(a => a.status !== 'coming_soon').length, color: 'text-indigo-400' },
          { label: 'Total Workers', value: totalWorkers, color: 'text-purple-400' },
          { label: 'Running Now', value: runningCount, color: runningCount > 0 ? 'text-yellow-400' : 'text-gray-500' },
          { label: 'Done Today', value: completedToday, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{loading ? '—' : s.value}</p>
            <p className="text-gray-500 text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          className="w-full max-w-sm px-4 py-2.5 rounded-lg bg-gray-900 border border-gray-800 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 text-sm"
          placeholder="Search agents, tools…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Agent cards */}
      <div className="space-y-3">
        {filtered.map(agent => (
          <AgentCard key={agent.id} agent={agent} runs={runs} onTest={handleTest} />
        ))}
        {filtered.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-500 text-sm">No agents match &quot;{search}&quot;</p>
          </div>
        )}
      </div>

      {/* Test log */}
      {testLog.length > 0 && (
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wider">Test Log</p>
          <div className="space-y-1.5">
            {testLog.map((t, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="text-gray-600">{t.time}</span>
                <code className="text-indigo-300">{t.endpoint}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
