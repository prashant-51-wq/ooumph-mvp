'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Stats {
  artifacts: number
  pendingApprovals: number
  learningNotes: number
  completedTypes: string[]
}

const STEP_COMPLETION: Record<number, string[]> = {
  1: [],
  2: ['strategy'],
  3: ['content_calendar'],
  4: ['carousel', 'reelScript', 'adCopy', 'emailDraft', 'linkedInPost'],
  5: [],
  6: ['funnel_plan'],
  7: ['lead_gen_plan'],
  8: [],
}

function isStepDone(step: number, completedTypes: string[]): boolean {
  const required = STEP_COMPLETION[step]
  if (!required || required.length === 0) return false
  return required.some((t) => completedTypes.includes(t))
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats>({ artifacts: 0, pendingApprovals: 0, learningNotes: 0, completedTypes: [] })
  const [businessName, setBusinessName] = useState('')

  useEffect(() => {
    async function init() {
      let wid = localStorage.getItem('workspaceId')
      if (!wid) {
        // Try to recover from session cookie
        try {
          const res = await fetch('/api/auth/me')
          const data = await res.json()
          if (data.user?.workspaceId) {
            wid = data.user.workspaceId
            localStorage.setItem('workspaceId', wid!)
            if (data.user.workspaceName) localStorage.setItem('businessName', data.user.workspaceName)
            if (data.user.name) localStorage.setItem('userName', data.user.name)
          }
        } catch { /* ignore */ }
      }
      if (!wid) { router.push('/dashboard/onboarding'); return }
      setBusinessName(localStorage.getItem('businessName') || '')
      fetch(`/api/stats?workspaceId=${wid}`)
        .then((r) => r.json())
        .then((s: Stats) => setStats(s))
        .catch(() => {})
    }
    init()
  }, [router])

  const steps = [
    { step: 1, href: '/dashboard/onboarding', label: 'Complete Onboarding', desc: 'Set up your workspace (10 min)', icon: '🚀' },
    { step: 2, href: '/dashboard/strategy', label: 'Generate Strategy', desc: 'AI creates your marketing plan', icon: '🧠' },
    { step: 3, href: '/dashboard/content', label: 'Build Content Calendar', desc: '30-day plan across all channels', icon: '📅' },
    { step: 4, href: '/dashboard/assets', label: 'Create Marketing Assets', desc: '5 ready-to-use content pieces', icon: '✍️' },
    { step: 5, href: '/dashboard/approvals', label: 'Review & Approve', desc: 'You control what goes out', icon: '✅' },
    { step: 6, href: '/dashboard/funnel', label: 'Design Your Funnel', desc: 'Lead magnet, landing page, nurture', icon: '🔮' },
    { step: 7, href: '/dashboard/leads', label: 'Lead Gen Plan', desc: 'Inbound + outbound playbook', icon: '🎯' },
    { step: 8, href: '/dashboard/export', label: 'Export & Share', desc: 'Download full marketing plan', icon: '📄' },
  ]

  const doneCount = steps.filter((s) => isStepDone(s.step, stats.completedTypes)).length
  const hasOnboarding = !!businessName

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Command Center</h1>
        <p className="text-gray-400">
          {businessName ? `${businessName} — ` : ''}Your AI marketing workforce is ready. {doneCount > 0 ? `${doneCount} of 6 content steps complete.` : 'Complete each step to build your full marketing plan.'}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Agents Ready', value: '10', sub: 'AI workers' },
          { label: 'Artifacts', value: String(stats.artifacts), sub: 'generated' },
          { label: 'Pending Approvals', value: String(stats.pendingApprovals), sub: 'awaiting review', alert: stats.pendingApprovals > 0 },
          { label: 'Learning Notes', value: String(stats.learningNotes), sub: 'from feedback' },
        ].map((stat) => (
          <div key={stat.label} className={`bg-gray-900 border rounded-xl p-4 ${stat.alert ? 'border-yellow-700' : 'border-gray-800'}`}>
            <p className="text-gray-400 text-xs mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.alert ? 'text-yellow-400' : 'text-white'}`}>{stat.value}</p>
            <p className="text-gray-600 text-xs">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Workflow Steps */}
      <div className="grid grid-cols-2 gap-4">
        {steps.map((s) => {
          const done = s.step === 1 ? hasOnboarding : isStepDone(s.step, stats.completedTypes)
          const approvalAlert = s.step === 5 && stats.pendingApprovals > 0
          return (
            <Link key={s.href} href={s.href}>
              <div className={`bg-gray-900 border rounded-xl p-5 transition-all hover:bg-gray-800 cursor-pointer group ${
                done ? 'border-green-900 hover:border-green-700' : approvalAlert ? 'border-yellow-800 hover:border-yellow-700' : 'border-gray-800 hover:border-indigo-700'
              }`}>
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-colors ${
                    done ? 'bg-green-950' : 'bg-gray-800 group-hover:bg-indigo-900'
                  }`}>
                    {s.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-600 font-mono">Step {s.step}</span>
                      {done && <span className="text-xs text-green-500 font-medium">✓ Done</span>}
                      {approvalAlert && !done && <span className="text-xs text-yellow-400 font-medium">{stats.pendingApprovals} pending</span>}
                    </div>
                    <p className="text-white font-medium text-sm">{s.label}</p>
                    <p className="text-gray-500 text-xs mt-1">{s.desc}</p>
                  </div>
                  <span className={`transition-colors ${done ? 'text-green-700' : 'text-gray-700 group-hover:text-indigo-400'}`}>→</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Human Governance Note */}
      <div className="mt-8 p-5 rounded-xl border border-indigo-800 bg-indigo-950/50">
        <p className="text-indigo-300 text-sm font-medium mb-1">🔒 Human Governance Active</p>
        <p className="text-indigo-400 text-xs">All content is drafted by AI and requires your approval before any external action. No autonomous publishing, spending, or outreach will happen without your explicit sign-off.</p>
      </div>
    </div>
  )
}
