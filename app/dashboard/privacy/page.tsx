'use client'

import { useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Section = 'compliance' | 'data' | 'consent' | 'legal'

interface ChecklistItem {
  label: string
  description: string
  status: 'ok' | 'warning' | 'missing'
}

interface ConsentRecord {
  email: string
  type: string
  date: string
  source: string
  ip: string
}

interface LegalDoc {
  key: 'privacy' | 'terms' | 'cookie'
  title: string
  lastUpdated: string
  published: boolean
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

const CHECKLIST: ChecklistItem[] = [
  { label: 'GDPR Compliant', description: 'Data subject rights: access, deletion, portability enabled', status: 'ok' },
  { label: 'CCPA Compliant', description: 'California Consumer Privacy Act — opt-out mechanism active', status: 'ok' },
  { label: 'CAN-SPAM Compliant', description: 'All marketing emails include unsubscribe link and physical address', status: 'ok' },
  { label: 'Email Consent Records', description: 'Double opt-in enabled, consent timestamps stored', status: 'ok' },
  { label: 'Data Retention Policy Set', description: 'Retention periods not fully configured for all data categories', status: 'warning' },
  { label: 'Privacy Policy Published', description: 'Privacy policy has not been published to /privacy', status: 'missing' },
  { label: 'Cookie Consent Banner', description: 'Cookie consent banner not yet configured for your domain', status: 'missing' },
]

const CONSENT_RECORDS: ConsentRecord[] = [
  { email: 'sarah@techco.io', type: 'Marketing Email', date: '2026-05-26 14:22', source: 'Sign-up form', ip: '104.21.72.x' },
  { email: 'marcus@ventures.com', type: 'Marketing Email', date: '2026-05-25 10:07', source: 'Lead magnet', ip: '172.67.45.x' },
  { email: 'billing@acme.com', type: 'Transactional', date: '2026-05-24 18:55', source: 'Checkout', ip: '198.51.100.x' },
  { email: 'team@lyralabs.com', type: 'Marketing Email', date: '2026-05-23 09:30', source: 'Webinar registration', ip: '203.0.113.x' },
  { email: 'ops@bloomhealth.co', type: 'Marketing Email', date: '2026-05-22 16:15', source: 'Import', ip: '192.0.2.x' },
  { email: 'hello@pixelstudio.design', type: 'Marketing Email', date: '2026-05-21 11:00', source: 'Sign-up form', ip: '10.0.0.x' },
  { email: 'pay@devstart.io', type: 'Transactional', date: '2026-05-20 08:45', source: 'Checkout', ip: '172.16.0.x' },
]

const LEGAL_DOCS: LegalDoc[] = [
  { key: 'privacy', title: 'Privacy Policy', lastUpdated: '2026-04-15', published: false },
  { key: 'terms', title: 'Terms of Service', lastUpdated: '2026-03-01', published: true },
  { key: 'cookie', title: 'Cookie Policy', lastUpdated: '2026-02-20', published: false },
]

const DEFAULT_PRIVACY = `Privacy Policy

Last updated: May 26, 2026

1. Introduction
Ooumph ("we", "our", "us") respects your privacy and is committed to protecting your personal data.

2. What data we collect
- Account information: name, email address, company name
- Usage data: pages visited, features used, timestamps
- Payment information: billing details processed by Stripe (we do not store card numbers)
- Marketing preferences and consent records

3. How we use your data
- To provide and improve the Ooumph platform
- To send transactional emails (receipts, security alerts)
- To send marketing communications (with your consent)
- To comply with legal obligations

4. Data retention
We retain your data for as long as your account is active, plus 3 years for audit purposes.

5. Your rights
You may request access, correction, deletion, or export of your data at any time via privacy@ooumph.ai.

6. Contact
privacy@ooumph.ai`

const DEFAULT_TERMS = `Terms of Service

Last updated: March 1, 2026

1. Acceptance of Terms
By using Ooumph, you agree to these Terms of Service.

2. Use of Service
You may use Ooumph for lawful marketing purposes only. You may not use the platform to send spam or engage in deceptive practices.

3. Subscription & Billing
Subscriptions are billed monthly. Cancellations take effect at the end of the current billing period.

4. Intellectual Property
Content you create using Ooumph remains your property. Ooumph retains ownership of the platform itself.

5. Limitation of Liability
Ooumph's liability is limited to the amount paid in the 12 months preceding any claim.

6. Governing Law
These terms are governed by the laws of Delaware, United States.`

const DEFAULT_COOKIE = `Cookie Policy

Last updated: February 20, 2026

1. What are cookies?
Cookies are small text files stored on your device when you visit our website.

2. Cookies we use
- Essential cookies: required for the platform to function (session, authentication)
- Analytics cookies: help us understand how you use the platform (Google Analytics)
- Marketing cookies: used to track advertising effectiveness (only with consent)

3. Managing cookies
You can control cookies via your browser settings. Disabling essential cookies may affect platform functionality.

4. Third-party cookies
We use Stripe for payments (their cookie policy applies to checkout flows) and Google Analytics for usage analytics.

5. Contact
privacy@ooumph.ai`

// ── Score calculation ──────────────────────────────────────────────────────────

function complianceScore(items: ChecklistItem[]): number {
  const ok = items.filter(i => i.status === 'ok').length
  const warn = items.filter(i => i.status === 'warning').length
  return Math.round((ok * 14 + warn * 5) / items.length * 10)
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PrivacyPage() {
  const [activeSection, setActiveSection] = useState<Section>('compliance')
  const [checklist, setChecklist] = useState<ChecklistItem[]>(CHECKLIST)

  // Data management
  const [retentionSettings, setRetentionSettings] = useState({
    contacts: '2yr',
    emailLogs: '1yr',
    activityLogs: '1yr',
    aiOutputs: '1yr',
    analytics: '5yr',
  })
  const [retentionSaved, setRetentionSaved] = useState(false)
  const [exportModal, setExportModal] = useState(false)
  const [exportEmail, setExportEmail] = useState('')
  const [exportDone, setExportDone] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deleteDone, setDeleteDone] = useState(false)

  // Consent
  const [doubleOptIn, setDoubleOptIn] = useState(true)
  const [copiedUnsub, setCopiedUnsub] = useState(false)

  // Legal docs
  const [docs, setDocs] = useState<Record<string, string>>({
    privacy: DEFAULT_PRIVACY,
    terms: DEFAULT_TERMS,
    cookie: DEFAULT_COOKIE,
  })
  const [legalDocs, setLegalDocs] = useState<LegalDoc[]>(LEGAL_DOCS)
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null)
  const [publishedMsg, setPublishedMsg] = useState<string | null>(null)

  const score = complianceScore(checklist)

  const handleSaveRetention = () => {
    setRetentionSaved(true)
    setTimeout(() => setRetentionSaved(false), 3000)
    // Mark warning as ok if retention is set
    setChecklist(prev => prev.map(item =>
      item.label === 'Data Retention Policy Set' ? { ...item, status: 'ok' } : item
    ))
  }

  const handleExportSubmit = () => {
    setExportDone(true)
    setTimeout(() => { setExportDone(false); setExportModal(false); setExportEmail('') }, 3000)
  }

  const handleDeleteSubmit = () => {
    setDeleteDone(true)
    setTimeout(() => { setDeleteDone(false); setDeleteModal(false); setDeleteEmail('') }, 3000)
  }

  const handlePublish = (key: 'privacy' | 'terms' | 'cookie') => {
    setLegalDocs(prev => prev.map(d => d.key === key ? { ...d, published: true, lastUpdated: new Date().toISOString().slice(0, 10) } : d))
    const titles: Record<string, string> = { privacy: 'Privacy Policy', terms: 'Terms of Service', cookie: 'Cookie Policy' }
    setPublishedMsg(`${titles[key]} published to /${key}`)
    setTimeout(() => setPublishedMsg(null), 3500)
    if (key === 'privacy') {
      setChecklist(prev => prev.map(item =>
        item.label === 'Privacy Policy Published' ? { ...item, status: 'ok' } : item
      ))
    }
  }

  const handleGenerateDoc = async (key: string) => {
    setGeneratingDoc(key)
    await new Promise(r => setTimeout(r, 1800))
    const generated: Record<string, string> = {
      privacy: DEFAULT_PRIVACY + '\n\n[AI Generated — review before publishing]',
      terms: DEFAULT_TERMS + '\n\n[AI Generated — review before publishing]',
      cookie: DEFAULT_COOKIE + '\n\n[AI Generated — review before publishing]',
    }
    setDocs(prev => ({ ...prev, [key]: generated[key] || prev[key] }))
    setGeneratingDoc(null)
  }

  const handleExportConsent = () => {
    const csv = [
      'Email,Consent Type,Date,Source,IP',
      ...CONSENT_RECORDS.map(r => `"${r.email}","${r.type}","${r.date}","${r.source}","${r.ip}"`),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'consent-records.csv'
    a.click()
  }

  const newScore = complianceScore(checklist)
  const okCount = checklist.filter(i => i.status === 'ok').length

  return (
    <div className="p-6 max-w-6xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Privacy & Compliance</h1>
          <p className="text-gray-400 text-sm mt-1">Manage GDPR, CCPA, consent records, and legal documents</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-sm ${
          newScore >= 80 ? 'bg-green-900/30 border-green-800 text-green-300' :
          newScore >= 60 ? 'bg-yellow-900/30 border-yellow-800 text-yellow-300' :
          'bg-red-900/30 border-red-800 text-red-300'
        }`}>
          <span className="text-lg">{newScore >= 80 ? '✅' : newScore >= 60 ? '⚠️' : '❌'}</span>
          <span>{newScore}/100 Compliance Score</span>
        </div>
      </div>

      {/* Published toast */}
      {publishedMsg && (
        <div className="fixed top-6 right-6 z-50 bg-green-900 border border-green-700 text-green-300 px-4 py-3 rounded-xl text-sm font-medium shadow-xl">
          ✅ {publishedMsg}
        </div>
      )}

      {/* ── Section Nav ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {([
          ['compliance', 'Compliance Overview'],
          ['data', 'Data Management'],
          ['consent', 'Consent Management'],
          ['legal', 'Legal Documents'],
        ] as [Section, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Section 1: Compliance Overview ────────────────────────────────── */}
      {activeSection === 'compliance' && (
        <div className="space-y-6">
          {/* Score progress */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-semibold">Overall Compliance</p>
              <span className={`text-xl font-bold ${newScore >= 80 ? 'text-green-400' : newScore >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                {newScore}/100
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-700 ${
                  newScore >= 80 ? 'bg-green-500' : newScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${newScore}%` }}
              />
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs">
              <span className="text-green-400">{okCount} passed</span>
              <span className="text-yellow-400">{checklist.filter(i => i.status === 'warning').length} warnings</span>
              <span className="text-red-400">{checklist.filter(i => i.status === 'missing').length} missing</span>
            </div>
          </div>

          {/* Checklist */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800">
              <p className="text-white font-semibold text-sm">Compliance Checklist</p>
            </div>
            <div className="divide-y divide-gray-800">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-800/30 transition-colors">
                  <span className={`text-base mt-0.5 flex-shrink-0 ${
                    item.status === 'ok' ? 'text-green-400' :
                    item.status === 'warning' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {item.status === 'ok' ? '✅' : item.status === 'warning' ? '⚠️' : '❌'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{item.label}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{item.description}</p>
                  </div>
                  {item.status !== 'ok' && (
                    <button
                      onClick={() => {
                        if (item.label === 'Data Retention Policy Set') setActiveSection('data')
                        if (item.label === 'Privacy Policy Published') setActiveSection('legal')
                        if (item.label === 'Cookie Consent Banner') setActiveSection('legal')
                      }}
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-indigo-900/40 border border-indigo-800 text-indigo-400 hover:text-white text-xs font-medium transition-colors"
                    >
                      Fix →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Section 2: Data Management ────────────────────────────────────── */}
      {activeSection === 'data' && (
        <div className="space-y-6">
          {/* Retention settings */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-white font-semibold">Data Retention Policy</p>
              {retentionSaved && <span className="text-green-400 text-sm font-medium">✅ Saved</span>}
            </div>
            <div className="space-y-3">
              {[
                { key: 'contacts', label: 'Contact Data', desc: 'CRM contacts and profiles' },
                { key: 'emailLogs', label: 'Email Logs', desc: 'Sent email records and delivery status' },
                { key: 'activityLogs', label: 'Activity Logs', desc: 'Workspace audit trail and event log' },
                { key: 'aiOutputs', label: 'AI Outputs', desc: 'Generated content and agent responses' },
                { key: 'analytics', label: 'Analytics Data', desc: 'Campaign and performance metrics' },
              ].map(row => (
                <div key={row.key} className="flex items-center justify-between py-2 border-b border-gray-800">
                  <div>
                    <p className="text-white text-sm font-medium">{row.label}</p>
                    <p className="text-gray-500 text-xs">{row.desc}</p>
                  </div>
                  <select
                    value={retentionSettings[row.key as keyof typeof retentionSettings]}
                    onChange={e => setRetentionSettings(prev => ({ ...prev, [row.key]: e.target.value }))}
                    className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="1yr">1 Year</option>
                    <option value="2yr">2 Years</option>
                    <option value="5yr">5 Years</option>
                    <option value="forever">Forever</option>
                  </select>
                </div>
              ))}
            </div>
            <button
              onClick={handleSaveRetention}
              className="mt-4 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              Save Retention Policy
            </button>
          </div>

          {/* GDPR requests */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl">📦</span>
                <div>
                  <p className="text-white font-semibold text-sm">Request Data Export</p>
                  <p className="text-gray-500 text-xs">GDPR data subject request</p>
                </div>
              </div>
              <p className="text-gray-400 text-xs mb-4 leading-relaxed">
                Generate a full data export for a user. The export will include all personal data, consent records, and activity logs associated with the email address.
              </p>
              <button
                onClick={() => setExportModal(true)}
                className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                Generate Data Export
              </button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl">🗑️</span>
                <div>
                  <p className="text-white font-semibold text-sm">Delete User Data</p>
                  <p className="text-gray-500 text-xs">Right to erasure request</p>
                </div>
              </div>
              <p className="text-gray-400 text-xs mb-4 leading-relaxed">
                Schedule deletion of all personal data for a specific email address. This action complies with GDPR Article 17 and will be processed within 30 days.
              </p>
              <button
                onClick={() => setDeleteModal(true)}
                className="w-full px-4 py-2.5 rounded-xl bg-red-900/40 border border-red-800 text-red-400 hover:bg-red-900/60 text-sm font-medium transition-colors"
              >
                Delete User Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 3: Consent Management ─────────────────────────────────── */}
      {activeSection === 'consent' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Opted In', value: '3,284', color: 'text-green-400' },
              { label: 'Opted Out', value: '142', color: 'text-red-400' },
              { label: 'Pending Confirmation', value: '38', color: 'text-yellow-400' },
            ].map(s => (
              <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">{s.label}</p>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Settings */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium text-sm">Double Opt-in</p>
                  <p className="text-gray-500 text-xs">Require email confirmation before adding to marketing lists</p>
                </div>
                <button
                  onClick={() => setDoubleOptIn(v => !v)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${doubleOptIn ? 'bg-indigo-600' : 'bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${doubleOptIn ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                <div>
                  <p className="text-white font-medium text-sm">Unsubscribe Page URL</p>
                  <p className="text-gray-500 text-xs">Included in all marketing emails</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value="https://app.ooumph.ai/unsubscribe"
                    className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-400 font-mono w-56 focus:outline-none"
                  />
                  <button
                    onClick={() => { navigator.clipboard.writeText('https://app.ooumph.ai/unsubscribe'); setCopiedUnsub(true); setTimeout(() => setCopiedUnsub(false), 2000) }}
                    className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors"
                  >
                    {copiedUnsub ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Consent records table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
              <p className="text-white font-semibold text-sm">Consent Records</p>
              <button
                onClick={handleExportConsent}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white text-xs font-medium transition-colors"
              >
                ⬇ Export CSV
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Email', 'Consent Type', 'Date', 'Source', 'IP'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CONSENT_RECORDS.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-white text-sm">{r.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                        r.type === 'Marketing Email'
                          ? 'bg-indigo-900/40 text-indigo-400 border-indigo-800'
                          : 'bg-gray-800 text-gray-400 border-gray-700'
                      }`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{r.date}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{r.source}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{r.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Section 4: Legal Documents ────────────────────────────────────── */}
      {activeSection === 'legal' && (
        <div className="space-y-6">
          {legalDocs.map(doc => (
            <div key={doc.key} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <p className="text-white font-semibold">{doc.title}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                    doc.published
                      ? 'bg-green-900/40 text-green-400 border-green-800'
                      : 'bg-gray-800 text-gray-500 border-gray-700'
                  }`}>
                    {doc.published ? '● Published' : '○ Draft'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-xs">Last updated: {doc.lastUpdated}</span>
                  <button
                    onClick={() => handleGenerateDoc(doc.key)}
                    disabled={generatingDoc === doc.key}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-900/40 border border-purple-800 text-purple-400 hover:text-white text-xs font-medium transition-colors disabled:opacity-60"
                  >
                    {generatingDoc === doc.key ? (
                      <>
                        <span className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : '✨ Generate with AI'}
                  </button>
                  <button
                    onClick={() => handlePublish(doc.key)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
                  >
                    Publish to /{doc.key}
                  </button>
                </div>
              </div>
              <textarea
                value={docs[doc.key]}
                onChange={e => setDocs(prev => ({ ...prev, [doc.key]: e.target.value }))}
                rows={12}
                className="w-full px-4 py-3 bg-gray-950 border border-gray-800 rounded-xl text-sm text-gray-300 font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Export Data Modal ─────────────────────────────────────────────── */}
      {exportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-white font-bold text-lg mb-1">Generate Data Export</h2>
            <p className="text-gray-400 text-sm mb-4">Enter the email address to export all associated personal data.</p>
            <input
              type="email"
              value={exportEmail}
              onChange={e => setExportEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-4"
            />
            {exportDone ? (
              <div className="p-3 bg-green-950/50 border border-green-800 rounded-xl text-green-300 text-sm text-center">
                ✅ Export queued — the download link will be emailed to you within 10 minutes
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleExportSubmit}
                  disabled={!exportEmail.includes('@')}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
                >
                  Generate Export
                </button>
                <button
                  onClick={() => setExportModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete User Data Modal ────────────────────────────────────────── */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">⚠️</span>
              <h2 className="text-white font-bold text-lg">Delete User Data</h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              This will permanently delete all personal data for the specified email address. This action cannot be undone and will be processed within 30 days.
            </p>
            <input
              type="email"
              value={deleteEmail}
              onChange={e => setDeleteEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-1 focus:ring-red-500 mb-4"
            />
            {deleteDone ? (
              <div className="p-3 bg-yellow-950/50 border border-yellow-800 rounded-xl text-yellow-300 text-sm text-center">
                ✅ Data deletion request queued — will be processed within 30 days
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteSubmit}
                  disabled={!deleteEmail.includes('@')}
                  className="flex-1 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
                >
                  Mark for Deletion
                </button>
                <button
                  onClick={() => setDeleteModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
