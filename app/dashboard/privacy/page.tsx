'use client'

import { useState } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Section {
  title: string
  icon: string
  items: { text: string; done: boolean }[]
}

// ── Data ──────────────────────────────────────────────────────────────────────

const DATA_HANDLING: Section = {
  title: 'How we handle your data',
  icon: '🗄️',
  items: [
    { text: 'Your brand data stays in YOUR workspace, encrypted at rest', done: true },
    { text: 'AI agents run in isolated sandboxes — your data never trains Anthropic\'s models', done: true },
    { text: 'Every agent run is logged in your Audit Log', done: true },
    { text: 'Nothing publishes without your explicit approval', done: true },
  ],
}

const HUMAN_IN_LOOP: Section = {
  title: 'Human-in-the-loop guarantee',
  icon: '🤝',
  items: [
    { text: 'All generated content goes to Approvals first', done: true },
    { text: 'You review, refine, or reject before anything is published', done: true },
    { text: 'Revisions are kept for 30 days', done: true },
    { text: 'Full audit trail of every approval decision', done: true },
  ],
}

const API_KEY_SECURITY: Section = {
  title: 'API key security',
  icon: '🔑',
  items: [
    { text: 'API keys are stored encrypted using AES-256', done: true },
    { text: 'Keys are never logged or shown in plaintext after saving', done: true },
    { text: 'Keys are scoped per workspace and never shared across accounts', done: true },
  ],
}

const COMPLIANCE_ITEMS: { label: string; badge: string; detail: string; done: boolean }[] = [
  {
    label: 'GDPR',
    badge: 'Active',
    detail: 'Data deletion on request, export your data anytime',
    done: true,
  },
  {
    label: 'DPDP',
    badge: 'In progress',
    detail: 'India Digital Personal Data Protection Act compliance in progress',
    done: false,
  },
  {
    label: 'SOC 2 Type II',
    badge: 'Audit in progress',
    detail: 'Expected Q3 2026',
    done: false,
  },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ section }: { section: Section }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{section.icon}</span>
        <h2 className="text-white font-semibold text-base">{section.title}</h2>
      </div>
      <ul className="space-y-3">
        {section.items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className={`text-sm font-bold flex-shrink-0 mt-0.5 ${item.done ? 'text-green-400' : 'text-yellow-500'}`}>
              {item.done ? '✓' : '⏳'}
            </span>
            <span className="text-gray-300 text-sm leading-relaxed">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PrivacyPage() {
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">🔒 Privacy &amp; Trust</h1>
        <p className="text-gray-400 text-sm mt-1">Your data stays yours. Your AI team, your control.</p>
      </div>

      <div className="max-w-3xl space-y-6">

        {/* Data handling */}
        <SectionCard section={DATA_HANDLING} />

        {/* Human in the loop */}
        <SectionCard section={HUMAN_IN_LOOP} />

        {/* API key security */}
        <SectionCard section={API_KEY_SECURITY} />

        {/* Compliance */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🏛️</span>
            <h2 className="text-white font-semibold text-base">Compliance</h2>
          </div>
          <div className="space-y-4">
            {COMPLIANCE_ITEMS.map(item => (
              <div key={item.label} className="flex items-start gap-4">
                <span className={`text-sm font-bold flex-shrink-0 mt-0.5 ${item.done ? 'text-green-400' : 'text-yellow-500'}`}>
                  {item.done ? '✓' : '⏳'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">{item.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                      item.done
                        ? 'bg-green-900/40 text-green-400 border-green-800'
                        : 'bg-yellow-900/30 text-yellow-400 border-yellow-800'
                    }`}>
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm mt-0.5">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Export your data */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">📦</span>
            <h2 className="text-white font-semibold text-base">Export your data</h2>
          </div>
          <p className="text-gray-400 text-sm mb-5">
            You own your data. Export everything at any time, or delete your account if you no longer need Ooumph.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/dashboard/export"
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
            >
              <span>📄</span>
              Export all workspace data
            </Link>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gray-800 hover:bg-red-900/40 border border-gray-700 hover:border-red-800 text-gray-300 hover:text-red-400 text-sm font-semibold transition-colors"
            >
              <span>🗑️</span>
              Delete my account
            </button>
          </div>
        </div>

        {/* Trust statement */}
        <div className="bg-indigo-950/40 border border-indigo-900/50 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-xl flex-shrink-0">🛡️</span>
            <div>
              <p className="text-indigo-200 text-sm font-semibold mb-1">Our commitment</p>
              <p className="text-indigo-300/80 text-sm leading-relaxed">
                Ooumph is built on the principle that your marketing intelligence belongs to you — not to us,
                not to our model providers. We will never sell your data, share it with third parties without
                your consent, or use it to train AI models. If you have questions, reach out at{' '}
                <a href="mailto:privacy@ooumph.ai" className="text-indigo-400 hover:underline">privacy@ooumph.ai</a>.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* ── Delete account modal ───────────────────────────────────────────────── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-white font-bold text-lg">Delete account</h2>
            </div>
            <p className="text-gray-300 text-sm mb-3 leading-relaxed">
              Account deletion permanently removes all your workspaces, content, and data. This action cannot be undone.
            </p>
            <p className="text-gray-400 text-sm mb-5">
              Please contact{' '}
              <a href="mailto:support@ooumph.ai" className="text-indigo-400 hover:underline font-medium">
                support@ooumph.ai
              </a>{' '}
              to delete your account. Our team will process your request within 2 business days and send a confirmation email.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="mailto:support@ooumph.ai?subject=Account%20Deletion%20Request"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
              >
                ✉️ Email support
              </a>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-semibold transition-colors border border-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
