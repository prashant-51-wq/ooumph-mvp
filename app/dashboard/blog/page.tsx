'use client'

/**
 * /dashboard/blog — Blog Drafts (Sprint 1C rewrite)
 *
 * The previous Blog Publisher contained zero `fetch()` calls. Every action
 * was a setTimeout fake:
 *   - `handlePublish()` was `await new Promise(r => setTimeout(r, 1500))`
 *     followed by a green "Published!" toast. Nothing reached WordPress
 *     or any other destination.
 *   - `runAiTool()` was setTimeout + a hardcoded text dictionary (the
 *     same canned "AI" paragraph every time).
 *   - `MOCK_POSTS` populated the Posts list with five fictional articles.
 *   - `DESTINATIONS` showed WordPress / Ghost / LinkedIn as "connected"
 *     with no real integration ever performed.
 *
 * There is no `/api/blog/posts` endpoint and no WordPress integration in
 * this codebase. Until that work lands, the honest thing is to scope the
 * page down to "Blog Drafts": a local-first composer for blog posts that
 * supports Save Draft, Export Markdown, Copy HTML, and Copy Plain Text.
 * Publishing is visibly disabled with a "Coming soon" notice that links
 * to the Integrations page.
 *
 * Drafts persist in localStorage under `ooumph_blog_drafts_v1`. This is
 * device-local, NOT a cloud sync — the UI surfaces that limitation
 * explicitly so a user never thinks their draft is safely stored on a
 * server when it isn't. (Refresh Test: drafts survive F5 on the same
 * device. Source Test: every visible draft traces back to localStorage,
 * which is documented as device-local.)
 *
 * When a real `/api/blog/drafts` endpoint ships (Sprint 3+), swap the
 * localStorage backing in `loadDrafts` / `saveDrafts` and remove the
 * device-local notice.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type BlogTab = 'drafts' | 'composer'

interface BlogDraft {
  id: string
  title: string
  body: string
  /** Raw plaintext word count for the body (best-effort split on whitespace). */
  wordCount: number
  createdAt: string
  updatedAt: string
}

// ─── localStorage backing ─────────────────────────────────────────────────────

const STORAGE_KEY = 'ooumph_blog_drafts_v1'

function loadDrafts(): BlogDraft[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return (parsed as BlogDraft[]).filter(d => d && typeof d.id === 'string')
  } catch {
    return []
  }
}

function saveDrafts(drafts: BlogDraft[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    // localStorage may be full or disabled in the user's browser — best-effort only.
  }
}

function countWords(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0
}

function newId(): string {
  // Cheap client-side id. Drafts never leave the device so collision risk is fine.
  return `draft_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

// Markdown → minimal HTML (good enough for "Copy HTML" — for a real blog publish
// the future API will do server-side rendering with proper sanitization).
function mdToHtml(md: string): string {
  // Headings, bold, italic, links, lists, paragraphs. Intentionally conservative.
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push('')
      continue
    }
    const h = /^(#{1,6})\s+(.*)/.exec(line)
    if (h) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h${h[1].length}>${escapeHtml(h[2])}</h${h[1].length}>`)
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inlineFormat(line.replace(/^\s*[-*]\s+/, ''))}</li>`)
      continue
    }
    if (inList) { out.push('</ul>'); inList = false }
    out.push(`<p>${inlineFormat(line)}</p>`)
  }
  if (inList) out.push('</ul>')
  return out.filter(Boolean).join('\n')
}

function inlineFormat(s: string): string {
  let r = escapeHtml(s)
  r = r.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  r = r.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t: string, u: string) => `<a href="${escapeAttr(u)}">${t}</a>`)
  return r
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BlogDraftsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<BlogTab>('drafts')

  // Draft state
  const [drafts, setDraftsState] = useState<BlogDraft[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [statusMsg, setStatusMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null)

  // Hydrate drafts from localStorage on mount.
  useEffect(() => {
    setDraftsState(loadDrafts())
  }, [])

  const persist = useCallback((next: BlogDraft[]) => {
    setDraftsState(next)
    saveDrafts(next)
  }, [])

  function startNew() {
    setEditingId(null)
    setTitle('')
    setBody('')
    setStatusMsg(null)
    setTab('composer')
  }

  function openDraft(id: string) {
    const d = drafts.find(x => x.id === id)
    if (!d) return
    setEditingId(id)
    setTitle(d.title)
    setBody(d.body)
    setStatusMsg(null)
    setTab('composer')
  }

  function saveDraft() {
    if (!title.trim() && !body.trim()) {
      setStatusMsg({ kind: 'error', text: 'Nothing to save — give the draft a title or some body text first.' })
      return
    }
    const now = new Date().toISOString()
    if (editingId) {
      const next = drafts.map(d => d.id === editingId
        ? { ...d, title: title.trim() || '(untitled)', body, wordCount: countWords(body), updatedAt: now }
        : d
      )
      persist(next)
      setStatusMsg({ kind: 'success', text: 'Draft updated. Saved locally on this device.' })
    } else {
      const draft: BlogDraft = {
        id: newId(),
        title: title.trim() || '(untitled)',
        body,
        wordCount: countWords(body),
        createdAt: now,
        updatedAt: now,
      }
      const next = [draft, ...drafts]
      persist(next)
      setEditingId(draft.id)
      setStatusMsg({ kind: 'success', text: 'Draft saved. Saved locally on this device.' })
    }
  }

  function deleteDraft(id: string) {
    if (!confirm('Delete this draft? This cannot be undone.')) return
    const next = drafts.filter(d => d.id !== id)
    persist(next)
    if (editingId === id) {
      setEditingId(null)
      setTitle('')
      setBody('')
      setTab('drafts')
    }
  }

  function exportMarkdown() {
    if (!title.trim() && !body.trim()) {
      setStatusMsg({ kind: 'error', text: 'Nothing to export.' })
      return
    }
    const md = title.trim() ? `# ${title.trim()}\n\n${body}` : body
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(title.trim() || 'draft').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}.md`
    a.click()
    URL.revokeObjectURL(url)
    setStatusMsg({ kind: 'info', text: 'Markdown downloaded.' })
  }

  async function copyToClipboard(text: string, label: string) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setStatusMsg({ kind: 'error', text: 'Clipboard not available in this browser.' })
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      setStatusMsg({ kind: 'success', text: `${label} copied to clipboard.` })
    } catch {
      setStatusMsg({ kind: 'error', text: 'Copy failed — your browser may have blocked clipboard access.' })
    }
  }

  function copyHtml() {
    if (!body.trim()) { setStatusMsg({ kind: 'error', text: 'Nothing to copy.' }); return }
    const html = title.trim()
      ? `<h1>${escapeHtml(title.trim())}</h1>\n${mdToHtml(body)}`
      : mdToHtml(body)
    copyToClipboard(html, 'HTML')
  }

  function copyPlainText() {
    if (!title.trim() && !body.trim()) { setStatusMsg({ kind: 'error', text: 'Nothing to copy.' }); return }
    const plain = title.trim() ? `${title.trim()}\n\n${body}` : body
    copyToClipboard(plain, 'Plain text')
  }

  const totalWords = useMemo(() => countWords(body), [body])
  const readTimeMin = Math.max(1, Math.round(totalWords / 220)) // ~220 wpm

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-gray-950">
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-sm">
              ✍️
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">Blog Drafts</h1>
              <p className="text-gray-600 text-xs">Draft &amp; export. Direct publishing coming soon.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={startNew}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              + New Draft
            </button>
          </div>
        </div>

        {/* Persistent "device-local" notice — never lie about storage */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-300 text-xs flex items-start gap-2">
            <span className="text-base flex-shrink-0">📝</span>
            <span className="flex-1">
              Drafts are saved <strong>locally in this browser</strong>, not in your workspace.
              They will not appear on other devices and may be cleared if you reset browser storage.
              Cloud-synced drafts and direct publishing to WordPress / Ghost / Medium will arrive in a future release —
              follow <button onClick={() => router.push('/dashboard/integrations')} className="underline">Integrations</button> for status.
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 px-6 flex-shrink-0 mt-3">
          {(['drafts', 'composer'] as BlogTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${tab === t ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              {t === 'drafts' ? `Drafts (${drafts.length})` : 'Composer'}
            </button>
          ))}
        </div>

        {/* ── DRAFTS TAB ─────────────────────────────────────────────────────── */}
        {tab === 'drafts' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {drafts.length === 0 ? (
              <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-2xl">
                <div className="text-5xl mb-3">✍️</div>
                <h3 className="text-white font-semibold text-base mb-1">No drafts yet</h3>
                <p className="text-gray-500 text-sm mb-4 max-w-md mx-auto">
                  Start a new draft. You can export it as Markdown / HTML or copy it into your CMS until direct publishing ships.
                </p>
                <button
                  onClick={startNew}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg"
                >
                  Start your first draft →
                </button>
              </div>
            ) : (
              drafts.map(d => (
                <div
                  key={d.id}
                  className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <button onClick={() => openDraft(d.id)} className="text-left w-full">
                      <p className="text-white font-medium text-sm truncate">{d.title || '(untitled)'}</p>
                      <p className="text-gray-500 text-xs mt-1">
                        {d.wordCount} word{d.wordCount === 1 ? '' : 's'} · Last edited {new Date(d.updatedAt).toLocaleString()}
                      </p>
                    </button>
                  </div>
                  <button
                    onClick={() => openDraft(d.id)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteDraft(d.id)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-red-900/40 hover:bg-red-900/60 text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── COMPOSER TAB ───────────────────────────────────────────────────── */}
        {tab === 'composer' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">

            {statusMsg && (
              <div className={`p-3 rounded-xl border text-sm flex items-start gap-2 ${
                statusMsg.kind === 'success' ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                  : statusMsg.kind === 'error' ? 'bg-red-950/40 border-red-800/50 text-red-300'
                    : 'bg-gray-900 border-gray-800 text-gray-400'
              }`}>
                <span>
                  {statusMsg.kind === 'success' ? '✓' : statusMsg.kind === 'error' ? '✕' : 'ℹ'}
                </span>
                <span className="flex-1">{statusMsg.text}</span>
                <button onClick={() => setStatusMsg(null)} className="text-gray-500 hover:text-white">×</button>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="text-gray-400 text-xs block mb-1.5">Title</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Your post title"
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5 text-white text-base placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Body */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-gray-400 text-xs">Body (Markdown supported)</label>
                <p className="text-gray-600 text-xs">
                  {totalWords} word{totalWords === 1 ? '' : 's'} · ~{readTimeMin} min read
                </p>
              </div>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={22}
                placeholder={`# Heading\n\nYour blog content here. **Bold**, *italic*, [links](https://example.com), and - bullet lists work.`}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
              />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={saveDraft}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
              >
                {editingId ? 'Update Draft' : 'Save Draft'}
              </button>
              <button
                onClick={exportMarkdown}
                disabled={!title.trim() && !body.trim()}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white font-medium text-sm transition-colors border border-gray-700"
              >
                ↓ Export Markdown
              </button>
              <button
                onClick={copyHtml}
                disabled={!body.trim()}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white font-medium text-sm transition-colors border border-gray-700"
              >
                Copy HTML
              </button>
              <button
                onClick={copyPlainText}
                disabled={!title.trim() && !body.trim()}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white font-medium text-sm transition-colors border border-gray-700"
              >
                Copy Plain Text
              </button>

              {/* Disabled-but-visible publish button so users see the feature is
                  intentionally on the roadmap, not missing. Tooltip explains. */}
              <span className="ml-auto">
                <button
                  disabled
                  title="Direct publishing to WordPress / Ghost / Medium / LinkedIn is on the roadmap. For now, copy HTML or export Markdown and paste into your CMS."
                  className="px-4 py-2 rounded-lg bg-gray-900 text-gray-600 font-medium text-sm cursor-not-allowed border border-gray-800"
                >
                  Publish to CMS — Coming soon
                </button>
              </span>
            </div>

            {editingId && (
              <p className="text-gray-600 text-xs">
                Editing draft saved {new Date(drafts.find(d => d.id === editingId)?.createdAt || Date.now()).toLocaleString()}.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── RIGHT SIDEBAR — only on composer tab ─────────────────────────────── */}
      {tab === 'composer' && (
        <div className="w-64 flex-shrink-0 border-l border-gray-800 overflow-y-auto">
          <div className="p-4 space-y-5">
            <div>
              <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">Recent drafts</h3>
              <div className="space-y-2">
                {drafts.slice(0, 5).map(d => (
                  <button
                    key={d.id}
                    onClick={() => openDraft(d.id)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors ${editingId === d.id ? 'bg-indigo-950/40 border-indigo-700' : 'bg-gray-900 border-gray-800 hover:border-gray-700'}`}
                  >
                    <p className="text-white text-xs font-medium truncate">{d.title || '(untitled)'}</p>
                    <p className="text-gray-600 text-xs mt-0.5">{d.wordCount} words · {new Date(d.updatedAt).toLocaleDateString()}</p>
                  </button>
                ))}
                {drafts.length === 0 && (
                  <p className="text-gray-600 text-xs">No drafts yet.</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">Markdown tips</h3>
              <ul className="text-gray-500 text-xs space-y-1.5 leading-relaxed">
                <li><code className="text-gray-300"># Title</code> — H1 heading</li>
                <li><code className="text-gray-300">## Section</code> — H2 heading</li>
                <li><code className="text-gray-300">**bold**</code> — <strong>bold</strong></li>
                <li><code className="text-gray-300">*italic*</code> — <em>italic</em></li>
                <li><code className="text-gray-300">[text](url)</code> — link</li>
                <li><code className="text-gray-300">- item</code> — bullet list</li>
              </ul>
            </div>

            <div>
              <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">AI assistance</h3>
              <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                <p className="text-gray-400 text-xs leading-relaxed">
                  AI write / expand / improve tools previously here were placeholder text inserts.
                  Real AI drafting will move to the CMO Dashboard streaming flow — prompt
                  &ldquo;Draft a blog post about X&rdquo; from there.
                </p>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="mt-2 text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Open CMO Dashboard →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
