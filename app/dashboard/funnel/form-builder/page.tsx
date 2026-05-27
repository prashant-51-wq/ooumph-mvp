'use client'

/**
 * /dashboard/funnel/form-builder
 *
 * 3-pane funnel composer:
 *
 *   ┌──────────────┬─────────────────────┬──────────────────────┐
 *   │ Templates +  │  Source editor      │  Live preview         │
 *   │ saved funnels│  (raw HTML)         │  (iframe → /api/f)    │
 *   │              │  (lead-form helper) │                       │
 *   └──────────────┴─────────────────────┴──────────────────────┘
 *
 * Three starter templates ship out of the box. Saved funnels are loaded
 * from /api/funnel-steps and persist via POST/PATCH. The Live Preview
 * uses a sandboxed iframe pointing at /api/f/[slug] so the user sees
 * exactly what their visitor will see — view_count bumps included.
 *
 * The bundled lead-form snippet posts to /api/f/submit with the funnel
 * slug, so the 60-second dedup window and conversion_count atomic bump
 * fire automatically.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LayoutTemplate, Save, Eye, Code2, Copy, Trash2, Plus, RefreshCw,
  Sparkles, AlertCircle, CheckCircle2, ExternalLink, ClipboardCheck,
  FileText, X,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────

interface FunnelStep {
  id: string
  workspace_id: string
  slug: string
  html_content: string
  view_count: number | string
  conversion_count: number | string
  created_at: string
}

interface Template {
  id: string
  name: string
  description: string
  html: (slug: string) => string
}

// ─── Templates ─────────────────────────────────────────────────────────────

const FORM_SNIPPET = (slug: string) => `<form id="ooumph-form" onsubmit="ooumphSubmit(event)">
  <input name="email" type="email" placeholder="you@company.com" required />
  <input name="name" type="text" placeholder="Full name" />
  <button type="submit">Get instant access</button>
  <p id="ooumph-result"></p>
</form>
<script>
  async function ooumphSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const result = document.getElementById('ooumph-result');
    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    const data = Object.fromEntries(new FormData(form).entries());
    data.slug = ${JSON.stringify(slug)};
    try {
      const res = await fetch('/api/f/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const out = await res.json();
      if (out.ok) {
        result.textContent = 'Thanks! Check your inbox.';
        result.style.color = '#10b981';
        form.reset();
      } else {
        result.textContent = out.error || 'Submission failed.';
        result.style.color = '#f87171';
      }
    } catch (err) {
      result.textContent = 'Network error — please retry.';
      result.style.color = '#f87171';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Get instant access';
    }
  }
</script>`

const TEMPLATES: Template[] = [
  {
    id: 'lead-magnet',
    name: 'Lead Magnet',
    description: 'Centered headline + email capture form. The classic.',
    html: (slug) => `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Get the 2026 SaaS Growth Playbook</title>
  <style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;
           background: linear-gradient(135deg,#0b0d12 0%,#161a23 100%);
           color:#e7e9ee; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .card { max-width:560px; width:100%; padding:48px 40px; background:#0f1218;
            border:1px solid #1f2430; border-radius:18px;
            box-shadow:0 24px 48px rgba(0,0,0,0.4); }
    h1 { font-size:36px; line-height:1.15; margin:0 0 12px; letter-spacing:-0.02em; font-weight:800; }
    p.sub { color:#8b93a3; margin:0 0 28px; line-height:1.6; font-size:16px; }
    form { display:flex; flex-direction:column; gap:10px; }
    input { background:#0b0d12; border:1px solid #2a2f3c; color:#fff;
            padding:14px 16px; border-radius:10px; font-size:15px; font-family:inherit; }
    input:focus { outline:none; border-color:#6366f1; }
    button { background:#6366f1; color:#fff; padding:14px 20px; border:0;
             border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; font-family:inherit;
             transition:background 0.15s; }
    button:hover { background:#4f46e5; }
    button:disabled { opacity:0.6; cursor:not-allowed; }
    #ooumph-result { margin:12px 0 0; font-size:14px; min-height:20px; }
    .badge { display:inline-block; padding:4px 10px; background:#1f2430; color:#9ca3af;
             border-radius:99px; font-size:12px; margin-bottom:20px; }
  </style>
</head><body>
  <div class="card">
    <span class="badge">FREE · 32-page PDF</span>
    <h1>The 2026 SaaS Growth Playbook</h1>
    <p class="sub">7 proven plays we use to scale B2B SaaS from $0 to $1M ARR — distilled into a 32-page guide. Pop in your email and we'll send it instantly.</p>
    ${FORM_SNIPPET(slug)}
  </div>
</body></html>`,
  },
  {
    id: 'webinar',
    name: 'Webinar Signup',
    description: 'Date/time prominently displayed + RSVP form.',
    html: (slug) => `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Live Webinar — Reserve Your Seat</title>
  <style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,sans-serif;
           background:#0b0d12; color:#e7e9ee; min-height:100vh;
           display:flex; align-items:center; justify-content:center; padding:24px; }
    .grid { max-width:980px; width:100%; display:grid; grid-template-columns:1.2fr 1fr; gap:32px; align-items:center; }
    @media (max-width:768px) { .grid { grid-template-columns:1fr; } }
    .info h1 { font-size:42px; line-height:1.1; margin:0 0 16px; font-weight:800; letter-spacing:-0.02em; }
    .info p { color:#8b93a3; line-height:1.6; margin:0 0 16px; }
    .when { display:inline-block; padding:10px 16px; background:#1f2430;
            border:1px solid #2a2f3c; border-radius:10px; margin-bottom:20px;
            font-size:14px; color:#a5b4fc; font-weight:500; }
    .card { background:#0f1218; border:1px solid #1f2430; padding:32px;
            border-radius:18px; box-shadow:0 24px 48px rgba(0,0,0,0.4); }
    .card h2 { font-size:20px; margin:0 0 6px; font-weight:700; }
    .card .sub { color:#8b93a3; margin:0 0 20px; font-size:14px; }
    form { display:flex; flex-direction:column; gap:10px; }
    input { background:#0b0d12; border:1px solid #2a2f3c; color:#fff;
            padding:12px 14px; border-radius:10px; font-size:14px; font-family:inherit; }
    button { background:#6366f1; color:#fff; padding:13px 20px; border:0;
             border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; font-family:inherit; }
    #ooumph-result { font-size:13px; margin:8px 0 0; min-height:18px; }
  </style>
</head><body>
  <div class="grid">
    <div class="info">
      <span class="when">📅 Thursday · 11:00 AM PT</span>
      <h1>The exact 4-step funnel that 10x'd our pipeline</h1>
      <p>I'm walking through the live attribution dashboards, the cold-outreach playbook, and the AI agent stack we use — with Q&amp;A at the end.</p>
      <p style="color:#6b7280;font-size:13px;">⚡ Limited to 100 seats · Recording available to registrants only</p>
    </div>
    <div class="card">
      <h2>Reserve your seat</h2>
      <p class="sub">We'll email the link 1 hour before kickoff.</p>
      ${FORM_SNIPPET(slug)}
    </div>
  </div>
</body></html>`,
  },
  {
    id: 'demo',
    name: 'Demo Request',
    description: 'B2B demo booking with company-size qualifier.',
    html: (slug) => `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Book a personalized demo</title>
  <style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,sans-serif;
           background:#0b0d12; color:#e7e9ee; min-height:100vh; padding:48px 24px; }
    .container { max-width:520px; margin:0 auto; }
    h1 { font-size:32px; margin:0 0 12px; font-weight:800; letter-spacing:-0.02em; }
    p.lede { color:#8b93a3; margin:0 0 32px; line-height:1.6; }
    .card { background:#0f1218; border:1px solid #1f2430; padding:28px;
            border-radius:16px; }
    label { display:block; font-size:12px; text-transform:uppercase;
            letter-spacing:0.05em; color:#6b7280; margin:0 0 6px; }
    input, select { width:100%; box-sizing:border-box;
            background:#0b0d12; border:1px solid #2a2f3c; color:#fff;
            padding:12px 14px; border-radius:10px; font-size:14px;
            font-family:inherit; margin-bottom:14px; }
    button { width:100%; background:#6366f1; color:#fff; padding:14px;
             border:0; border-radius:10px; font-weight:600; font-size:15px;
             cursor:pointer; font-family:inherit; }
    #ooumph-result { margin:12px 0 0; font-size:13px; min-height:18px; text-align:center; }
    .perks { margin-top:24px; padding:0; list-style:none; color:#a5b4fc; font-size:13px; }
    .perks li { padding:4px 0; }
  </style>
</head><body>
  <div class="container">
    <h1>Book your personalized demo</h1>
    <p class="lede">30-min walkthrough of how Ooumph automates your marketing department. Tailored to your tech stack and pipeline goals.</p>
    <div class="card">
      ${FORM_SNIPPET(slug).replace(
        '<input name="name" type="text" placeholder="Full name" />',
        `<label for="name">Full name</label>
         <input name="name" id="name" type="text" placeholder="Jane Doe" required />
         <label for="company">Company</label>
         <input name="company" id="company" type="text" placeholder="Acme Inc." />
         <label for="company_size">Company size</label>
         <select name="company_size" id="company_size">
           <option value="">Select size…</option>
           <option value="1-10">1–10</option>
           <option value="11-50">11–50</option>
           <option value="51-200">51–200</option>
           <option value="201-1000">201–1000</option>
           <option value="1000+">1000+</option>
         </select>`,
      )}
      <ul class="perks">
        <li>✓ Live ROI calculator using your numbers</li>
        <li>✓ Tour of the AI agent decomposition engine</li>
        <li>✓ Custom 30-day pilot plan if it's a fit</li>
      </ul>
    </div>
  </div>
</body></html>`,
  },
]

// ─── Helpers ───────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return (input || '').toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled'
}
function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return d.toLocaleDateString()
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function FunnelBuilderPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [funnels, setFunnels] = useState<FunnelStep[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingSlug, setEditingSlug] = useState('')
  const [editingHtml, setEditingHtml] = useState('')
  const [editingMode, setEditingMode] = useState<'preview' | 'code'>('preview')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)  // bump to force iframe reload

  // Resolve workspace
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        const id: string | null = data?.user?.workspaceId
          || (typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null)
        setWorkspaceId(id)
      })
      .catch(() => { /* */ })
    return () => { cancelled = true }
  }, [])

  const fetchFunnels = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/funnel-steps?workspaceId=${workspaceId}`)
      const rows = await res.json() as FunnelStep[]
      setFunnels(Array.isArray(rows) ? rows : [])
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { fetchFunnels() }, [fetchFunnels])

  const selectedFunnel = useMemo(
    () => funnels.find(f => f.id === selectedId) || null,
    [funnels, selectedId],
  )

  // Load draft state when selection changes
  useEffect(() => {
    if (selectedFunnel) {
      setEditingSlug(selectedFunnel.slug)
      setEditingHtml(selectedFunnel.html_content)
      setSaveError(null); setSaveSuccess(null)
    }
  }, [selectedFunnel])

  const isDirty = useMemo(() => {
    if (!selectedFunnel) return editingSlug.length > 0 || editingHtml.length > 0
    return (
      editingSlug !== selectedFunnel.slug
      || editingHtml !== selectedFunnel.html_content
    )
  }, [selectedFunnel, editingSlug, editingHtml])

  // Save (create or update)
  const save = async () => {
    if (!workspaceId) return
    const cleanSlug = slugify(editingSlug)
    if (!cleanSlug) { setSaveError('Slug is required'); return }
    if (!editingHtml.trim()) { setSaveError('Page HTML cannot be empty'); return }
    setSaving(true); setSaveError(null); setSaveSuccess(null)
    try {
      if (selectedFunnel) {
        // PATCH
        const res = await fetch('/api/funnel-steps', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedFunnel.id, workspaceId,
            slug: cleanSlug, htmlContent: editingHtml,
          }),
        })
        const data = await res.json() as { ok?: boolean; error?: string; slug?: string }
        if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed')
        setSaveSuccess(`Updated · /lp/${data.slug || cleanSlug}`)
      } else {
        // POST
        const res = await fetch('/api/funnel-steps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, slug: cleanSlug, htmlContent: editingHtml }),
        })
        const data = await res.json() as { ok?: boolean; error?: string; id?: string; slug?: string }
        if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed')
        setSaveSuccess(`Created · /lp/${data.slug || cleanSlug}`)
        if (data.id) setSelectedId(data.id)
      }
      await fetchFunnels()
      // Force the preview iframe to reload so the visitor view is fresh.
      setPreviewKey(prev => prev + 1)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!workspaceId) return
    if (!confirm('Delete this funnel page? Form submissions stay in the audit trail.')) return
    try {
      const res = await fetch(`/api/funnel-steps?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || 'Delete failed')
      }
      if (selectedId === id) {
        setSelectedId(null)
        setEditingSlug(''); setEditingHtml('')
      }
      fetchFunnels()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  const applyTemplate = (tpl: Template) => {
    const slug = selectedFunnel?.slug || `${tpl.id}-${Date.now().toString(36).slice(-4)}`
    setEditingSlug(slug)
    setEditingHtml(tpl.html(slug))
    setShowTemplates(false)
    setSaveSuccess(null)
  }

  const startBlank = () => {
    setSelectedId(null)
    setEditingSlug('')
    setEditingHtml('')
    setSaveSuccess(null); setSaveError(null)
  }

  const insertFormSnippet = () => {
    const slug = slugify(editingSlug) || 'new-funnel'
    setEditingHtml(prev => prev + '\n\n' + FORM_SNIPPET(slug))
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <LayoutTemplate className="w-6 h-6 text-indigo-400" /> Funnel Builder
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Compose landing pages with built-in form capture. Submissions auto-rate-limit at 60s per email.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchFunnels}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={() => setShowTemplates(true)}
              className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-sm rounded-lg flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" /> Templates
            </button>
            <button
              onClick={startBlank}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New
            </button>
          </div>
        </div>

        {/* 3-pane layout */}
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-180px)] min-h-[600px]">
          {/* Left: saved funnels */}
          <aside className="col-span-3 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-800">
              <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">Saved funnels</p>
            </div>
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="p-6 text-center text-xs text-gray-500">Loading…</div>
              ) : funnels.length === 0 ? (
                <div className="p-6 text-center">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                  <p className="text-xs text-gray-500 mb-3">No funnels yet</p>
                  <button
                    onClick={() => setShowTemplates(true)}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Pick a template →
                  </button>
                </div>
              ) : (
                funnels.map(f => {
                  const v = Number(f.view_count || 0)
                  const c = Number(f.conversion_count || 0)
                  const cr = v > 0 ? (c / v) * 100 : 0
                  const active = selectedId === f.id
                  return (
                    <div key={f.id} className={`relative border-b border-gray-900 ${active ? 'bg-indigo-900/15 border-l-2 border-l-indigo-500' : 'hover:bg-gray-950/50'}`}>
                      <button onClick={() => setSelectedId(f.id)} className="w-full text-left px-3 py-3">
                        <div className="text-sm text-white font-medium truncate">/lp/{f.slug}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {v.toLocaleString()} views · {c.toLocaleString()} conv ({cr.toFixed(1)}%)
                        </div>
                        <div className="text-[10px] text-gray-600 mt-1">{formatRelative(f.created_at)}</div>
                      </button>
                      <button
                        onClick={() => remove(f.id)}
                        className="absolute top-2 right-2 p-1 text-gray-600 hover:text-rose-400 hover:bg-gray-800 rounded opacity-0 group-hover:opacity-100"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </aside>

          {/* Middle: editor */}
          <section className="col-span-5 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs text-gray-500">/lp/</span>
                <input
                  value={editingSlug}
                  onChange={e => setEditingSlug(e.target.value)}
                  placeholder="my-funnel"
                  className="flex-1 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm text-white font-mono focus:border-indigo-600 focus:outline-none"
                />
              </div>
              <div className="flex gap-1 bg-gray-950 border border-gray-800 rounded p-0.5">
                <button
                  onClick={() => setEditingMode('preview')}
                  className={`px-2 py-1 text-xs rounded ${editingMode === 'preview' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  <Eye className="w-3 h-3 inline mr-1" /> Preview
                </button>
                <button
                  onClick={() => setEditingMode('code')}
                  className={`px-2 py-1 text-xs rounded ${editingMode === 'code' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  <Code2 className="w-3 h-3 inline mr-1" /> Code
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              {editingMode === 'code' ? (
                <textarea
                  value={editingHtml}
                  onChange={e => setEditingHtml(e.target.value)}
                  placeholder="<!doctype html>..."
                  spellCheck={false}
                  className="flex-1 w-full bg-gray-950 border-0 px-3 py-3 text-xs text-gray-100 font-mono resize-none focus:outline-none"
                />
              ) : (
                <iframe
                  key={`local-${previewKey}`}
                  srcDoc={editingHtml || '<div style="color:#666;padding:48px;text-align:center;font-family:sans-serif;">Empty page — paste HTML or pick a template.</div>'}
                  sandbox="allow-scripts allow-forms"
                  className="flex-1 w-full bg-white"
                  title="Local preview"
                />
              )}

              <div className="border-t border-gray-800 px-3 py-2 bg-gray-950/50 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-2">
                  <button
                    onClick={insertFormSnippet}
                    className="px-2 py-1 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 rounded inline-flex items-center gap-1"
                    title="Append a working lead-capture form bound to this funnel slug"
                  >
                    <Plus className="w-3 h-3" /> Insert form
                  </button>
                  <CopyButton text={FORM_SNIPPET(slugify(editingSlug) || 'new-funnel')} label="Copy form snippet" />
                </div>
                <button
                  onClick={save}
                  disabled={saving || !isDirty}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded inline-flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving…' : selectedFunnel ? 'Save changes' : 'Save funnel'}
                </button>
              </div>
              {saveError && (
                <div className="px-3 py-2 bg-rose-950/40 border-t border-rose-900 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-3 h-3" /> {saveError}
                </div>
              )}
              {saveSuccess && (
                <div className="px-3 py-2 bg-emerald-950/40 border-t border-emerald-900 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3" /> {saveSuccess}
                </div>
              )}
            </div>
          </section>

          {/* Right: live preview from server */}
          <section className="col-span-4 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">Live visitor view</p>
                <p className="text-[11px] text-gray-600 mt-0.5">Hits /api/f/[slug] — view_count bumps included</p>
              </div>
              {selectedFunnel && (
                <a
                  href={`/api/f/${selectedFunnel.slug}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                >
                  Open <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="flex-1">
              {selectedFunnel ? (
                <iframe
                  key={`server-${selectedFunnel.id}-${previewKey}`}
                  src={`/api/f/${selectedFunnel.slug}`}
                  sandbox="allow-scripts allow-forms allow-same-origin"
                  className="w-full h-full bg-white"
                  title="Live funnel preview"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-center text-gray-500 text-sm p-6">
                  <div>
                    <Eye className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                    Save the funnel first to see the live visitor view here.
                  </div>
                </div>
              )}
            </div>
            {selectedFunnel && (
              <div className="border-t border-gray-800 px-4 py-2 text-[11px] text-gray-500 flex items-center justify-between">
                <span>
                  Views: <span className="text-emerald-300 tabular-nums">{Number(selectedFunnel.view_count || 0).toLocaleString()}</span>
                </span>
                <span>
                  Conversions: <span className="text-emerald-300 tabular-nums">{Number(selectedFunnel.conversion_count || 0).toLocaleString()}</span>
                </span>
              </div>
            )}
          </section>
        </div>
      </div>

      {showTemplates && (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onApply={applyTemplate}
        />
      )}
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }
  return (
    <button
      onClick={copy}
      className="px-2 py-1 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 rounded inline-flex items-center gap-1"
    >
      {copied ? <ClipboardCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

function TemplatesModal({
  onClose, onApply,
}: { onClose: () => void; onApply: (tpl: Template) => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" /> Pick a starter template
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3 overflow-auto">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => onApply(t)}
              className="text-left p-4 bg-gray-950 border border-gray-800 rounded-lg hover:border-indigo-700 transition-colors"
            >
              <div className="text-sm font-medium text-white mb-1">{t.name}</div>
              <p className="text-xs text-gray-500 leading-snug">{t.description}</p>
              <div className="mt-3 text-[11px] text-indigo-400">Use this template →</div>
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-800 text-[11px] text-gray-600">
          Every template ships with a working <code className="text-indigo-300">/api/f/submit</code> form pre-bound to the funnel slug — no extra wiring needed.
        </div>
      </div>
    </div>
  )
}
