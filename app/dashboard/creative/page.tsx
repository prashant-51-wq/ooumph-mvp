'use client'

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentStatus = 'Active' | 'Idle' | 'Error' | 'Rate Limited'
type MainTab = 'agents' | 'mcp' | 'brand' | 'automation'

interface CreativeAgent {
  id: string
  name: string
  icon: string
  model: string
  status: AgentStatus
  todayCount: number
  todayUnit: string
  monthCount: number
  apiStatus: 'configured' | 'shared' | 'missing'
  color: string
  providers: string[]
}

interface McpTool {
  id: string
  name: string
  description: string
  category: string
  initial: string
  color: string
  connected: boolean
  lastUsed?: string
  callsThisMonth?: number
  cost?: string
}

interface AutoRule {
  id: string
  trigger: string
  action: string
  enabled: boolean
  lastTriggered: string
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const AGENTS: CreativeAgent[] = [
  { id: 'image', name: 'Image Agent', icon: '🖼️', model: 'DALL-E 3', status: 'Active', todayCount: 24, todayUnit: 'images', monthCount: 412, apiStatus: 'configured', color: 'indigo', providers: ['OpenAI', 'Stability AI', 'Midjourney'] },
  { id: 'video', name: 'Video Agent', icon: '🎬', model: 'Kling 2.0', status: 'Active', todayCount: 3, todayUnit: 'videos', monthCount: 47, apiStatus: 'shared', color: 'rose', providers: ['Kling', 'Runway ML', 'Pika Labs'] },
  { id: 'copy', name: 'Copy Agent', icon: '✍️', model: 'Claude 3.5', status: 'Active', todayCount: 47, todayUnit: 'pieces', monthCount: 891, apiStatus: 'configured', color: 'violet', providers: ['Anthropic', 'OpenAI', 'Mistral'] },
  { id: 'design', name: 'Design Agent', icon: '🎨', model: 'GPT-4o', status: 'Active', todayCount: 12, todayUnit: 'designs', monthCount: 203, apiStatus: 'configured', color: 'amber', providers: ['OpenAI', 'Gemini', 'Claude'] },
  { id: 'voice', name: 'Voiceover Agent', icon: '🎙️', model: 'ElevenLabs', status: 'Active', todayCount: 8, todayUnit: 'clips', monthCount: 134, apiStatus: 'shared', color: 'green', providers: ['ElevenLabs', 'OpenAI TTS', 'PlayHT'] },
  { id: 'brand', name: 'Brand Agent', icon: '🏷️', model: 'Claude 3.5', status: 'Idle', todayCount: 2, todayUnit: 'analyses', monthCount: 28, apiStatus: 'configured', color: 'cyan', providers: ['Anthropic', 'OpenAI'] },
]

const MCP_TOOLS: McpTool[] = [
  { id: 'stability', name: 'Stability AI', description: 'High-quality image generation via Stable Diffusion', category: 'Image', initial: 'S', color: 'bg-purple-600', connected: false },
  { id: 'runway', name: 'Runway ML', description: 'AI-powered video generation and editing', category: 'Video', initial: 'R', color: 'bg-rose-600', connected: false },
  { id: 'heygen', name: 'HeyGen', description: 'AI avatar video creation at scale', category: 'Video', initial: 'H', color: 'bg-blue-600', connected: false },
  { id: 'pika', name: 'Pika Labs', description: 'Text-to-video and image-to-video generation', category: 'Video', initial: 'P', color: 'bg-pink-600', connected: false },
  { id: 'replicate', name: 'Replicate', description: 'Run open-source ML models in the cloud', category: 'Image', initial: 'Re', color: 'bg-gray-600', connected: false },
  { id: 'elevenlabs', name: 'Eleven Labs', description: 'Ultra-realistic AI voice generation', category: 'Audio', initial: 'E', color: 'bg-yellow-600', connected: true, lastUsed: '2h ago', callsThisMonth: 312, cost: '$4.20' },
  { id: 'fal', name: 'Fal.ai', description: 'Ultra-fast image generation at low cost', category: 'Image', initial: 'F', color: 'bg-indigo-600', connected: false },
  { id: 'together', name: 'Together AI', description: 'Open-source LLMs including Llama and Mixtral', category: 'LLM', initial: 'T', color: 'bg-green-600', connected: false },
  { id: 'perplexity', name: 'Perplexity', description: 'AI-powered research and web search agent', category: 'Research', initial: 'Px', color: 'bg-teal-600', connected: false },
  { id: 'firecrawl', name: 'Firecrawl', description: 'Web scraping and data extraction at scale', category: 'Data', initial: 'Fc', color: 'bg-orange-600', connected: false },
  { id: 'make', name: 'Make.com', description: 'Visual automation platform with 1000+ integrations', category: 'Automation', initial: 'M', color: 'bg-violet-600', connected: false },
  { id: 'zapier', name: 'Zapier', description: 'Connect apps and automate workflows', category: 'Automation', initial: 'Z', color: 'bg-amber-600', connected: false },
]

const AUTO_RULES: AutoRule[] = [
  { id: '1', trigger: 'New product is added to catalog', action: 'Auto-generate 5 product images in brand style', enabled: true, lastTriggered: '2 days ago' },
  { id: '2', trigger: 'Blog post is published', action: 'Auto-generate social graphics for Instagram + LinkedIn', enabled: true, lastTriggered: '5 hours ago' },
  { id: '3', trigger: 'Campaign is launched', action: 'Auto-create 15s video teaser and story cover', enabled: false, lastTriggered: '1 week ago' },
]

const STATUS_COLORS: Record<AgentStatus, string> = {
  Active: 'bg-green-500/20 text-green-400 border-green-500/30',
  Idle: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Error: 'bg-red-500/20 text-red-400 border-red-500/30',
  'Rate Limited': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
}

const DOT_COLORS: Record<AgentStatus, string> = {
  Active: 'bg-green-400',
  Idle: 'bg-yellow-400',
  Error: 'bg-red-400',
  'Rate Limited': 'bg-orange-400',
}

const AGENT_COLORS: Record<string, string> = {
  indigo: 'from-indigo-500 to-indigo-700',
  rose: 'from-rose-500 to-rose-700',
  violet: 'from-violet-500 to-violet-700',
  amber: 'from-amber-500 to-amber-700',
  green: 'from-green-500 to-green-700',
  cyan: 'from-cyan-500 to-cyan-700',
}

const CATEGORY_COLORS: Record<string, string> = {
  Image: 'bg-purple-900/30 text-purple-400',
  Video: 'bg-rose-900/30 text-rose-400',
  Audio: 'bg-yellow-900/30 text-yellow-400',
  LLM: 'bg-blue-900/30 text-blue-400',
  Research: 'bg-teal-900/30 text-teal-400',
  Data: 'bg-orange-900/30 text-orange-400',
  Automation: 'bg-violet-900/30 text-violet-400',
}

const BRAND_COLORS = [
  { hex: '#6366F1', name: 'Indigo Primary' },
  { hex: '#8B5CF6', name: 'Violet Secondary' },
  { hex: '#1F2937', name: 'Dark Background' },
  { hex: '#F9FAFB', name: 'Off White' },
  { hex: '#10B981', name: 'Accent Green' },
]

const BRAND_TAGS = ['Professional', 'Warm', 'Bold', 'Innovative', 'Trustworthy']

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreativeStudioPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('agents')
  const [showMcpMarketplace, setShowMcpMarketplace] = useState(false)
  const [mcpTools, setMcpTools] = useState<McpTool[]>(MCP_TOOLS)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [agentModels, setAgentModels] = useState<Record<string, string>>(
    Object.fromEntries(AGENTS.map(a => [a.id, a.model]))
  )
  const [autoRules, setAutoRules] = useState<AutoRule[]>(AUTO_RULES)
  const [showRuleBuilder, setShowRuleBuilder] = useState(false)
  const [showDestSettings, setShowDestSettings] = useState(false)
  const [testingAgent, setTestingAgent] = useState<string | null>(null)
  const [applyingBrand, setApplyingBrand] = useState(false)
  const [brandApplied, setBrandApplied] = useState(false)

  function toggleMcp(id: string) {
    setMcpTools(prev => prev.map(t => t.id === id ? { ...t, connected: !t.connected } : t))
  }

  function toggleRule(id: string) {
    setAutoRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }

  async function testAgent(id: string) {
    setTestingAgent(id)
    await new Promise(r => setTimeout(r, 1800))
    setTestingAgent(null)
  }

  async function applyBrandToAll() {
    setApplyingBrand(true)
    await new Promise(r => setTimeout(r, 2000))
    setApplyingBrand(false)
    setBrandApplied(true)
    setTimeout(() => setBrandApplied(false), 3000)
  }

  const tabs: { id: MainTab; label: string; icon: string }[] = [
    { id: 'agents', label: 'Creative Agents', icon: '🤖' },
    { id: 'mcp', label: 'MCP Marketplace', icon: '🧩' },
    { id: 'brand', label: 'Brand Guidelines', icon: '🎨' },
    { id: 'automation', label: 'Automation', icon: '⚡' },
  ]

  const connectedCount = mcpTools.filter(t => t.connected).length

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center text-sm">🎨</div>
            <h1 className="text-2xl font-bold text-white">Creative Studio</h1>
          </div>
          <p className="text-gray-400 text-sm ml-11">Empower your AI creative agents</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Agent status dots */}
          <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2">
            {AGENTS.map(a => (
              <div key={a.id} title={`${a.name}: ${a.status}`} className={`w-2.5 h-2.5 rounded-full ${DOT_COLORS[a.status]}`} />
            ))}
            <span className="text-gray-500 text-xs ml-1.5">6 agents</span>
          </div>
          <button
            onClick={() => setShowMcpMarketplace(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            🧩 MCP Marketplace
            {connectedCount > 0 && (
              <span className="bg-indigo-500 text-white text-xs px-1.5 py-0.5 rounded-full">{connectedCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 mb-6">
        <div className="flex gap-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Creative Agents ──────────────────────────────────────────────── */}
      {activeTab === 'agents' && (
        <div className="grid grid-cols-2 gap-4">
          {AGENTS.map(agent => (
            <div key={agent.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${AGENT_COLORS[agent.color]} flex items-center justify-center text-lg`}>
                      {agent.icon}
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-sm">{agent.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[agent.status]}`}>
                          {agent.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold text-lg">{agent.todayCount}</p>
                    <p className="text-gray-500 text-xs">{agent.todayUnit} today</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  {/* Model */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 text-xs">Model</span>
                    <div className="flex items-center gap-2">
                      {expandedAgent === agent.id ? (
                        <select
                          value={agentModels[agent.id]}
                          onChange={e => setAgentModels(prev => ({ ...prev, [agent.id]: e.target.value }))}
                          className="text-xs bg-gray-800 border border-gray-700 text-white px-2 py-1 rounded-lg focus:outline-none focus:border-indigo-500"
                        >
                          {agent.providers.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      ) : (
                        <>
                          <span className="text-gray-300 text-xs font-medium">{agentModels[agent.id]}</span>
                          <button
                            onClick={() => setExpandedAgent(agent.id)}
                            className="text-indigo-400 text-xs hover:text-indigo-300"
                          >
                            Change
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 text-xs">This month</span>
                    <span className="text-gray-300 text-xs font-medium">{agent.monthCount.toLocaleString()} {agent.todayUnit}</span>
                  </div>

                  {/* API status */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 text-xs">API key</span>
                    <span className={`text-xs font-medium ${
                      agent.apiStatus === 'configured' ? 'text-green-400' :
                      agent.apiStatus === 'shared' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {agent.apiStatus === 'configured' ? '✅ Configured' :
                       agent.apiStatus === 'shared' ? '⚠ Shared key' : '❌ Not set'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                  className="w-full text-sm border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white py-2 rounded-xl transition-colors"
                >
                  {expandedAgent === agent.id ? 'Close Settings' : 'Configure'}
                </button>
              </div>

              {/* Expanded settings */}
              {expandedAgent === agent.id && (
                <div className="border-t border-gray-800 bg-gray-950/50 p-5 space-y-4">
                  <div>
                    <label className="text-gray-400 text-xs mb-1.5 block">API Provider</label>
                    <select className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500">
                      {agent.providers.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1.5 block">API Key</label>
                    <input
                      type="password"
                      placeholder="sk-••••••••••••••••••••"
                      className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1.5 block flex items-center justify-between">
                      <span>Max requests per day</span>
                      <span className="text-white">500</span>
                    </label>
                    <input type="range" min={50} max={2000} defaultValue={500} className="w-full accent-indigo-500" />
                    <div className="flex justify-between text-gray-600 text-xs mt-1">
                      <span>50</span><span>2,000</span>
                    </div>
                  </div>
                  <button
                    onClick={() => testAgent(agent.id)}
                    disabled={testingAgent === agent.id}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm py-2 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {testingAgent === agent.id ? (
                      <><Spinner /> Testing...</>
                    ) : '🧪 Test Agent'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: MCP Marketplace ──────────────────────────────────────────────── */}
      {activeTab === 'mcp' && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-white font-semibold">MCP Marketplace</h2>
              <p className="text-gray-500 text-xs mt-0.5">Connect external AI tools to supercharge your creative agents</p>
            </div>
            <span className="text-gray-400 text-sm">{connectedCount} connected</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {mcpTools.map(tool => (
              <div key={tool.id} className={`bg-gray-900 border rounded-2xl p-5 transition-all ${tool.connected ? 'border-indigo-500/50' : 'border-gray-800'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${tool.color} flex items-center justify-center text-white font-bold text-sm`}>
                      {tool.initial}
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-sm">{tool.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[tool.category] || 'bg-gray-800 text-gray-400'}`}>
                        {tool.category}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-400 text-xs leading-relaxed mb-4">{tool.description}</p>

                {tool.connected && tool.lastUsed && (
                  <div className="bg-gray-800/60 rounded-xl p-3 mb-3 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-gray-500">Last used</span><span className="text-gray-300">{tool.lastUsed}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Calls this month</span><span className="text-gray-300">{tool.callsThisMonth?.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Cost</span><span className="text-green-400">{tool.cost}</span></div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => toggleMcp(tool.id)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                      tool.connected
                        ? 'bg-red-900/30 border border-red-800/50 text-red-400 hover:bg-red-900/50'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {tool.connected ? 'Disconnect' : 'Connect'}
                  </button>
                  <button className="px-3 py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors">
                    Docs
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Brand Guidelines ─────────────────────────────────────────────── */}
      {activeTab === 'brand' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">Brand Guidelines</h2>
              <p className="text-gray-500 text-xs mt-0.5">Last updated 3 days ago by CMO Agent</p>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white rounded-xl text-sm transition-colors">
                📄 Export PDF
              </button>
              <button
                onClick={applyBrandToAll}
                disabled={applyingBrand}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
              >
                {applyingBrand ? <><Spinner /> Applying...</> : brandApplied ? '✅ Applied!' : '✨ Apply to All Agents'}
              </button>
            </div>
          </div>

          {/* Colors */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-sm">Brand Colors</h3>
              <button className="text-indigo-400 text-xs hover:text-indigo-300">+ Add Color</button>
            </div>
            <div className="flex gap-4">
              {BRAND_COLORS.map(c => (
                <div key={c.hex} className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-xl border-2 border-gray-700 cursor-pointer hover:border-gray-500 transition-colors" style={{ backgroundColor: c.hex }} />
                  <p className="text-white text-xs font-mono">{c.hex}</p>
                  <p className="text-gray-500 text-xs text-center">{c.name}</p>
                </div>
              ))}
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center cursor-pointer hover:border-gray-500 transition-colors">
                  <span className="text-gray-600 text-xl">+</span>
                </div>
              </div>
            </div>
          </div>

          {/* Typography */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Typography</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-gray-500 text-xs mb-2">Primary Font</p>
                <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-white text-sm font-medium">Inter</span>
                  <button className="text-gray-500 hover:text-white text-xs">Change</button>
                </div>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-2">Secondary Font</p>
                <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-white text-sm font-medium">Playfair Display</span>
                  <button className="text-gray-500 hover:text-white text-xs">Change</button>
                </div>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-2">Header Style</p>
                <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <span className="text-white text-sm font-medium">Bold + Uppercase</span>
                  <button className="text-gray-500 hover:text-white text-xs">Edit</button>
                </div>
              </div>
            </div>
          </div>

          {/* Voice & Tone */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Voice & Tone</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {BRAND_TAGS.map(tag => (
                <span key={tag} className="px-3 py-1.5 bg-indigo-900/30 border border-indigo-700/40 text-indigo-300 text-sm rounded-full">
                  {tag}
                </span>
              ))}
              <button className="px-3 py-1.5 border border-dashed border-gray-700 text-gray-500 hover:text-white text-sm rounded-full transition-colors">
                + Add
              </button>
            </div>
            <p className="text-gray-500 text-xs">These adjectives guide all AI-generated copy across agents</p>
          </div>

          {/* Logo Uploads */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Logo Assets</h3>
            <div className="grid grid-cols-3 gap-4">
              {['Primary Logo', 'Secondary Logo', 'Icon Only'].map(label => (
                <div
                  key={label}
                  className="border-2 border-dashed border-gray-700 hover:border-indigo-600 rounded-xl p-6 text-center cursor-pointer transition-colors group"
                >
                  <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">🖼️</div>
                  <p className="text-gray-400 text-sm font-medium">{label}</p>
                  <p className="text-gray-600 text-xs mt-1">Click or drag to upload</p>
                </div>
              ))}
            </div>
          </div>

          {/* Version history */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-3">Version History</h3>
            <div className="space-y-2">
              {[
                { label: 'v3 — Colors + fonts updated', by: 'CMO Agent', time: '3 days ago', current: true },
                { label: 'v2 — Voice & tone added', by: 'You', time: '2 weeks ago', current: false },
                { label: 'v1 — Initial brand kit', by: 'You', time: '1 month ago', current: false },
              ].map(v => (
                <div key={v.label} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    {v.current && <span className="w-2 h-2 rounded-full bg-green-400" />}
                    {!v.current && <span className="w-2 h-2 rounded-full bg-gray-600" />}
                    <div>
                      <p className="text-gray-300 text-xs font-medium">{v.label}</p>
                      <p className="text-gray-600 text-xs">by {v.by}</p>
                    </div>
                  </div>
                  <span className="text-gray-500 text-xs">{v.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Automation ───────────────────────────────────────────────────── */}
      {activeTab === 'automation' && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-white font-semibold">Creative Automation Rules</h2>
              <p className="text-gray-500 text-xs mt-0.5">Trigger AI creative generation automatically based on events</p>
            </div>
            <button
              onClick={() => setShowRuleBuilder(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              + Add Rule
            </button>
          </div>

          <div className="space-y-3">
            {autoRules.map(rule => (
              <div key={rule.id} className={`bg-gray-900 border rounded-2xl p-5 transition-colors ${rule.enabled ? 'border-gray-800' : 'border-gray-800/50 opacity-60'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-lg font-mono">IF</span>
                      <span className="text-white text-sm font-medium">{rule.trigger}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs bg-indigo-900/40 text-indigo-400 px-2 py-1 rounded-lg font-mono">THEN</span>
                      <span className="text-gray-300 text-sm">{rule.action}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-gray-600 text-xs">Last: {rule.lastTriggered}</span>
                    <button className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-gray-800 transition-colors text-xs">✏️</button>
                    <button className="p-2 text-gray-500 hover:text-green-400 rounded-lg hover:bg-gray-800 transition-colors text-xs" title="Run now">▶</button>
                    {/* Toggle */}
                    <button
                      onClick={() => toggleRule(rule.id)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${rule.enabled ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${rule.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* How automation works */}
          <div className="mt-6 bg-indigo-900/10 border border-indigo-800/30 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-3">How Automation Works</h3>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {['Event Triggered', 'Agent Assigned', 'Content Generated', 'Sent to Approvals', 'Published'].map((step, i, arr) => (
                <>
                  <div key={step} className="flex-shrink-0 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-300">
                    {step}
                  </div>
                  {i < arr.length - 1 && <span key={`arrow-${i}`} className="text-gray-600 flex-shrink-0">→</span>}
                </>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MCP Marketplace Full Modal ────────────────────────────────────────── */}
      {showMcpMarketplace && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <div>
                <h2 className="text-white font-bold text-lg">🧩 MCP Marketplace</h2>
                <p className="text-gray-400 text-sm mt-0.5">Connect open-source AI tools to extend your agents</p>
              </div>
              <button onClick={() => setShowMcpMarketplace(false)} className="text-gray-500 hover:text-white text-2xl leading-none p-1">×</button>
            </div>
            <div className="p-6 grid grid-cols-3 gap-4">
              {mcpTools.map(tool => (
                <div key={tool.id} className={`bg-gray-950 border rounded-xl p-4 ${tool.connected ? 'border-indigo-500/40' : 'border-gray-800'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-lg ${tool.color} flex items-center justify-center text-white font-bold text-xs`}>{tool.initial}</div>
                    <div>
                      <p className="text-white font-medium text-sm">{tool.name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[tool.category] || 'bg-gray-800 text-gray-400'}`}>{tool.category}</span>
                    </div>
                  </div>
                  <p className="text-gray-500 text-xs mb-3">{tool.description}</p>
                  <button
                    onClick={() => toggleMcp(tool.id)}
                    className={`w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      tool.connected
                        ? 'bg-green-900/30 border border-green-800/50 text-green-400'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {tool.connected ? '✅ Connected' : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Rule Builder Modal ────────────────────────────────────────────────── */}
      {showRuleBuilder && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-white font-bold">Build Automation Rule</h2>
              <button onClick={() => setShowRuleBuilder(false)} className="text-gray-500 hover:text-white text-2xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block font-medium">TRIGGER — When this happens...</label>
                <select className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-indigo-500">
                  <option>New product is added to catalog</option>
                  <option>Blog post is published</option>
                  <option>Campaign is created</option>
                  <option>Campaign is launched</option>
                  <option>Weekly report is generated</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block font-medium">CONDITION (optional)</label>
                <input
                  placeholder="e.g. Only if product category = clothing"
                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-600"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block font-medium">ACTION — Do this automatically</label>
                <select className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-indigo-500">
                  <option>Generate 5 product images</option>
                  <option>Create social media graphics (Instagram + LinkedIn)</option>
                  <option>Create video teaser (15s)</option>
                  <option>Generate email newsletter</option>
                  <option>Create blog post summary</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setAutoRules(prev => [...prev, {
                      id: String(Date.now()),
                      trigger: 'New product is added to catalog',
                      action: 'Generate 5 product images',
                      enabled: true,
                      lastTriggered: 'Never',
                    }])
                    setShowRuleBuilder(false)
                  }}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium"
                >
                  Create Rule
                </button>
                <button onClick={() => setShowRuleBuilder(false)} className="flex-1 border border-gray-700 text-gray-400 hover:text-white py-2.5 rounded-xl text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
