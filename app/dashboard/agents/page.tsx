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
  // ── Sprint 3: Sales, Retargeting, Scheduling, Branding ──────────────────────
  {
    id: 'sales',
    name: 'Sales Supervisor',
    icon: '💼',
    description: 'Full sales intelligence stack: pipeline analysis, AI proposals, multi-channel outreach sequences, deal scoring, revenue forecasting, demo scripts, and win/loss analysis.',
    endpoint: '/api/agents/sales',
    status: 'active',
    tools: ['Claude Sonnet', 'Brave Search', 'PostgreSQL'],
    workers: [
      { id: 'pipeline', name: 'Pipeline Manager', icon: '📊', description: 'CRUD for deals across 6 pipeline stages with auto-probability updates and stage-change activity logging.', endpoint: '/api/agents/sales/pipeline', tools: ['Claude Sonnet'] },
      { id: 'proposal', name: 'Proposal Writer', icon: '📄', description: 'Generates complete HTML sales proposals with pricing tiers, ROI callouts, social proof, and a print-ready layout.', endpoint: '/api/agents/sales/proposal', tools: ['Claude Sonnet'] },
      { id: 'outreach', name: 'Outreach Sequencer', icon: '📬', description: 'Builds cold/warm/enterprise/win-back multi-channel sequences (email + LinkedIn + phone) with A/B subject variants.', endpoint: '/api/agents/sales/outreach', tools: ['Claude Sonnet'] },
      { id: 'deal', name: 'Deal Analyzer', icon: '🔍', description: 'AI deal health scoring 0–100, win probability, blocker identification, and recommended next action with urgency level.', endpoint: '/api/agents/sales/deal', tools: ['Claude Sonnet'] },
      { id: 'forecast', name: 'Revenue Forecaster', icon: '📈', description: 'Best/committed/realistic/worst-case forecast with 3-month monthly projection and pipeline risk analysis.', endpoint: '/api/agents/sales/forecast', tools: ['Claude Sonnet', 'Brave Search'] },
      { id: 'demo-script', name: 'Demo Script Writer', icon: '🎬', description: 'Personalized 25-minute demo script: discovery questions, step-by-step flow, objection handlers, and closing CTA.', endpoint: '/api/agents/sales/demo-script', tools: ['Claude Sonnet'] },
      { id: 'objections', name: 'Objection Playbook', icon: '🛡️', description: 'Generates 10 objection handlers with exact conversational responses and named psychology tactics.', endpoint: '/api/agents/sales/objections', tools: ['Claude Sonnet'] },
      { id: 'win-loss', name: 'Win/Loss Analyst', icon: '⚖️', description: 'Mines closed deals for patterns: top win factors, loss reasons, segment insights, and top-3 win-rate recommendations.', endpoint: '/api/agents/sales/win-loss', tools: ['Claude Sonnet'] },
    ],
  },
  {
    id: 'retargeting',
    name: 'Retargeting Supervisor',
    icon: '🎯',
    description: 'Full retargeting intelligence: RFM audience segmentation, campaign blueprints, lookalike strategies, abandoned journey recovery, warm-audience copy, and pixel implementation.',
    endpoint: '/api/agents/retargeting',
    status: 'active',
    tools: ['Claude Sonnet', 'Meta Ads API', 'Google Ads API', 'PostgreSQL'],
    workers: [
      { id: 'audiences', name: 'Audience Segmenter', icon: '👥', description: 'Analyzes real lead data (score tiers, sources, statuses) to create 5–8 precise retargeting segments with per-platform instructions.', endpoint: '/api/agents/retargeting/audiences', tools: ['Claude Sonnet'] },
      { id: 'campaigns', name: 'Campaign Builder', icon: '📢', description: 'Full retargeting campaign blueprint: creative directions with actual copy, frequency caps, exclusions, and estimated ROAS.', endpoint: '/api/agents/retargeting/campaigns', tools: ['Claude Sonnet'] },
      { id: 'lookalike', name: 'Lookalike Creator', icon: '🪞', description: 'Seed-quality-aware lookalike strategy with real source size from DB and step-by-step creation guides for Meta, Google, and LinkedIn.', endpoint: '/api/agents/retargeting/lookalike', tools: ['Claude Sonnet'] },
      { id: 'copy', name: 'Ad Copy Writer', icon: '✍️', description: 'Writes 5–6 psychologically distinct warm-audience copy angles per segment × platform, avoiding previous messaging.', endpoint: '/api/agents/retargeting/copy', tools: ['Claude Sonnet'] },
      { id: 'pixel', name: 'Pixel Strategist', icon: '🔧', description: 'GTM-ready pixel event mapping with actual fbq()/gtag()/lintrk() code snippets and audience-building recommendations.', endpoint: '/api/agents/retargeting/pixel', tools: ['Claude Sonnet'] },
      { id: 'abandoned', name: 'Abandoned Journey Mapper', icon: '🗺️', description: 'Maps funnel drop-off stages with recovery strategies, actual ad copy per stage, and estimated monthly revenue recovery.', endpoint: '/api/agents/retargeting/abandoned', tools: ['Claude Sonnet'] },
    ],
  },
  {
    id: 'scheduling',
    name: 'Scheduling Supervisor',
    icon: '🗓️',
    description: 'Intelligent content scheduling: optimal time analysis, calendar auditing, smart batch scheduling with platform gap enforcement, recurring templates, and multi-timezone optimization.',
    endpoint: '/api/agents/scheduling',
    status: 'active',
    tools: ['Claude Sonnet', 'Brave Search', 'PostgreSQL'],
    workers: [
      { id: 'optimal-times', name: 'Optimal Times Analyzer', icon: '⏰', description: 'Evidence-based optimal posting slots per platform using historical data, platform algorithm patterns, and audience timezone.', endpoint: '/api/agents/scheduling/optimal-times', tools: ['Claude Sonnet'] },
      { id: 'queue', name: 'Queue Manager', icon: '📋', description: 'Full schedule queue CRUD with smart-add that finds next gap-compliant optimal slot automatically.', endpoint: '/api/agents/scheduling/queue', tools: ['Claude Sonnet'] },
      { id: 'audit', name: 'Calendar Auditor', icon: '🔍', description: 'Calendar health score with gap days, overload detection, platform balance, streak analysis, and best day/hour metrics.', endpoint: '/api/agents/scheduling/audit', tools: ['Claude Sonnet'] },
      { id: 'recurring', name: 'Recurring Schedule Builder', icon: '🔄', description: 'Designs a sustainable recurring template and expands it to 4 weeks of concrete DB-ready posting slots.', endpoint: '/api/agents/scheduling/recurring', tools: ['Claude Sonnet'] },
      { id: 'timezone', name: 'Timezone Optimizer', icon: '🌍', description: 'Finds UTC posting windows that maximize simultaneous audience coverage across multiple target markets.', endpoint: '/api/agents/scheduling/timezone', tools: ['Claude Sonnet'] },
    ],
  },
  {
    id: 'branding',
    name: 'Branding Supervisor',
    icon: '🎨',
    description: 'Complete brand identity system: full identity with archetype + colors + typography + logo, voice guide, visual guidelines, brand story, taglines, MVV, and consistency auditing.',
    endpoint: '/api/agents/branding',
    status: 'active',
    tools: ['Claude Sonnet', 'DALL-E 3', 'Google Fonts'],
    workers: [
      { id: 'identity', name: 'Brand Identity Builder', icon: '🏛️', description: 'Full brand identity: archetype, color palette, typography, logo direction, DALL-E prompt, and brand summary in one output.', endpoint: '/api/agents/branding/identity', tools: ['Claude Sonnet'] },
      { id: 'voice', name: 'Brand Voice Guide', icon: '🗣️', description: 'Comprehensive voice guide with vocabulary lists, Do/Not-This examples, emoji policy, and content test mode (scores 0–100).', endpoint: '/api/agents/branding/voice', tools: ['Claude Sonnet'] },
      { id: 'visual', name: 'Visual Style Guide', icon: '👁️', description: 'Art director spec for all platforms: logo usage rules, color combinations with WCAG ratios, typography scale, image style.', endpoint: '/api/agents/branding/visual', tools: ['Claude Sonnet'] },
      { id: 'logo', name: 'Logo Generator', icon: '✨', description: 'Generates a logo concept via DALL-E 3. Falls back gracefully with a ready-to-use prompt if OPENAI_API_KEY is not set.', endpoint: '/api/agents/branding/logo', tools: ['DALL-E 3'] },
      { id: 'colors', name: 'Color Palette Generator', icon: '🎨', description: 'Generates a brand color palette with CSS custom properties, Tailwind config snippet, and WCAG contrast ratios.', endpoint: '/api/agents/branding/colors', tools: ['Claude Sonnet'] },
      { id: 'typography', name: 'Typography System', icon: '🔤', description: 'Designs a complete type system with real Google Fonts, fluid clamp() sizes, and a copy-paste CSS block.', endpoint: '/api/agents/branding/typography', tools: ['Claude Sonnet', 'Google Fonts'] },
      { id: 'story', name: 'Brand Story Writer', icon: '📖', description: 'Writes 4 brand story formats: full narrative (~500 words), elevator pitch (30 sec), press paragraph, and hero story.', endpoint: '/api/agents/branding/story', tools: ['Claude Sonnet'] },
      { id: 'taglines', name: 'Tagline Generator', icon: '💬', description: 'Generates 10 taglines across 9 creative angles with per-tagline rationale, SEO version, and short-form badge copy.', endpoint: '/api/agents/branding/taglines', tools: ['Claude Sonnet'] },
      { id: 'consistency', name: 'Consistency Auditor', icon: '✅', description: '7-point brand audit: tone, vocabulary, messaging, prohibited claims, clarity, CTA, and audience relevance with specific quotes.', endpoint: '/api/agents/branding/consistency', tools: ['Claude Sonnet'] },
      { id: 'mvv', name: 'Mission / Vision / Values', icon: '🧭', description: 'Generates Mission, Vision, Values (with behavioral descriptions), and Purpose. Writes back to brand profile automatically.', endpoint: '/api/agents/branding/mvv', tools: ['Claude Sonnet'] },
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
