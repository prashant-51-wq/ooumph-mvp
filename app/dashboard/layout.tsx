'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'

interface AgentRun {
  id: string
  agent_name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
  error_message?: string
}

const NAV_SECTIONS = [
  {
    label: null,
    items: [{ href: '/dashboard', label: 'Command Center', icon: '⚡' }],
  },
  {
    label: 'PLANNING',
    items: [
      { href: '/dashboard/onboarding', label: 'Onboarding', icon: '🚀' },
      { href: '/dashboard/strategy', label: 'Strategy', icon: '🧠' },
      { href: '/dashboard/content', label: 'Content Calendar', icon: '📅' },
      { href: '/dashboard/creative', label: 'Creative Studio', icon: '🎨' },
      { href: '/dashboard/research', label: 'Research Hub', icon: '🔍' },
      { href: '/dashboard/blog', label: 'Blog & Scripts', icon: '✍️' },
    ],
  },
  {
    label: 'CREATIVE STUDIO',
    items: [
      { href: '/dashboard/image-gen', label: 'AI Image Studio', icon: '🎨' },
      { href: '/dashboard/voiceover', label: 'Voiceover & Audio', icon: '🎙️' },
      { href: '/dashboard/media', label: 'Media Library', icon: '🖼️' },
    ],
  },
  {
    label: 'EXECUTION',
    items: [
      { href: '/dashboard/approvals', label: 'Approvals', icon: '✅' },
      { href: '/dashboard/campaign', label: 'Campaign Manager', icon: '📣' },
      { href: '/dashboard/growth', label: 'Growth Engine', icon: '📈' },
      { href: '/dashboard/email-marketing', label: 'Email Marketing', icon: '📧' },
      { href: '/dashboard/email-campaigns', label: 'Email Campaigns', icon: '📧' },
      { href: '/dashboard/repurpose', label: 'Content Repurpose', icon: '♻️' },
      { href: '/dashboard/publishing', label: 'Publishing Hub', icon: '🚀' },
      { href: '/dashboard/pr', label: 'PR Studio', icon: '📰' },
    ],
  },
  {
    label: 'LEADS & FUNNELS',
    items: [
      { href: '/dashboard/funnel', label: 'Funnel Plan', icon: '🔮' },
      { href: '/dashboard/leads', label: 'Lead Gen Plan', icon: '🎯' },
      { href: '/dashboard/leads-crm', label: 'Leads CRM', icon: '👥' },
      // Lead Enrichment — Apollo.io + Hunter.io powered enrichment for captured leads
      { href: '/dashboard/lead-enrichment', label: 'Lead Enrichment', icon: '🔍' },
    ],
  },
  {
    label: 'REPORTS & SYSTEM',
    items: [
      { href: '/dashboard/ab-test', label: 'A/B Testing', icon: '🧪' },
      { href: '/dashboard/analytics', label: 'Analytics', icon: '📊' },
      { href: '/dashboard/brand-monitor', label: 'Brand Monitor', icon: '👁️' },
      { href: '/dashboard/assets', label: 'Assets', icon: '✍️' },
      { href: '/dashboard/integrations', label: 'Integrations', icon: '🔗' },
      { href: '/dashboard/learning', label: 'AI Learning', icon: '🧬' },
      { href: '/dashboard/export', label: 'Export', icon: '📄' },
      { href: '/dashboard/memory', label: 'Brand Memory', icon: '🧠' },
      { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
]

const STATUS_ICON: Record<string, string> = {
  running: '⟳',
  completed: '✓',
  failed: '✕',
  pending: '○',
}
const STATUS_COLOR: Record<string, string> = {
  running: 'text-indigo-400 animate-spin',
  completed: 'text-green-400',
  failed: 'text-red-400',
  pending: 'text-gray-500',
}

function agentLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [businessName, setBusinessName] = useState('')
  const [userName, setUserName] = useState('')
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([])
  const [activityOpen, setActivityOpen] = useState(false)
  const [hasRunning, setHasRunning] = useState(false)

  useEffect(() => {
    setBusinessName(localStorage.getItem('businessName') || '')
    setUserName(localStorage.getItem('userName') || '')
  }, [])

  const loadRuns = useCallback(async () => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) return
    try {
      const res = await fetch(`/api/agent-runs?workspaceId=${wid}&limit=8`)
      const data: AgentRun[] = await res.json()
      setAgentRuns(data)
      setHasRunning(data.some(r => r.status === 'running'))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadRuns()
    const interval = setInterval(loadRuns, 8000)
    return () => clearInterval(interval)
  }, [loadRuns])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    localStorage.clear()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 border-r border-gray-800 flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-gray-800">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">O</div>
              <div>
                <span className="font-semibold text-white text-sm">Ooumph</span>
                <p className="text-xs text-gray-600 leading-none">AI Marketing OS</p>
              </div>
            </Link>
          </div>

          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {NAV_SECTIONS.map((section, si) => (
              <div key={si} className={si > 0 ? 'pt-3' : ''}>
                {section.label && (
                  <p className="px-3 py-1 text-xs font-semibold text-gray-600 uppercase tracking-wider">{section.label}</p>
                )}
                {section.items.map(item => {
                  const isActive = pathname === item.href
                  return (
                    <Link key={item.href} href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                      <span className="text-base">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* User info */}
          <div className="p-3 border-t border-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {(userName || businessName || 'O')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs font-medium truncate">{businessName || userName || 'Ooumph'}</p>
                <button onClick={logout} className="text-gray-600 hover:text-red-400 text-xs transition-colors">Sign out</button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Activity Status Bar */}
      <div className="border-t border-gray-800 bg-gray-950 flex-shrink-0">
        <div className="flex items-center h-9 px-4">
          <button
            onClick={() => setActivityOpen(!activityOpen)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${hasRunning ? 'bg-indigo-400 animate-pulse' : agentRuns.some(r => r.status === 'failed') ? 'bg-red-500' : 'bg-green-600'}`} />
            <span>
              {hasRunning
                ? `Running: ${agentRuns.filter(r => r.status === 'running').map(r => agentLabel(r.agent_name)).join(', ')}`
                : agentRuns.length > 0
                ? `Last: ${agentLabel(agentRuns[0]?.agent_name || '')} · ${agentRuns[0]?.status}`
                : 'No recent activity'
              }
            </span>
            <span className="ml-1 text-gray-700">{activityOpen ? '▴' : '▾'}</span>
          </button>

          <div className="ml-auto flex items-center gap-3">
            {agentRuns.slice(0, 4).map(run => (
              <span key={run.id} title={agentLabel(run.agent_name)} className={`text-xs ${STATUS_COLOR[run.status] || 'text-gray-500'}`}>
                <span className={run.status === 'running' ? 'inline-block animate-spin' : ''}>{STATUS_ICON[run.status]}</span>
                {' '}{agentLabel(run.agent_name).split(' ')[0]}
              </span>
            ))}
          </div>
        </div>

        {activityOpen && (
          <div className="border-t border-gray-800 px-4 py-3 space-y-1.5 max-h-48 overflow-y-auto">
            {agentRuns.length === 0 && <p className="text-gray-600 text-xs">No agent runs yet. Start generating content to see activity here.</p>}
            {agentRuns.map(run => (
              <div key={run.id} className="flex items-center gap-3">
                <span className={`text-xs w-4 text-center ${STATUS_COLOR[run.status]}`}>
                  {STATUS_ICON[run.status]}
                </span>
                <span className="text-gray-300 text-xs flex-1">{agentLabel(run.agent_name)}</span>
                <span className={`text-xs capitalize ${STATUS_COLOR[run.status]}`}>{run.status}</span>
                <span className="text-gray-600 text-xs">{new Date(run.created_at).toLocaleTimeString()}</span>
                {run.error_message && <span className="text-red-400 text-xs truncate max-w-xs">{run.error_message}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
