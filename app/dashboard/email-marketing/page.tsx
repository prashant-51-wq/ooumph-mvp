'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Campaign {
  id: string; name: string; subject: string; status: string
  recipient_count: number; sent_count: number; open_count: number
  content_json: {
    subject?: string; previewText?: string; headline?: string; body?: string
    cta?: string; ctaUrl?: string; ps?: string; suggestedSendTime?: string
  }
  created_at: string; sent_at?: string
}

export default function EmailMarketingPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'campaigns' | 'compose' | 'subscribers'>('campaigns')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Campaign | null>(null)

  // Compose state
  const [composeForm, setComposeForm] = useState({ name: '', goal: '', audience: '' })
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<Campaign['content_json'] | null>(null)
  const [generatedId, setGeneratedId] = useState('')
  const [sendTo, setSendTo] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState('')
  const [error, setError] = useState('')

  // Subscriber state
  const [subscribers, setSubscribers] = useState<Array<{ id: string; email: string; name: string; status: string; subscribed_at: string; source?: string; tags?: string }>>([])
  const [newSubEmail, setNewSubEmail] = useState('')
  const [newSubName, setNewSubName] = useState('')
  const [newSubSource, setNewSubSource] = useState('manual')
  const [addingSub, setAddingSub] = useState(false)
  const [subFilter, setSubFilter] = useState<'all' | 'subscribed' | 'unsubscribed'>('all')
  const [subSearch, setSubSearch] = useState('')

  const workspaceId = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null

  const load = useCallback(async () => {
    if (!workspaceId) { router.push('/dashboard/onboarding'); return }
    setLoading(true)
    const res = await fetch(`/api/agents/email-marketing?workspaceId=${workspaceId}`)
    const data = await res.json()
    setCampaigns(data)
    setLoading(false)
  }, [workspaceId, router])

  const loadSubs = useCallback(async () => {
    if (!workspaceId) return
    const res = await fetch(`/api/email-subscribers?workspaceId=${workspaceId}`)
    const data = await res.json()
    setSubscribers(data)
  }, [workspaceId])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (tab === 'subscribers') loadSubs() }, [tab, loadSubs])

  const generate = async () => {
    if (!composeForm.name) { setError('Campaign name is required'); return }
    setGenerating(true); setError(''); setGenerated(null)
    try {
      const res = await fetch('/api/agents/email-marketing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, action: 'generate', ...composeForm }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setGenerated(data.content)
      setGeneratedId(data.campaignId)
    } catch { setError('Generation failed') } finally { setGenerating(false) }
  }

  const send = async () => {
    const emails = sendTo.split(/[\n,]+/).map(e => e.trim()).filter(Boolean)
    if (!emails.length) { setError('Enter at least one email address'); return }
    setSending(true); setSendResult('')
    try {
      const res = await fetch('/api/agents/email-marketing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, action: 'send', campaignId: generatedId, recipients: emails }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setSendResult(`Sent to ${data.sentCount} recipient${data.sentCount !== 1 ? 's' : ''}`)
      load()
    } catch { setError('Send failed') } finally { setSending(false) }
  }

  const addSubscriber = async () => {
    if (!newSubEmail) return
    setAddingSub(true)
    await fetch('/api/email-subscribers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, email: newSubEmail, name: newSubName, source: newSubSource }),
    })
    setNewSubEmail(''); setNewSubName(''); setNewSubSource('manual')
    setAddingSub(false)
    loadSubs()
  }

  const inputCls = 'w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">📧 Email Marketing</h1>
        <p className="text-gray-400 text-sm mt-1">AI-generated email campaigns, subscriber management, and send analytics</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {([['campaigns', '📋 Campaigns'], ['compose', '✍️ New Campaign'], ['subscribers', '👥 Subscribers']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Campaigns', value: campaigns.length },
          { label: 'Sent', value: campaigns.filter(c => c.status === 'sent').length },
          { label: 'Total Sent', value: campaigns.reduce((a, c) => a + (c.sent_count || 0), 0) },
          { label: 'Subscribers', value: subscribers.length },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-500 text-xs">{s.label}</p>
            <p className="text-white text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Campaigns Tab */}
      {tab === 'campaigns' && (
        <div className="space-y-4">
          {loading && (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-4 bg-gray-800 rounded w-40" />
                    <div className="h-5 bg-gray-800 rounded-full w-16" />
                  </div>
                  <div className="h-3 bg-gray-800 rounded w-56 mt-2" />
                </div>
              ))}
            </div>
          )}
          {!loading && campaigns.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <div className="text-5xl mb-4">📧</div>
              <p className="text-white font-medium mb-2">No campaigns yet</p>
              <p className="text-gray-500 text-sm">Create your first AI-generated email campaign</p>
              <button onClick={() => setTab('compose')} className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm">Create Campaign</button>
            </div>
          )}
          {campaigns.map(campaign => (
            <div key={campaign.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 cursor-pointer hover:border-gray-700 transition-colors"
              onClick={() => setSelected(selected?.id === campaign.id ? null : campaign)}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">{campaign.name}</h3>
                  <p className="text-gray-400 text-sm mt-0.5">{campaign.subject}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs border capitalize ${campaign.status === 'sent' ? 'bg-green-900 text-green-300 border-green-800' : 'bg-yellow-900 text-yellow-300 border-yellow-800'}`}>
                    {campaign.status}
                  </span>
                  {campaign.sent_count > 0 && <span className="text-gray-500 text-xs">{campaign.sent_count} sent</span>}
                </div>
              </div>
              {selected?.id === campaign.id && campaign.content_json && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-3 text-sm">
                  <div className="p-3 bg-gray-800 rounded-lg">
                    <p className="text-gray-500 text-xs mb-1">Subject</p>
                    <p className="text-white font-medium">{campaign.content_json.subject}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{campaign.content_json.previewText}</p>
                  </div>
                  <div className="p-3 bg-gray-800 rounded-lg">
                    <p className="text-white font-semibold mb-2">{campaign.content_json.headline}</p>
                    <p className="text-gray-300 whitespace-pre-line">{campaign.content_json.body}</p>
                    <div className="mt-3 inline-block px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium">{campaign.content_json.cta}</div>
                    {campaign.content_json.ps && <p className="text-gray-400 text-xs mt-3 italic">{campaign.content_json.ps}</p>}
                  </div>
                  {campaign.content_json.suggestedSendTime && (
                    <p className="text-gray-600 text-xs">Best send time: {campaign.content_json.suggestedSendTime}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Compose Tab */}
      {tab === 'compose' && (
        <div className="max-w-2xl">
          {error && <div className="mb-5 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>}
          {sendResult && <div className="mb-5 p-4 rounded-lg bg-green-950 border border-green-800 text-green-300 text-sm">{sendResult}</div>}

          {!generated ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
              <h2 className="text-white font-semibold">Generate Email Campaign with AI</h2>
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Campaign Name *</label>
                <input value={composeForm.name} onChange={e => setComposeForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. July Launch Announcement" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Campaign Goal</label>
                <input value={composeForm.goal} onChange={e => setComposeForm(p => ({ ...p, goal: e.target.value }))}
                  placeholder="e.g. Drive sign-ups for our new feature" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Target Audience</label>
                <input value={composeForm.audience} onChange={e => setComposeForm(p => ({ ...p, audience: e.target.value }))}
                  placeholder="e.g. Existing customers, Trial users, Cold leads" className={inputCls} />
              </div>
              <button onClick={generate} disabled={generating || !composeForm.name}
                className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors">
                {generating ? '⏳ Generating email campaign...' : '⚡ Generate Campaign with AI'}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold">Campaign Preview</h2>
                  <button onClick={() => setGenerated(null)} className="text-gray-500 hover:text-white text-sm">← Start over</button>
                </div>
                <div className="space-y-4 text-sm">
                  <div className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                    <p className="text-gray-500 text-xs mb-1">SUBJECT LINE</p>
                    <p className="text-white font-semibold">{generated.subject}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{generated.previewText}</p>
                  </div>
                  <div className="p-4 bg-gray-800 rounded-lg border border-indigo-900/50">
                    <h3 className="text-white font-bold text-base mb-3">{generated.headline}</h3>
                    <p className="text-gray-300 whitespace-pre-line leading-relaxed">{generated.body}</p>
                    <div className="mt-4 inline-block px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium">{generated.cta}</div>
                    {generated.ps && <p className="text-gray-400 text-xs mt-4 italic">{generated.ps}</p>}
                  </div>
                  {generated.suggestedSendTime && (
                    <p className="text-indigo-400 text-xs">Suggested send time: {generated.suggestedSendTime}</p>
                  )}
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-white font-semibold mb-3">Send Campaign</h3>
                <p className="text-gray-500 text-xs mb-3">Enter email addresses (comma or line separated)</p>
                <textarea value={sendTo} onChange={e => setSendTo(e.target.value)} rows={4}
                  placeholder="john@example.com&#10;jane@company.com&#10;..."
                  className={inputCls + ' resize-none font-mono'} />
                <button onClick={send} disabled={sending || !sendTo.trim()}
                  className="w-full mt-3 py-3 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-medium transition-colors">
                  {sending ? 'Sending...' : '▶ Send Campaign'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subscribers Tab */}
      {tab === 'subscribers' && (
        <div>
          {/* Add subscriber */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <h3 className="text-white font-medium mb-3 text-sm">Add Subscriber</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input value={newSubEmail} onChange={e => setNewSubEmail(e.target.value)}
                placeholder="email@company.com" className={inputCls} />
              <input value={newSubName} onChange={e => setNewSubName(e.target.value)}
                placeholder="Name (optional)" className={inputCls} />
              <select value={newSubSource} onChange={e => setNewSubSource(e.target.value)} className={inputCls}>
                <option value="manual">Manual</option>
                <option value="landing_page">Landing Page</option>
                <option value="campaign">Email Campaign</option>
                <option value="form">Form</option>
                <option value="organic">Organic</option>
                <option value="referral">Referral</option>
                <option value="import">Import</option>
              </select>
              <button onClick={addSubscriber} disabled={addingSub || !newSubEmail}
                className="px-5 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium whitespace-nowrap transition-colors">
                {addingSub ? 'Adding...' : '+ Add'}
              </button>
            </div>
          </div>

          {/* Filter + Search bar */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex bg-gray-800 rounded-lg p-0.5">
              {(['all', 'subscribed', 'unsubscribed'] as const).map(f => (
                <button key={f} onClick={() => setSubFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${subFilter === f ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {f} ({f === 'all' ? subscribers.length : subscribers.filter(s => s.status === f).length})
                </button>
              ))}
            </div>
            <input value={subSearch} onChange={e => setSubSearch(e.target.value)}
              placeholder="Search by email or name..."
              className="flex-1 min-w-48 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500" />
          </div>

          {/* Subscriber table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-gray-800">
                {['Email', 'Name', 'Source', 'Status', 'Subscribed'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {subscribers
                  .filter(s => subFilter === 'all' || s.status === subFilter)
                  .filter(s => !subSearch || s.email.includes(subSearch) || (s.name || '').toLowerCase().includes(subSearch.toLowerCase()))
                  .length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12">
                    <p className="text-gray-500 text-sm">{subscribers.length === 0 ? 'No subscribers yet' : `No subscribers match "${subSearch || subFilter}"`}</p>
                    {subscribers.length === 0 && <p className="text-gray-600 text-xs mt-1">Add subscribers manually or capture them via forms and landing pages</p>}
                  </td></tr>
                ) : subscribers
                  .filter(s => subFilter === 'all' || s.status === subFilter)
                  .filter(s => !subSearch || s.email.includes(subSearch) || (s.name || '').toLowerCase().includes(subSearch.toLowerCase()))
                  .map(sub => (
                  <tr key={sub.id} className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-white text-sm font-medium">{sub.email}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{sub.name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-800 border border-gray-700 text-gray-400 capitalize">
                        {(sub.source || 'manual').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${sub.status === 'subscribed' ? 'bg-green-900 text-green-300 border-green-800' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>{sub.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(sub.subscribed_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-gray-700 text-xs mt-2 text-right">{subscribers.length} total · {subscribers.filter(s => s.status === 'subscribed').length} active</p>
        </div>
      )}
    </div>
  )
}
