'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'

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
  { href: '/dashboard', label: 'CMO Dashboard', icon: '⚡' },
  { href: '/dashboard/activity', label: 'Workspace', icon: '💡' },
  { href: '/dashboard/inbox', label: 'Inbox', icon: '📬' },
  { href: '/dashboard/calendar', label: 'Calendar', icon: '📅' },
  { href: '/dashboard/workflows', label: 'Workflows', icon: '⚡' },
  { href: '/dashboard/strategy', label: 'Strategy', icon: '🧠' },
  { href: '/dashboard/content', label: 'Content Calendar', icon: '📅' },
  { href: '/dashboard/approvals', label: 'Approvals', icon: '✅' },
  { href: '/dashboard/agents', label: 'Agents', icon: '🤖' },
  { href: '/dashboard/connections', label: 'Connections', icon: '🔗' },
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
      { href: '/dashboard/inbox', label: 'Unified Inbox', icon: '📬' },
      { href: '/dashboard/workflows', label: 'Workflows', icon: '⚡' },
      { href: '/dashboard/leads', label: 'Lead Gen', icon: '🎯' },
      { href: '/dashboard/leads-crm', label: 'CRM', icon: '👥' },
      { href: '/dashboard/funnel', label: 'Funnel Plan', icon: '🔮' },
      { href: '/dashboard/funnel/form-builder', label: 'Form Builder', icon: '📋' },
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
      { href: '/dashboard/audit', label: 'Audit Log', icon: '📋' },
      { href: '/dashboard/privacy', label: 'Privacy & Trust', icon: '🔒' },
      { href: '/dashboard/onboarding', label: 'Onboarding', icon: '🚀' },
    ],
  },
]

function getPageTitle(pathname: string): string {
  const map: Record<string, string> = {
    '/dashboard': 'CMO Dashboard',
    '/dashboard/activity': 'Workspace',
    '/dashboard/strategy': 'Strategy',
    '/dashboard/content': 'Content Calendar',
    '/dashboard/approvals': 'Approvals',
    '/dashboard/agents': 'Agents',
    '/dashboard/connections': 'Connections',
    '/dashboard/settings': 'Settings',
    '/dashboard/inbox': 'Unified Inbox',
    '/dashboard/calendar': 'Calendar',
    '/dashboard/workflows': 'Workflow Engine',
    '/dashboard/leads-crm': 'CRM',
    '/dashboard/campaign': 'Campaigns',
    '/dashboard/email-marketing': 'Email',
    '/dashboard/ads': 'Paid Ads',
    '/dashboard/growth': 'Growth',
    '/dashboard/analytics': 'Analytics',
    '/dashboard/research': 'Research',
    '/dashboard/blog': 'Blog & Scripts',
    '/dashboard/creative': 'Creative Studio',
    '/dashboard/voiceover': 'Voiceover',
    '/dashboard/publishing': 'Publishing',
    '/dashboard/audit': 'Audit Log',
    '/dashboard/privacy': 'Privacy & Trust',
    '/dashboard/funnel/form-builder': 'Form Builder',
  }
  return map[pathname] || pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Dashboard'
}

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

// ── All searchable pages (for command palette) ────────────────────────────────
const ALL_PAGES = [
  ...PRIMARY_NAV,
  ...ADVANCED_NAV.flatMap(s => s.items),
]

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const filtered = query.trim()
    ? ALL_PAGES.filter(p => p.label.toLowerCase().includes(query.toLowerCase()) || p.href.includes(query.toLowerCase()))
    : ALL_PAGES.slice(0, 8)

  const go = (href: string) => { router.push(href); onClose() }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <span className="text-gray-500 text-sm">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages, agents, settings..."
            className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm focus:outline-none"
            onKeyDown={e => { if (e.key === 'Enter' && filtered[0]) go(filtered[0].href) }}
          />
          <kbd className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-500 text-xs">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-gray-500 text-sm">No pages found for &quot;{query}&quot;</p>
          )}
          {filtered.map(item => (
            <button key={item.href} onClick={() => go(item.href)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left group">
              <span className="text-base w-6 flex-shrink-0">{item.icon}</span>
              <span className="text-gray-200 text-sm group-hover:text-white">{item.label}</span>
              <span className="ml-auto text-gray-600 text-xs">{item.href.replace('/dashboard/', '')}</span>
            </button>
          ))}
        </div>

        {!query && (
          <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-2">
            <span className="text-gray-600 text-xs">Navigate with ↑↓ · Open with ↵ · Close with ESC</span>
          </div>
        )}
      </div>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 -z-10" />
    </div>
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
  const [notifTooltip, setNotifTooltip] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)

  // Cmd-K / Ctrl-K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdPaletteOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
        <div className="flex items-center gap-2">
          <button onClick={() => setCmdPaletteOpen(true)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <span className="text-base">🔍</span>
          </button>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <span className="text-lg">{mobileMenuOpen ? '✕' : '☰'}</span>
          </button>
        </div>
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
          {/* Command palette */}
          <CommandPalette open={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} />

          {/* Sticky desktop top header */}
          <header className="hidden lg:flex bg-gray-950 border-b border-gray-800 sticky top-0 z-10 h-12 px-6 items-center justify-between">
            {/* Left: page title + workspace chip */}
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-white font-semibold text-sm">{getPageTitle(pathname)}</h2>
              {businessName && (
                <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300 text-xs truncate max-w-[140px]">
                  {businessName}
                </span>
              )}
            </div>

            {/* Right: search + notification bell + user avatar */}
            <div className="flex items-center gap-3">
              {/* Cmd-K search button */}
              <button
                onClick={() => setCmdPaletteOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition-colors text-xs">
                <span>🔍</span>
                <span className="hidden xl:inline">Search</span>
                <kbd className="hidden xl:inline px-1.5 py-0.5 rounded bg-gray-700 border border-gray-600 text-gray-500 text-xs">⌘K</kbd>
              </button>

              {/* Notification bell */}
              <div className="relative">
                <button
                  onClick={() => { setNotifTooltip(v => !v); setUserMenuOpen(false) }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-base"
                  aria-label="Notifications">
                  🔔
                </button>
                {notifTooltip && (
                  <div className="absolute right-0 top-10 bg-gray-900 border border-gray-700 rounded-xl shadow-xl px-4 py-3 text-sm text-gray-300 whitespace-nowrap z-20">
                    No new notifications
                  </div>
                )}
              </div>

              {/* User avatar + menu */}
              <div className="relative">
                <button
                  onClick={() => { setUserMenuOpen(v => !v); setNotifTooltip(false) }}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors group"
                  aria-label="User menu">
                  <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(businessName || userName || 'O')[0].toUpperCase()}
                  </div>
                  <span className="text-gray-300 text-xs font-medium truncate max-w-[100px] hidden xl:block">
                    {businessName || userName || 'Ooumph'}
                  </span>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-10 bg-gray-900 border border-gray-700 rounded-xl shadow-xl py-1 min-w-[160px] z-20">
                    <div className="px-4 py-2 border-b border-gray-800">
                      <p className="text-white text-xs font-medium truncate">{businessName || userName || 'Ooumph'}</p>
                    </div>
                    <button
                      onClick={() => { setUserMenuOpen(false); logout() }}
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800 transition-colors">
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
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
