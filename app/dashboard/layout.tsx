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

// ── Primary nav (always visible) ─────────────────────────────────────────────
const PRIMARY_NAV = [
  { href: '/dashboard', label: 'Command Center', icon: '⚡' },
  { href: '/dashboard/strategy', label: 'Strategy', icon: '🧠' },
  { href: '/dashboard/content', label: 'Content Calendar', icon: '📅' },
  { href: '/dashboard/approvals', label: 'Approvals', icon: '✅' },
  { href: '/dashboard/agents', label: 'Agents', icon: '🤖' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
]

// ── Advanced nav (behind expander) ────────────────────────────────────────────
const ADVANCED_NAV = [
  {
    label: 'CONTENT',
    items: [
      { href: '/dashboard/blog', label: 'Blog & Scripts', icon: '✍️' },
      { href: '/dashboard/creative', label: 'Creative Studio', icon: '🎨' },
      { href: '/dashboard/image-gen', label: 'AI Image Studio', icon: '🖼️' },
      { href: '/dashboard/voiceover', label: 'Voiceover', icon: '🎙️' },
      { href: '/dashboard/video-gen', label: 'AI Video Studio', icon: '🎬' },
      { href: '/dashboard/repurpose', label: 'Content Repurpose', icon: '♻️' },
      { href: '/dashboard/pr', label: 'PR Studio', icon: '📰' },
    ],
  },
  {
    label: 'GROWTH',
    items: [
      { href: '/dashboard/leads', label: 'Lead Gen', icon: '🎯' },
      { href: '/dashboard/leads-crm', label: 'CRM', icon: '👥' },
      { href: '/dashboard/funnel', label: 'Funnel Plan', icon: '🔮' },
      { href: '/dashboard/email-marketing', label: 'Email', icon: '📧' },
      { href: '/dashboard/campaign', label: 'Campaigns', icon: '📣' },
      { href: '/dashboard/ads', label: 'Paid Ads', icon: '🎯' },
      { href: '/dashboard/growth', label: 'Growth Engine', icon: '📈' },
    ],
  },
  {
    label: 'MEDIA & PUBLISHING',
    items: [
      { href: '/dashboard/media', label: 'Media Library', icon: '🖼️' },
      { href: '/dashboard/publishing', label: 'Publishing Hub', icon: '🚀' },
      { href: '/dashboard/voice-ai', label: 'Voice AI', icon: '📞' },
      { href: '/dashboard/payments', label: 'Payments', icon: '💳' },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { href: '/dashboard/research', label: 'Research Hub', icon: '🔍' },
      { href: '/dashboard/analytics', label: 'Analytics', icon: '📊' },
      { href: '/dashboard/ab-test', label: 'A/B Testing', icon: '🧪' },
      { href: '/dashboard/brand-monitor', label: 'Brand Monitor', icon: '👁️' },
      { href: '/dashboard/memory', label: 'Brand Memory', icon: '🧠' },
      { href: '/dashboard/learning', label: 'AI Learning', icon: '🧬' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { href: '/dashboard/assets', label: 'Assets', icon: '📦' },
      { href: '/dashboard/export', label: 'Export', icon: '📄' },
      { href: '/dashboard/onboarding', label: 'Onboarding', icon: '🚀' },
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
  running: 'text-indigo-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  pending: 'text-gray-500',
}

function agentLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function NavItem({ href, label, icon, isActive }: { href: string; label: string; icon: string; isActive: boolean }) {
  return (
    <Link href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
      <span className="text-base flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  )
}

function SidebarContent({
  pathname,
  businessName,
  userName,
  advancedOpen,
  setAdvancedOpen,
  logout,
}: {
  pathname: string
  businessName: string
  userName: string
  advancedOpen: boolean
  setAdvancedOpen: (v: boolean) => void
  logout: () => void
}) {
  return (
    <>
      {/* Logo */}
      <div className="p-4 border-b border-gray-800 flex-shrink-0">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">O</div>
          <div className="min-w-0">
            <span className="font-semibold text-white text-sm">Ooumph</span>
            <p className="text-xs text-gray-600 leading-none">AI Marketing OS</p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {/* Primary items */}
        {PRIMARY_NAV.map(item => (
          <NavItem key={item.href} {...item} isActive={pathname === item.href} />
        ))}

        {/* Advanced expander */}
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors mt-1">
          <span className="text-base">⚙</span>
          <span className="flex-1 text-left">Advanced</span>
          <span className="text-xs">{advancedOpen ? '▴' : '▾'}</span>
        </button>

        {advancedOpen && (
          <div className="space-y-0.5">
            {ADVANCED_NAV.map(section => (
              <div key={section.label} className="pt-2">
                <p className="px-3 py-1 text-xs font-semibold text-gray-600 uppercase tracking-wider">{section.label}</p>
                {section.items.map(item => (
                  <NavItem key={item.href} {...item} isActive={pathname === item.href} />
                ))}
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-gray-800 flex-shrink-0">
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
    </>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [businessName, setBusinessName] = useState('')
  const [userName, setUserName] = useState('')
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([])
  const [activityOpen, setActivityOpen] = useState(false)
  const [hasRunning, setHasRunning] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

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

  const sidebarProps = { pathname, businessName, userName, advancedOpen, setAdvancedOpen, logout }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950 flex-shrink-0">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">O</div>
          <span className="font-semibold text-white text-sm">Ooumph</span>
        </Link>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
          <span className="text-lg">{mobileMenuOpen ? '✕' : '☰'}</span>
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 w-64 bg-gray-950 border-r border-gray-800 flex flex-col h-full">
            <SidebarContent {...sidebarProps} />
          </aside>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-56 border-r border-gray-800 flex-col flex-shrink-0">
          <SidebarContent {...sidebarProps} />
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
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasRunning ? 'bg-indigo-400 animate-pulse' : agentRuns.some(r => r.status === 'failed') ? 'bg-red-500' : 'bg-green-600'}`} />
            <span className="truncate max-w-xs">
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
              <span key={run.id} title={agentLabel(run.agent_name)} className={`text-xs hidden sm:inline ${STATUS_COLOR[run.status] || 'text-gray-500'}`}>
                <span>{STATUS_ICON[run.status]}</span>
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
                <span className={`text-xs w-4 text-center ${STATUS_COLOR[run.status]}`}>{STATUS_ICON[run.status]}</span>
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
