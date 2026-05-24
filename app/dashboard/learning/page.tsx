'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface LearningNote {
  id: string
  note: string
  source_type: string
  source_id: string
  artifact_type: string
  artifact_title: string
  confidence: number
  created_at: string
}

const TYPE_LABELS: Record<string, string> = {
  carousel: 'Carousel',
  reelScript: 'Reel Script',
  adCopy: 'Ad Copy',
  emailDraft: 'Email Draft',
  linkedInPost: 'LinkedIn Post',
  strategy: 'Strategy',
  content_calendar: 'Content Calendar',
  funnel_plan: 'Funnel Plan',
  lead_gen_plan: 'Lead Gen Plan',
}

export default function LearningPage() {
  const router = useRouter()
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    fetch(`/api/learning?workspaceId=${wid}`)
      .then((r) => r.json())
      .then((data) => setNotes(Array.isArray(data) ? data : []))
      .finally(() => setFetching(false))
  }, [router])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">🧠 AI Learning Notes</h1>
        <p className="text-gray-400 text-sm mt-1">Feedback captured from rejected content — the AI applies these on every regeneration.</p>
      </div>

      {fetching && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex items-center gap-4">
          <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Loading learning notes...</p>
        </div>
      )}

      {!fetching && notes.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">📝</div>
          <p className="text-white font-medium mb-2">No learning notes yet</p>
          <p className="text-gray-500 text-sm">When you reject content in the Approvals queue and add notes, the AI remembers them here and applies them to future generations.</p>
        </div>
      )}

      {!fetching && notes.length > 0 && (
        <div className="space-y-4">
          <p className="text-gray-500 text-sm">{notes.length} note{notes.length !== 1 ? 's' : ''} — the AI references all of these when regenerating content</p>
          {notes.map((note) => (
            <div key={note.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {note.artifact_type && (
                    <span className="px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 text-xs">
                      {TYPE_LABELS[note.artifact_type] || note.artifact_type}
                    </span>
                  )}
                  {note.artifact_title && (
                    <span className="text-gray-500 text-xs">{note.artifact_title}</span>
                  )}
                </div>
                <span className="text-gray-600 text-xs whitespace-nowrap">
                  {new Date(note.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <p className="text-gray-200 text-sm leading-relaxed">{note.note}</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-gray-800">
                  <div className="h-1 rounded-full bg-indigo-600" style={{ width: `${(note.confidence || 0.8) * 100}%` }} />
                </div>
                <span className="text-gray-600 text-xs">{Math.round((note.confidence || 0.8) * 100)}% confidence</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
