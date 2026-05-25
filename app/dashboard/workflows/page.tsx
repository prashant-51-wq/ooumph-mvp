'use client'

/**
 * /dashboard/workflows — Workflow Engine
 * Create, manage, and monitor persistent automations.
 * AI agent designs workflows from natural language.
 */
import { useState, useEffect, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface WorkflowNode {
  id: string
  type: string
  subject?: string
  body?: string
  status?: string
  scoreChange?: number
  scoreSet?: number
  note?: string
  activityTitle?: string
  delay_minutes?: number
  tag?: string
}

interface Workflow {
  id: string
  name: string
  description: string | null
  trigger_type: string
  trigger_config: string | Record<string, unknown>
  nodes: string | WorkflowNode[]
  status: 'draft' | 'active' | 'paused'
  run_count: number
  last_run_at: string | null
  total_runs: number
  successful_runs: number
  created_at: string
}

interface Suggestion {
  name: string
  description: string
  trigger: string
  priority: string
  reasoning: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function parseNodes(raw: string | WorkflowNode[]): WorkflowNode[] {
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) as WorkflowNode[] } catch { return [] }
}

function parseTriggerConfig(raw: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) as Record<string, unknown> } catch { return {} }
}

const TRIGGER_LABELS: Record<string, string> = {
  lead_captured: '🌱 Lead Captured',
  email_received: '📥 Email Received',
  meeting_booked: '📅 Meeting Booked',
  meeting_noshow: '👻 No-show',
  meeting_completed: '✅ Meeting Completed',
  score_threshold: '📊 Score Threshold',
  status_changed: '🔄 Status Changed',
  manual: '▶️ Manual',
}

const NODE_LABELS: Record<string, string> = {
  send_email: '📤 Send Email',
  update_status: '🔄 Update Status',
  update_score: '📊 Update Score',
  add_note: '📝 Add Note',
  log_activity: '📋 Log Activity',
  wait: '⏳ Wait',
  condition: '⚡ Condition',
  send_booking_link: '📅 Send Booking Link',
  ai_reply: '🤖 AI Reply',
}

function nodeLabel(node: WorkflowNode): string {
  const base = NODE_LABELS[node.type] || node.type
  if (node.type === 'wait') return `⏳ Wait ${node.delay_minutes ? Math.round(node.delay_minutes / 60) < 24 ? `${node.delay_minutes}m` : `${Math.round(node.delay_minutes / 1440)}d` : ''}`
  if (node.type === 'send_email') return `📤 ${node.subject?.slice(0, 30) || 'Email'}...`
  if (node.type === 'update_status') return `🔄 → ${node.status}`
  if (node.type === 'update_score') return `📊 Score ${node.scoreChange && node.scoreChange > 0 ? '+' : ''}${node.scoreChange || ''}${node.scoreSet !== undefined ? `= ${node.scoreSet}` : ''}`
  return base
}

function statusColor(s: string) {
  if (s === 'active') return { bg: '#1e3a2f', color: '#6ee7b7', dot: '#10b981' }
  if (s === 'paused') return { bg: '#2d2000', color: '#fbbf24', dot: '#f59e0b' }
  return { bg: '#1f2937', color: '#6b7280', dot: '#4b5563' }
}

function priorityColor(p: string) {
  if (p === 'high') return '#ef4444'
  if (p === 'medium') return '#f59e0b'
  return '#6b7280'
}

function timeAgo(ts: string | null): string {
  if (!ts) return 'never'
  const diff = Date.now() - new Date(ts).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function WorkflowsPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)

  // AI design state
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiDesigning, setAiDesigning] = useState(false)
  const [aiDraft, setAiDraft] = useState<{ name: string; description: string; trigger_type: string; trigger_config: Record<string, unknown>; nodes: WorkflowNode[]; explanation: string } | null>(null)

  // Manual create state
  const [createMode, setCreateMode] = useState<'ai' | 'manual'>('ai')
  const [manualForm, setManualForm] = useState({ name: '', description: '', triggerType: 'lead_captured', status: 'draft' })

  // Analysis state
  const [analysisWfId, setAnalysisWfId] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<{ health?: string; summary?: string; issues?: string[]; improvements?: string[] } | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)

  // Manual trigger state
  const [triggerWfId, setTriggerWfId] = useState<string | null>(null)
  const [triggerEmail, setTriggerEmail] = useState('')
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<string | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('ooumph_workspace')
    const ws = raw ? (JSON.parse(raw) as { id?: string }) : null
    const id = ws?.id || localStorage.getItem('workspaceId') || ''
    setWorkspaceId(id)
  }, [])

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    const res = await fetch(`/api/workflows?workspaceId=${workspaceId}`)
    if (res.ok) setWorkflows(await res.json() as Workflow[])
    setLoading(false)
  }, [workspaceId])

  useEffect(() => { void load() }, [load])

  async function getSuggestions() {
    if (!workspaceId) return
    setSuggestionsLoading(true)
    const res = await fetch('/api/agents/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, mode: 'suggest' }),
    })
    const data = await res.json() as { suggestions?: Suggestion[] }
    setSuggestions(data.suggestions || [])
    setSuggestionsLoading(false)
  }

  async function designWithAI() {
    if (!aiPrompt.trim() || !workspaceId) return
    setAiDesigning(true)
    setAiDraft(null)
    const res = await fetch('/api/agents/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, mode: 'design', description: aiPrompt }),
    })
    const data = await res.json() as { workflow?: typeof aiDraft }
    setAiDraft(data.workflow || null)
    setAiDesigning(false)
  }

  async function saveAIDraft() {
    if (!aiDraft || !workspaceId) return
    await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        name: aiDraft.name,
        description: aiDraft.description,
        triggerType: aiDraft.trigger_type,
        triggerConfig: aiDraft.trigger_config,
        nodes: aiDraft.nodes,
        status: 'draft',
      }),
    })
    setShowCreate(false)
    setAiDraft(null)
    setAiPrompt('')
    void load()
  }

  async function saveManual() {
    if (!workspaceId || !manualForm.name) return
    await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, ...manualForm, triggerType: manualForm.triggerType }),
    })
    setShowCreate(false)
    setManualForm({ name: '', description: '', triggerType: 'lead_captured', status: 'draft' })
    void load()
  }

  async function toggleStatus(wf: Workflow) {
    const next = wf.status === 'active' ? 'paused' : 'active'
    await fetch('/api/workflows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: wf.id, status: next }),
    })
    void load()
  }

  async function deleteWorkflow(id: string) {
    await fetch(`/api/workflows?id=${id}`, { method: 'DELETE' })
    void load()
  }

  async function analyzeWorkflow(id: string) {
    setAnalysisWfId(id)
    setAnalysisResult(null)
    setAnalysisLoading(true)
    const res = await fetch('/api/agents/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, mode: 'analyze', workflowId: id }),
    })
    const data = await res.json() as { analysis?: typeof analysisResult }
    setAnalysisResult(data.analysis || null)
    setAnalysisLoading(false)
  }

  async function runManually(wf: Workflow) {
    setTriggerWfId(wf.id)
    setTriggerResult(null)
    setTriggering(true)
    const email = triggerEmail.trim()
    let leadId: string | null = null
    if (email && workspaceId) {
      const lr = await fetch(`/api/leads-captured?workspaceId=${workspaceId}`)
      const leads = await lr.json() as Array<{ id: string; email: string }>
      const match = leads.find(l => l.email === email)
      if (match) leadId = match.id
    }
    await fetch('/api/workflows/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, triggerType: wf.trigger_type === 'manual' ? wf.trigger_type : wf.trigger_type, leadId: leadId || undefined, contactEmail: email || undefined }),
    })
    setTriggerResult('✅ Workflow triggered')
    setTriggering(false)
    setTimeout(() => { setTriggerWfId(null); setTriggerResult(null) }, 3000)
    void load()
  }

  async function activateSuggestion(s: Suggestion) {
    setAiPrompt(s.description)
    setCreateMode('ai')
    setShowCreate(true)
  }

  const s = {
    page: { padding: '24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' } as React.CSSProperties,
    title: { fontSize: '22px', fontWeight: 700, color: '#e5e7eb', marginBottom: '4px' },
    sub: { fontSize: '13px', color: '#6b7280', marginBottom: '24px' },
    row: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' as const },
    btn: (v: 'primary' | 'ghost' | 'danger' | 'green' | 'yellow') => ({
      padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
      background: v === 'primary' ? '#4f46e5' : v === 'green' ? '#065f46' : v === 'danger' ? '#7f1d1d' : v === 'yellow' ? '#451a03' : '#1f2937',
      color: v === 'primary' ? '#fff' : v === 'green' ? '#6ee7b7' : v === 'danger' ? '#fca5a5' : v === 'yellow' ? '#fbbf24' : '#9ca3af',
    }),
    card: { background: '#111827', border: '1px solid #1f2937', borderRadius: '14px', marginBottom: '12px', overflow: 'hidden' } as React.CSSProperties,
    cardHeader: { padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' } as React.CSSProperties,
    nodeChip: { display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: '6px', background: '#1f2937', color: '#9ca3af', fontSize: '11px', marginRight: '6px', marginBottom: '4px' } as React.CSSProperties,
    input: { width: '100%', padding: '9px 12px', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#e5e7eb', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const },
    textarea: { width: '100%', padding: '9px 12px', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#e5e7eb', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical' as const, fontFamily: 'inherit', minHeight: '80px' },
    label: { fontSize: '11px', fontWeight: 600, color: '#4b5563', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '6px', display: 'block' },
    modal: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '24px' },
    modalBox: { background: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '28px', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto' as const },
  }

  const activeCount = workflows.filter(w => w.status === 'active').length

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.title}>⚡ Workflow Engine</div>
      <div style={s.sub}>Persistent automations that fire when events happen — no manual intervention needed</div>

      {/* Stats + actions */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '12px 18px', display: 'flex', gap: '20px' }}>
          {[
            { label: 'Total', value: workflows.length },
            { label: 'Active', value: activeCount, color: '#10b981' },
            { label: 'Total Runs', value: workflows.reduce((s, w) => s + (Number(w.total_runs) || 0), 0) },
          ].map(stat => (
            <div key={stat.label}>
              <div style={{ fontSize: '10px', color: '#4b5563', fontWeight: 600 }}>{stat.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: stat.color || '#e5e7eb' }}>{stat.value}</div>
            </div>
          ))}
        </div>
        <button style={s.btn('primary')} onClick={() => setShowCreate(true)}>+ New Workflow</button>
        <button style={s.btn('ghost')} onClick={() => void getSuggestions()} disabled={suggestionsLoading}>
          {suggestionsLoading ? '⏳' : '💡 AI Suggestions'}
        </button>
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div style={{ background: '#0f1117', border: '1px solid #1f2937', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#4b5563', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>
            🤖 AI-Suggested Workflows
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#e5e7eb' }}>{s.name}</div>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: priorityColor(s.priority), background: '#1f2937', padding: '2px 6px', borderRadius: '4px' }}>{s.priority.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px', lineHeight: 1.5 }}>{s.description}</div>
                <div style={{ fontSize: '10px', color: '#4b5563', marginBottom: '8px' }}>{TRIGGER_LABELS[s.trigger] || s.trigger}</div>
                <button style={{ ...s, padding: '5px 10px', borderRadius: '6px', background: '#1e1b4b', color: '#818cf8', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                  onClick={() => void activateSuggestion(s)}>
                  Build This →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workflow list */}
      {loading ? (
        <div style={{ color: '#4b5563', textAlign: 'center', padding: '40px' }}>Loading workflows...</div>
      ) : workflows.length === 0 ? (
        <div style={{ ...s.card, padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚡</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>No workflows yet</div>
          <div style={{ fontSize: '13px', color: '#374151', marginBottom: '16px' }}>Build your first automation or get AI suggestions</div>
          <button style={s.btn('primary')} onClick={() => setShowCreate(true)}>+ Create First Workflow</button>
        </div>
      ) : (
        workflows.map(wf => {
          const nodes = parseNodes(wf.nodes)
          const sc = statusColor(wf.status)
          const isExpanded = expanded === wf.id
          return (
            <div key={wf.id} style={s.card}>
              {/* Card header */}
              <div style={s.cardHeader} onClick={() => setExpanded(isExpanded ? null : wf.id)}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#e5e7eb' }}>{wf.name}</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: sc.bg, color: sc.color }}>
                      {wf.status.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '11px', color: '#4b5563' }}>{TRIGGER_LABELS[wf.trigger_type] || wf.trigger_type}</span>
                  </div>
                  {wf.description && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{wf.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#4b5563', flexShrink: 0 }}>
                  <span>🏃 {wf.total_runs || 0} runs</span>
                  <span>Last: {timeAgo(wf.last_run_at)}</span>
                </div>
                <span style={{ color: '#4b5563', fontSize: '12px' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid #1f2937' }}>
                  {/* Nodes visualization */}
                  <div style={{ marginTop: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#4b5563', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Automation Steps ({nodes.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                      {nodes.map((node, i) => (
                        <span key={i}>
                          <span style={s.nodeChip}>{nodeLabel(node)}</span>
                          {i < nodes.length - 1 && <span style={{ color: '#374151', fontSize: '10px', marginRight: '4px' }}>→</span>}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Trigger config */}
                  {(() => {
                    const config = parseTriggerConfig(wf.trigger_config)
                    const keys = Object.keys(config).filter(k => config[k] !== undefined && config[k] !== null && String(config[k]) !== '')
                    return keys.length > 0 ? (
                      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '12px' }}>
                        Conditions: {keys.map(k => `${k} = ${String(config[k])}`).join(' · ')}
                      </div>
                    ) : null
                  })()}

                  {/* Analysis result */}
                  {analysisWfId === wf.id && (
                    <div style={{ background: '#0f1117', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                      {analysisLoading ? (
                        <div style={{ color: '#818cf8', fontSize: '12px' }}>⏳ Analysing...</div>
                      ) : analysisResult ? (
                        <>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: analysisResult.health === 'healthy' ? '#10b981' : '#f59e0b', marginBottom: '6px' }}>
                            {analysisResult.health?.toUpperCase()} — {analysisResult.summary}
                          </div>
                          {analysisResult.improvements?.map((imp, i) => (
                            <div key={i} style={{ fontSize: '11px', color: '#818cf8', marginTop: '4px' }}>→ {imp}</div>
                          ))}
                        </>
                      ) : null}
                    </div>
                  )}

                  {/* Manual trigger */}
                  {triggerWfId === wf.id && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      <input
                        style={{ ...s.input, flex: 1 }}
                        placeholder="Contact email (optional)..."
                        value={triggerEmail}
                        onChange={e => setTriggerEmail(e.target.value)}
                      />
                      <button style={s.btn('primary')} onClick={() => void runManually(wf)} disabled={triggering}>
                        {triggering ? '⏳' : '▶ Run'}
                      </button>
                    </div>
                  )}
                  {triggerWfId === wf.id && triggerResult && (
                    <div style={{ fontSize: '12px', color: '#6ee7b7', marginBottom: '10px' }}>{triggerResult}</div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button style={s.btn(wf.status === 'active' ? 'yellow' : 'green')} onClick={() => void toggleStatus(wf)}>
                      {wf.status === 'active' ? '⏸ Pause' : '▶ Activate'}
                    </button>
                    <button style={s.btn('ghost')} onClick={() => { setTriggerWfId(triggerWfId === wf.id ? null : wf.id) }}>
                      ▶ Manual Run
                    </button>
                    <button style={s.btn('ghost')} onClick={() => void analyzeWorkflow(wf.id)}>
                      🔍 Analyse
                    </button>
                    <button style={{ ...s.btn('danger'), marginLeft: 'auto' }} onClick={() => void deleteWorkflow(wf.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}

      {/* ── Create / AI Design Modal ─────────────────────────────────────────── */}
      {showCreate && (
        <div style={s.modal} onClick={() => setShowCreate(false)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#e5e7eb' }}>New Workflow</div>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            {/* Mode switch */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              {(['ai', 'manual'] as const).map(m => (
                <button
                  key={m}
                  style={{ ...s.btn(createMode === m ? 'primary' : 'ghost'), flex: 1 }}
                  onClick={() => setCreateMode(m)}
                >
                  {m === 'ai' ? '✨ AI Design' : '⚙️ Manual'}
                </button>
              ))}
            </div>

            {/* AI design mode */}
            {createMode === 'ai' && (
              <>
                {!aiDraft ? (
                  <>
                    <label style={s.label}>Describe the workflow you want</label>
                    <textarea
                      style={{ ...s.textarea, marginBottom: '12px' }}
                      placeholder="E.g. When a new lead is captured with score ≥ 70, immediately send a welcome email, wait 1 day, then send a follow-up with a booking link if they haven't replied..."
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                    />
                    <button style={{ ...s.btn('primary'), width: '100%' }} onClick={() => void designWithAI()} disabled={aiDesigning || !aiPrompt.trim()}>
                      {aiDesigning ? '⏳ Designing...' : '✨ Design Workflow'}
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ background: '#0f1117', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#e5e7eb', marginBottom: '4px' }}>{aiDraft.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>{aiDraft.description}</div>
                      <div style={{ fontSize: '11px', color: '#818cf8', marginBottom: '10px' }}>
                        Trigger: {TRIGGER_LABELS[aiDraft.trigger_type] || aiDraft.trigger_type}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
                        {aiDraft.nodes.map((node, i) => (
                          <span key={i} style={{ ...s.nodeChip, background: '#1e1b4b', color: '#818cf8' }}>
                            {nodeLabel(node)}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: 1.6 }}>{aiDraft.explanation}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button style={{ ...s.btn('ghost'), flex: 1 }} onClick={() => setAiDraft(null)}>← Redesign</button>
                      <button style={{ ...s.btn('primary'), flex: 2 }} onClick={() => void saveAIDraft()}>💾 Save as Draft</button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Manual mode */}
            {createMode === 'manual' && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label style={s.label}>Workflow Name</label>
                  <input style={s.input} value={manualForm.name} onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Hot Lead Nurture" />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={s.label}>Description</label>
                  <input style={s.input} value={manualForm.description} onChange={e => setManualForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this workflow do?" />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={s.label}>Trigger</label>
                  <select style={s.input} value={manualForm.triggerType} onChange={e => setManualForm(f => ({ ...f, triggerType: e.target.value }))}>
                    {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: '11px', color: '#4b5563', marginBottom: '16px', background: '#0f1117', borderRadius: '8px', padding: '10px 12px' }}>
                  💡 Use AI Design mode to automatically generate email copy and workflow logic. Manual mode creates a blank workflow — you can edit nodes via the API or use the AI to fill them.
                </div>
                <button style={{ ...s.btn('primary'), width: '100%' }} onClick={() => void saveManual()} disabled={!manualForm.name}>
                  Create Workflow
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
