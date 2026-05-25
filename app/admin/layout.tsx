'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/vendors', label: 'Vendors', icon: '🏢' },
  { href: '/admin/revenue', label: 'Revenue', icon: '💰' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  // Persist admin secret in sessionStorage (not localStorage — tab-scoped security)
  useEffect(() => {
    const saved = sessionStorage.getItem('adminSecret')
    if (saved) { setSecret(saved); setAuthed(true) }
  }, [])

  async function handleLogin() {
    if (!secret.trim()) return
    setChecking(true); setError('')
    try {
      const res = await fetch(`/api/admin/stats?adminSecret=${encodeURIComponent(secret)}`)
      if (res.ok) {
        sessionStorage.setItem('adminSecret', secret)
        setAuthed(true)
      } else {
        setError('Invalid admin secret')
      }
    } catch {
      setError('Connection error')
    } finally {
      setChecking(false)
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('adminSecret')
    setAuthed(false)
    setSecret('')
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🔐</div>
            <h1 className="text-xl font-bold text-white">Ooumph Admin</h1>
            <p className="text-gray-400 text-sm mt-1">Super Admin Portal</p>
          </div>
          <input
            type="password"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Admin secret key"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-3"
          />
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={checking}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition"
          >
            {checking ? 'Verifying…' : 'Enter Admin Panel'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="text-sm font-bold text-indigo-400">⚡ OOUMPH</div>
          <div className="text-xs text-gray-500 mt-0.5">Super Admin</div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                pathname === item.href
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition"
          >
            ← Back to App
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 rounded-lg hover:bg-gray-800 transition mt-1"
          >
            🚪 Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Inject secret into window for child page fetches */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__adminSecret = ${JSON.stringify(secret)}`,
          }}
        />
        {children}
      </main>
    </div>
  )
}
