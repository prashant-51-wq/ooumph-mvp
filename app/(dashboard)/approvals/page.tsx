'use client'

import { useState, useEffect, useCallback } from 'react'

interface ApprovalItem {
  id: string
  artifact_id: string
  artifact_type: string
  artifact_title: string
  content_json: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  notes: string
  created_at: string
}

const TYPE_LABELS: Record<string, string> = {
  strategy: '🧠 Strategy',
  content_calendar: '📅 Content Calendar',
  carousel: '🖼️ Carousel',
  reelScript: '🎬 Reel Script',
  adCopy: '📢 Ad Copy',
  emailDraft: '📧 Email Draft',
  linkedInPost: '💼 LinkedIn Post',
  funnel_plan: '🔮 Funnel Plan',
  lead_gen_plan: '🎯 Lead Gen Plan',
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ApprovalItem | null>(null)
  const [notes, setNotes] = useState('')
  const [acting, setActing] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')

  const load = useCallback(async () => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) { setLoading(false); return }
    const res = await fetch(`/api/approvals?workspaceId=${workspaceId}`)
    const data = await res.json()
    setItems(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (action: 'approve' | 'reject') => {
    if (!selected) return
    const workspaceId = localStorage.getItem('workspaceId')
    setActing(true)
    await fetch('/api/approvals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId: selected.id, action, notes, workspaceId }),
    })
    setActing(false)
    setSelected(null)
    setNotes('')
    load()
  }

  const filtered = items.filter((i) => filter === 'all' ? true : i.status === filter)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">✅ Approval Inbox</h1>
        <p className="text-gray-400 text-sm mt-1">Review, approve, or reject every AI output before it leaves this system.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            {f} {f !== 'all' && <span className="ml-1 text-xs opacity-70">({items.filter((i) => i.status === f).length})</span>}
          </button>
        ))}
      </div>

      {loading && <div className="text-gray-400 text-sm">Loading approvals...</div>}

      {!loading && filtered.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">📥</div>
          <p className="text-white font-medium mb-2">No {filter === 'all' ? '' : filter} items</p>
          <p className="text-gray-500 text-sm">Generate content first, then come back to review and approve.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {filtered.map((item) => (
          <div key={item.id} className={`bg-gray-900 border rounded-xl p-5 cursor-pointer transition-all ${
            selected?.id === item.id ? 'border-indigo-600' : 'border-gray-800 hover:border-gray-700'
          }`} onClick={() => setSelected(selected?.id === item.id ? null : item)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm">{TYPE_LABELS[item.artifact_type] || item.artifact_type}</span>
                <h3 className="text-white font-medium text-sm">{item.artifact_title}</h3>
              </div>
              <StatusBadge status={item.status} />
            </div>

            {selected?.id === item.id && (
              <div className="mt-5 pt-5 border-t border-gray-800">
                <ContentPreview item={item} />

                {item.status === 'pending' && (
                  <div className="mt-5 space-y-3">
                    <textarea
                      className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-indigo-500"
                      placeholder="Add notes (required for rejection, optional for approval)..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-3">
                      <button onClick={() => act('approve')} disabled={acting}
                        className="flex-1 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                        {acting ? 'Saving...' : '✓ Approve'}
                      </button>
                      <button onClick={() => act('reject')} disabled={acting || !notes}
                        className="flex-1 py-2.5 rounded-lg bg-red-900 hover:bg-red-800 text-white text-sm font-medium transition-colors disabled:opacity-50">
                        ✕ Reject (needs note)
                      </button>
                    </div>
                  </div>
                )}

                {item.notes && (
                  <div className="mt-4 p-3 rounded-lg bg-gray-800 text-sm text-gray-300">
                    <span className="text-gray-500 text-xs">Notes: </span>{item.notes}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-900 text-yellow-300 border-yellow-800',
    approved: 'bg-green-900 text-green-300 border-green-800',
    rejected: 'bg-red-900 text-red-300 border-red-800',
  }
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${colors[status] || 'bg-gray-800 text-gray-400'}`}>
      {status}
    </span>
  )
}

function ContentPreview({ item }: { item: ApprovalItem }) {
  const c = item.content_json
  if (!c) return null

  const renderContent = () => {
    switch (item.artifact_type) {
      case 'linkedInPost':
        return <pre className="text-gray-300 text-sm whitespace-pre-wrap">{c.hook as string}{'\n\n'}{c.body as string}</pre>
      case 'emailDraft':
        return (
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-500">Subject: </span><span className="text-white">{c.subject as string}</span></p>
            <pre className="text-gray-300 whitespace-pre-wrap">{c.body as string}</pre>
          </div>
        )
      case 'adCopy':
        return (
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-500">Headline: </span><span className="text-white font-medium">{c.headline as string}</span></p>
            <p className="text-gray-300">{c.primaryText as string}</p>
            <p><span className="text-gray-500">CTA: </span><span className="text-indigo-400">{c.cta as string}</span></p>
          </div>
        )
      default:
        return <pre className="text-gray-400 text-xs whitespace-pre-wrap overflow-auto max-h-48">{JSON.stringify(c, null, 2)}</pre>
    }
  }

  return <div className="bg-gray-800 rounded-lg p-4">{renderContent()}</div>
}
