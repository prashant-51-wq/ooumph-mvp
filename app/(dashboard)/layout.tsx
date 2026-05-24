'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Command Center', icon: '⚡' },
  { href: '/onboarding', label: 'Onboarding', icon: '🚀' },
  { href: '/strategy', label: 'Strategy', icon: '🧠' },
  { href: '/content', label: 'Content Calendar', icon: '📅' },
  { href: '/assets', label: 'Assets', icon: '✍️' },
  { href: '/approvals', label: 'Approvals', icon: '✅' },
  { href: '/funnel', label: 'Funnel Plan', icon: '🔮' },
  { href: '/leads', label: 'Lead Gen Plan', icon: '🎯' },
  { href: '/export', label: 'Export', icon: '📄' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-800 flex flex-col">
        <div className="p-5 border-b border-gray-800">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">O</div>
            <span className="font-semibold text-white">Ooumph</span>
          </Link>
          <p className="text-xs text-gray-500 mt-1 ml-10">AI Marketing OS</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">P</div>
            <div>
              <p className="text-white text-xs font-medium">Praveen Mishra</p>
              <p className="text-gray-500 text-xs">Ooumph</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
