'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import {
  LayoutDashboard, Users, Building2, CreditCard, Bot, ShieldCheck,
  Activity, ScrollText, Settings, Menu, X, ArrowLeft,
  TrendingUp, Briefcase,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/workspaces', label: 'Workspaces', icon: Building2 },
  { href: '/admin/billing', label: 'Billing', icon: CreditCard },
  { href: '/admin/revenue', label: 'Revenue', icon: TrendingUp },
  { href: '/admin/vendors', label: 'Vendors', icon: Briefcase },
  { href: '/admin/agents', label: 'Agents', icon: Bot },
  { href: '/admin/approvals', label: 'Approvals', icon: ShieldCheck },
  { href: '/admin/system', label: 'System', icon: Activity },
  { href: '/admin/audit', label: 'Audit Log', icon: ScrollText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

function titleFor(pathname: string): string {
  const match = ADMIN_NAV.find(n => n.href === pathname) || ADMIN_NAV[0]
  return match.label
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/admin'
  const router = useRouter()
  const [authState, setAuthState] = useState<'loading' | 'authorized' | 'denied'>('loading')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [adminEmail, setAdminEmail] = useState<string | null>(null)

  // Auth gate — mirror super-admin/page.tsx
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (data?.user?.isAdmin === true) {
          setAuthState('authorized')
          setAdminEmail(data.user.email || null)
        } else {
          setAuthState('denied')
          // Redirect non-admins back to dashboard.
          setTimeout(() => router.push('/dashboard'), 1200)
        }
      })
      .catch(() => {
        if (!cancelled) setAuthState('denied')
      })
    return () => { cancelled = true }
  }, [router])

  // Close mobile drawer on navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <span className="w-4 h-4 border-2 border-gray-700 border-t-indigo-500 rounded-full animate-spin" />
          Verifying admin access…
        </div>
      </div>
    )
  }

  if (authState === 'denied') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="bg-gray-900 border border-red-900/50 rounded-2xl p-8 max-w-md text-center">
          <ShieldCheck className="w-12 h-12 mx-auto text-red-400 mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400 text-sm mb-6">
            The platform admin panel is restricted to super-admin accounts. Redirecting you back to the dashboard…
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const pageTitle = titleFor(pathname)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md hover:bg-gray-800"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm">Admin · {pageTitle}</span>
        </div>
        <Link href="/dashboard" className="text-xs text-gray-400 hover:text-white">Exit</Link>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[80%] h-full bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-white">Admin</h2>
              <button onClick={() => setMobileOpen(false)} className="p-1 hover:bg-gray-800 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="space-y-1">
              {ADMIN_NAV.map(item => {
                const Icon = item.icon
                const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-700/50' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </aside>
        </div>
      )}

      <div className="lg:flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-gray-800 bg-gray-950 sticky top-0 h-screen">
          <div className="px-5 py-5 border-b border-gray-800">
            <Link href="/dashboard" className="text-xs text-gray-500 hover:text-gray-300 inline-flex items-center gap-1 mb-2">
              <ArrowLeft className="w-3 h-3" /> Back to app
            </Link>
            <h1 className="text-lg font-bold text-white">Platform Admin</h1>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{adminEmail || 'Super admin'}</p>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {ADMIN_NAV.map(item => {
              const Icon = item.icon
              const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-700/40'
                      : 'text-gray-400 hover:bg-gray-800/60 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="px-5 py-3 border-t border-gray-800 text-xs text-gray-600">
            Ooumph Admin v1
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Desktop breadcrumb / page title */}
          <div className="hidden lg:flex items-center justify-between px-8 py-5 border-b border-gray-800">
            <div>
              <div className="text-xs text-gray-500 flex items-center gap-1.5">
                <Link href="/dashboard" className="hover:text-gray-300">Dashboard</Link>
                <span>/</span>
                <Link href="/admin" className="hover:text-gray-300">Admin</Link>
                {pageTitle !== 'Overview' && (
                  <>
                    <span>/</span>
                    <span className="text-gray-400">{pageTitle}</span>
                  </>
                )}
              </div>
              <h2 className="text-2xl font-bold text-white mt-1">{pageTitle}</h2>
            </div>
          </div>

          <div className="px-4 lg:px-8 py-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
