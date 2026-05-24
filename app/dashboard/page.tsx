import Link from 'next/link'

export default function DashboardPage() {
  const steps = [
    { step: 1, href: '/dashboard/onboarding', label: 'Complete Onboarding', desc: 'Set up your workspace (10 min)', icon: '🚀', color: 'indigo' },
    { step: 2, href: '/dashboard/strategy', label: 'Generate Strategy', desc: 'AI creates your marketing plan', icon: '🧠', color: 'purple' },
    { step: 3, href: '/dashboard/content', label: 'Build Content Calendar', desc: '30-day plan across all channels', icon: '📅', color: 'blue' },
    { step: 4, href: '/dashboard/assets', label: 'Create Marketing Assets', desc: '5 ready-to-use content pieces', icon: '✍️', color: 'green' },
    { step: 5, href: '/dashboard/approvals', label: 'Review & Approve', desc: 'You control what goes out', icon: '✅', color: 'yellow' },
    { step: 6, href: '/dashboard/funnel', label: 'Design Your Funnel', desc: 'Lead magnet, landing page, nurture', icon: '🔮', color: 'pink' },
    { step: 7, href: '/dashboard/leads', label: 'Lead Gen Plan', desc: 'Inbound + outbound playbook', icon: '🎯', color: 'orange' },
    { step: 8, href: '/dashboard/export', label: 'Export & Share', desc: 'Download full marketing plan', icon: '📄', color: 'gray' },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Command Center</h1>
        <p className="text-gray-400">Your AI marketing workforce is ready. Complete each step to build your full marketing plan.</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Agents Ready', value: '10', sub: 'AI workers' },
          { label: 'Artifacts', value: '0', sub: 'generated today' },
          { label: 'Pending Approvals', value: '0', sub: 'awaiting review' },
          { label: 'Learning Notes', value: '0', sub: 'from feedback' },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs mb-1">{stat.label}</p>
            <p className="text-white text-2xl font-bold">{stat.value}</p>
            <p className="text-gray-600 text-xs">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Workflow Steps */}
      <div className="grid grid-cols-2 gap-4">
        {steps.map((s) => (
          <Link key={s.href} href={s.href}>
            <div className="bg-gray-900 border border-gray-800 hover:border-indigo-700 rounded-xl p-5 transition-all hover:bg-gray-800 cursor-pointer group">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-gray-800 group-hover:bg-indigo-900 flex items-center justify-center text-xl transition-colors">
                  {s.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-600 font-mono">Step {s.step}</span>
                  </div>
                  <p className="text-white font-medium text-sm">{s.label}</p>
                  <p className="text-gray-500 text-xs mt-1">{s.desc}</p>
                </div>
                <span className="text-gray-700 group-hover:text-indigo-400 transition-colors">→</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Blueprint Note */}
      <div className="mt-8 p-5 rounded-xl border border-indigo-800 bg-indigo-950/50">
        <p className="text-indigo-300 text-sm font-medium mb-1">🔒 Human Governance Active</p>
        <p className="text-indigo-400 text-xs">All content is drafted by AI and requires your approval before any external action. No autonomous publishing, spending, or outreach will happen without your explicit sign-off.</p>
      </div>
    </div>
  )
}
