'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  WORKFLOW_TRIGGERS,
  WORKFLOW_TEMPLATES,
  templateToWorkflowNodes,
  type WorkflowTemplate,
  type TriggerOption,
} from '@/lib/workflow-templates'

// ── Types ──────────────────────────────────────────────────────────────────────
type NodeType = 'trigger' | 'email' | 'sms' | 'wait' | 'condition' | 'tag' | 'update_contact' | 'ai_action' | 'notification'
type WorkflowStatus = 'Active' | 'Paused' | 'Draft'
type SidebarTab = 'workflows' | 'templates'

interface WorkflowNode {
  id: string
  type: NodeType
  label: string
  config: Record<string, string>
  branches?: { a: WorkflowNode[]; b: WorkflowNode[] }
}

interface WorkflowDef {
  id: string
  name: string
  triggerIcon: string
  status: WorkflowStatus
  enrolled: number
  lastRun: string
  nodes: WorkflowNode[]
  stats: { enrolled: number; completed: number; convRate: number; emailsSent: number; avgTime: string }
}

interface Template {
  id: string
  name: string
  stepCount: number
  category: string
  description: string
  nodes: WorkflowNode[]
}

// ── Mock node data ─────────────────────────────────────────────────────────────
const NODE_META: Record<NodeType, { label: string; icon: string; color: string; headerBg: string; border: string }> = {
  trigger:        { label:'Trigger',         icon:'🟢', color:'text-emerald-300', headerBg:'bg-emerald-950/70', border:'border-emerald-800' },
  email:          { label:'Send Email',      icon:'📧', color:'text-blue-300',    headerBg:'bg-blue-950/70',    border:'border-blue-800' },
  sms:            { label:'Send SMS',        icon:'📱', color:'text-blue-300',    headerBg:'bg-blue-950/70',    border:'border-blue-800' },
  wait:           { label:'Wait',            icon:'⏱',  color:'text-yellow-300',  headerBg:'bg-yellow-950/70',  border:'border-yellow-800' },
  condition:      { label:'Branch / If',     icon:'🔀', color:'text-purple-300',  headerBg:'bg-purple-950/70',  border:'border-purple-800' },
  tag:            { label:'Tag Contact',     icon:'🏷',  color:'text-gray-300',    headerBg:'bg-gray-800/70',    border:'border-gray-700' },
  update_contact: { label:'Update Contact',  icon:'📊', color:'text-gray-300',    headerBg:'bg-gray-800/70',    border:'border-gray-700' },
  ai_action:      { label:'AI Action',       icon:'🤖', color:'text-indigo-300',  headerBg:'bg-indigo-950/70',  border:'border-indigo-800' },
  notification:   { label:'Notify Team',     icon:'🔔', color:'text-orange-300',  headerBg:'bg-orange-950/70',  border:'border-orange-800' },
}

const STATUS_STYLES: Record<WorkflowStatus, string> = {
  Active: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  Paused: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  Draft:  'bg-gray-800/60 text-gray-400 border-gray-700',
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
function nid(): string { return `n${Date.now()}${Math.random().toString(36).slice(2,6)}` }

function makeNode(type: NodeType, config: Record<string,string> = {}): WorkflowNode {
  const defaults: Record<NodeType, Record<string,string>> = {
    trigger:        { event:'Contact Added' },
    email:          { subject:'Welcome to Ooumph!', from:'team@ooumph.io', template:'Welcome Email' },
    sms:            { message:'Hey {{first_name}}, thanks for joining! Reply STOP to opt out.' },
    wait:           { duration:'3', unit:'days', condition:'Continue after wait' },
    condition:      { field:'email_opened', operator:'=', value:'true', branch_a:'Yes', branch_b:'No' },
    tag:            { action:'Add', tag:'Onboarded' },
    update_contact: { field:'stage', value:'Customer' },
    ai_action:      { action:'Generate personalized email', prompt:'Write a follow-up based on last activity', output_field:'ai_email_body' },
    notification:   { message:'New hot lead: {{contact_name}}', channel:'Slack #sales' },
  }
  return { id: nid(), type, label: NODE_META[type].label, config: { ...defaults[type], ...config } }
}

// Sprint 16E (audit P2 #30): INITIAL_WORKFLOWS_REFERENCE removed. Real
// guided templates now live in lib/workflow-templates.ts (added in
// Sprint 16I) and are consumed by TemplateWizard below. The page state
// starts [] and hydrates from /api/workflows so users never see fake
// demo workflows that were never executable.

const TEMPLATES: Template[] = [
  { id:'t1', name:'Lead Nurture (7-step email)', stepCount:7, category:'Nurture', description:'Automated 7-email sequence for new leads over 21 days', nodes:[makeNode('trigger',{event:'Lead Captured'}),makeNode('email'),makeNode('wait',{duration:'1',unit:'days'}),makeNode('condition'),makeNode('email'),makeNode('wait',{duration:'3',unit:'days'}),makeNode('email')] },
  { id:'t2', name:'New Customer Onboarding', stepCount:8, category:'Onboarding', description:'Welcome sequence with milestones for new paying customers', nodes:[makeNode('trigger',{event:'Deal Closed'}),makeNode('tag',{action:'Add',tag:'Customer'}),makeNode('email'),makeNode('wait',{duration:'3',unit:'days'}),makeNode('email'),makeNode('wait',{duration:'7',unit:'days'}),makeNode('email'),makeNode('notification')] },
  { id:'t3', name:'Win-back Campaign', stepCount:5, category:'Re-engagement', description:'Re-engage churned or at-risk contacts with offers', nodes:[makeNode('trigger',{event:'Tag: At Risk'}),makeNode('wait',{duration:'1',unit:'days'}),makeNode('email'),makeNode('wait',{duration:'5',unit:'days'}),makeNode('condition')] },
  { id:'t4', name:'Appointment Reminder', stepCount:3, category:'Operational', description:'Email + SMS reminders before scheduled meetings', nodes:[makeNode('trigger',{event:'Meeting Booked'}),makeNode('email'),makeNode('sms')] },
  { id:'t5', name:'Review Request', stepCount:4, category:'Post-sale', description:'Ask happy customers for reviews and testimonials', nodes:[makeNode('trigger',{event:'Deal Closed'}),makeNode('wait',{duration:'7',unit:'days'}),makeNode('email'),makeNode('notification')] },
  { id:'t6', name:'Birthday Message', stepCount:2, category:'Engagement', description:'Automated birthday email with a personal touch', nodes:[makeNode('trigger',{event:'Birthday Date'}),makeNode('ai_action',{action:'Generate personalized email',prompt:'Write a warm birthday message'})] },
  { id:'t7', name:'Event Follow-up', stepCount:5, category:'Events', description:'Post-event nurture sequence to convert attendees', nodes:[makeNode('trigger',{event:'Event Attended'}),makeNode('email'),makeNode('wait',{duration:'1',unit:'days'}),makeNode('email'),makeNode('tag',{action:'Add',tag:'Event Attendee'})] },
]

const AI_SUGGESTIONS = [
  { text:'Add a 3-day follow-up email after the welcome email', action:'Add Email + Wait node', nodeType:'email' as NodeType },
  { text:'Consider adding a branch: If email not opened after 2 days → send SMS instead', action:'Add Condition + SMS', nodeType:'condition' as NodeType },
  { text:'Score contacts with AI after they complete the sequence', action:'Add AI Action node', nodeType:'ai_action' as NodeType },
  { text:'Tag contacts who clicked the CTA for targeted follow-up', action:'Add Tag node', nodeType:'tag' as NodeType },
]

const NODE_TYPES_PICKER: { type: NodeType; label: string; icon: string }[] = [
  { type:'email', label:'Send Email', icon:'📧' },
  { type:'sms', label:'Send SMS', icon:'📱' },
  { type:'wait', label:'Wait / Delay', icon:'⏱' },
  { type:'condition', label:'Branch / If', icon:'🔀' },
  { type:'tag', label:'Tag Contact', icon:'🏷' },
  { type:'update_contact', label:'Update Contact', icon:'📊' },
  { type:'ai_action', label:'AI Action', icon:'🤖' },
  { type:'notification', label:'Notify Team', icon:'🔔' },
]

// ── Node Block Component ───────────────────────────────────────────────────────
function NodeBlock({
  node, isFirst, onEdit, onDelete, onAddBelow, isSelected,
}: {
  node: WorkflowNode
  isFirst: boolean
  onEdit: (n: WorkflowNode) => void
  onDelete: (id: string) => void
  onAddBelow: (id: string) => void
  isSelected: boolean
}) {
  const meta = NODE_META[node.type]
  const configPreview = Object.entries(node.config).slice(0, 2).map(([k, v]) => v).filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col items-center">
      {/* Connector line from above */}
      {!isFirst && (
        <div className="flex flex-col items-center">
          <div className="w-0.5 h-5 bg-gray-700" />
          <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-600" />
        </div>
      )}

      {/* Node card */}
      <div
        className={`w-72 rounded-xl border transition-all cursor-pointer group ${meta.border} ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-gray-950' : 'hover:border-gray-600'}`}
        onClick={() => onEdit(node)}
      >
        {/* Header */}
        <div className={`${meta.headerBg} px-3 py-2 rounded-t-xl flex items-center justify-between border-b ${meta.border}`}>
          <div className="flex items-center gap-2">
            <span className="text-sm">{meta.icon}</span>
            <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit(node)} className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-white text-xs" title="Edit">✏</button>
            <button onClick={() => onDelete(node.id)} className="p-1 rounded hover:bg-red-900/40 text-gray-600 hover:text-red-400 text-xs" title="Delete">🗑</button>
          </div>
        </div>

        {/* Body */}
        <div className="bg-gray-900 rounded-b-xl px-3 py-2.5">
          <p className="text-gray-300 text-xs leading-relaxed">{configPreview || 'Click to configure...'}</p>
          {node.type === 'condition' && (
            <div className="flex gap-2 mt-2">
              <span className="flex-1 px-2 py-1 bg-emerald-950/40 border border-emerald-800/40 rounded text-xs text-emerald-400 text-center">
                A: {node.config.branch_a || 'Yes'}
              </span>
              <span className="flex-1 px-2 py-1 bg-red-950/40 border border-red-800/40 rounded text-xs text-red-400 text-center">
                B: {node.config.branch_b || 'No'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Add below button */}
      <div className="flex flex-col items-center mt-1" onClick={e => e.stopPropagation()}>
        <div className="w-0.5 h-3 bg-gray-800" />
        <button
          onClick={() => onAddBelow(node.id)}
          className="w-6 h-6 rounded-full border border-dashed border-gray-700 hover:border-indigo-500 bg-gray-900 hover:bg-indigo-950/40 text-gray-600 hover:text-indigo-400 flex items-center justify-center text-sm transition-all"
          title="Add step below"
        >
          +
        </button>
      </div>
    </div>
  )
}

// ── Node Type Picker Dropdown ──────────────────────────────────────────────────
function NodeTypePicker({ onSelect, onClose }: { onSelect: (type: NodeType) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 w-72 shadow-2xl" onClick={e => e.stopPropagation()}>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Step</p>
        <div className="grid grid-cols-2 gap-2">
          {NODE_TYPES_PICKER.map(t => (
            <button
              key={t.type}
              onClick={() => { onSelect(t.type); onClose() }}
              className="flex items-center gap-2 px-3 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 rounded-lg text-sm text-gray-300 transition-colors text-left"
            >
              <span>{t.icon}</span>
              <span className="text-xs">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Node Config Panel ──────────────────────────────────────────────────────────
function NodeConfigPanel({ node, onUpdate, onClose }: { node: WorkflowNode; onUpdate: (n: WorkflowNode) => void; onClose: () => void }) {
  const [cfg, setCfg] = useState({ ...node.config })
  const meta = NODE_META[node.type]

  function save() { onUpdate({ ...node, config: cfg }); onClose() }

  function field(key: string, label: string, type: 'text' | 'select' = 'text', options?: string[]) {
    return (
      <div key={key}>
        <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">{label}</label>
        {type === 'select' && options ? (
          <select value={cfg[key] || ''} onChange={e => setCfg(c => ({...c, [key]:e.target.value}))} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input value={cfg[key] || ''} onChange={e => setCfg(c => ({...c, [key]:e.target.value}))} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
        )}
      </div>
    )
  }

  return (
    <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col overflow-hidden flex-shrink-0">
      <div className={`${meta.headerBg} border-b ${meta.border} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span>{meta.icon}</span>
          <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {node.type === 'trigger' && (
          <>
            {field('event', 'Trigger Event', 'select', ['Contact Added','Form Submitted','Tag Added','Deal Stage Changed','Date','Email Opened','Email Clicked','Meeting Booked'])}
          </>
        )}
        {node.type === 'email' && (
          <>
            {field('subject', 'Subject Line')}
            {field('from', 'From Name')}
            {field('template', 'Template', 'select', ['Welcome Email','Follow-up Email','Proposal Email','Onboarding Welcome','Day 3 Onboarding','Win-back Offer','Custom'])}
          </>
        )}
        {node.type === 'sms' && (
          <>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">SMS Message</label>
              <textarea value={cfg.message || ''} onChange={e => setCfg(c => ({...c, message:e.target.value}))} rows={4} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" placeholder="Use {{first_name}}, {{company}} etc." />
              <p className="text-gray-600 text-xs mt-1">{(cfg.message || '').length}/160 chars</p>
            </div>
          </>
        )}
        {node.type === 'wait' && (
          <>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Wait Duration</label>
              <div className="flex gap-2">
                <input type="number" value={cfg.duration || '1'} onChange={e => setCfg(c => ({...c, duration:e.target.value}))} className="w-20 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
                <select value={cfg.unit || 'days'} onChange={e => setCfg(c => ({...c, unit:e.target.value}))} className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
                  {['minutes','hours','days','weeks'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            {field('condition', 'Wait Condition', 'select', ['Continue after wait','Wait until email opened','Wait until email clicked','Wait until reply received'])}
          </>
        )}
        {node.type === 'condition' && (
          <>
            {field('field', 'Field', 'select', ['email_opened','email_clicked','score','stage','tag','last_activity_days'])}
            {field('operator', 'Operator', 'select', ['=','!=','>=','<=','contains'])}
            {field('value', 'Value')}
            {field('branch_a', 'Branch A Label (True)')}
            {field('branch_b', 'Branch B Label (False)')}
          </>
        )}
        {node.type === 'tag' && (
          <>
            {field('action', 'Action', 'select', ['Add','Remove'])}
            {field('tag', 'Tag Name')}
          </>
        )}
        {node.type === 'update_contact' && (
          <>
            {field('field', 'Field to Update', 'select', ['stage','score','notes','company','phone'])}
            {field('value', 'New Value')}
          </>
        )}
        {node.type === 'ai_action' && (
          <>
            {field('action', 'AI Action', 'select', ['Generate personalized email','Score contact with AI','Suggest next action','Summarize contact history','Predict churn risk'])}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Prompt Template</label>
              <textarea value={cfg.prompt || ''} onChange={e => setCfg(c => ({...c, prompt:e.target.value}))} rows={3} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" />
            </div>
            {field('output_field', 'Save Output To')}
          </>
        )}
        {node.type === 'notification' && (
          <>
            {field('message', 'Notification Message')}
            {field('channel', 'Channel', 'select', ['Slack #sales','Slack #marketing','Email: team','In-app notification'])}
          </>
        )}
      </div>

      <div className="border-t border-gray-800 p-4">
        <button onClick={save} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
          Save Node
        </button>
      </div>
    </div>
  )
}

// ── AI Generate Workflow Modal ─────────────────────────────────────────────────
function AIGenerateModal({ onClose, onGenerate }: { onClose: () => void; onGenerate: (name: string, nodes: WorkflowNode[]) => void }) {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ name: string; nodes: WorkflowNode[] } | null>(null)

  function generate() {
    if (!prompt.trim()) return
    setGenerating(true)
    setTimeout(() => {
      setResult({
        name: 'AI-Generated: ' + prompt.slice(0, 40),
        nodes: [
          makeNode('trigger', { event:'Contact Added' }),
          makeNode('email', { subject:`Welcome — ${prompt.slice(0,30)}...`, template:'Welcome Email' }),
          makeNode('wait', { duration:'2', unit:'days' }),
          makeNode('condition', { field:'email_opened', operator:'=', value:'true', branch_a:'Engaged', branch_b:'Re-engage' }),
          makeNode('ai_action', { action:'Generate personalized email', prompt:`Generate follow-up for: ${prompt}` }),
          makeNode('wait', { duration:'5', unit:'days' }),
          makeNode('notification', { message:'Contact completed AI workflow', channel:'Slack #sales' }),
        ],
      })
      setGenerating(false)
    }, 2000)
  }

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">🤖 Generate Workflow with AI</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {!result ? (
            <>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Describe your goal</label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="e.g. Nurture new leads with a 5-email sequence over 2 weeks, branch based on email opens, and notify the sales team when someone clicks the CTA..."
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none placeholder-gray-500"
                />
              </div>
              {generating && (
                <div className="flex items-center gap-3 p-3 bg-indigo-950/30 border border-indigo-800/40 rounded-lg">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <p className="text-indigo-300 text-sm">AI is designing your workflow...</p>
                </div>
              )}
              <button onClick={generate} disabled={!prompt.trim() || generating} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
                {generating ? 'Generating...' : 'Generate Workflow'}
              </button>
            </>
          ) : (
            <>
              <div className="bg-gray-800/50 rounded-xl p-4">
                <h3 className="text-white font-semibold mb-3">{result.name}</h3>
                <div className="space-y-1.5">
                  {result.nodes.map((n, i) => {
                    const m = NODE_META[n.type]
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs">{m.icon}</span>
                        <span className={`text-xs ${m.color}`}>{m.label}</span>
                        <span className="text-gray-600 text-xs">—</span>
                        <span className="text-gray-400 text-xs truncate">{Object.values(n.config)[0]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setResult(null)} className="flex-1 py-2.5 border border-gray-700 text-gray-400 rounded-lg text-sm hover:text-white">← Regenerate</button>
                <button onClick={() => { onGenerate(result.name, result.nodes); onClose() }} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium">Use this workflow</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Map UI node type → backend trigger node type (lib/workflow-engine.ts)
const NODE_TYPE_MAP: Record<NodeType, string> = {
  trigger:        'trigger',
  email:          'send_email',
  sms:            'send_sms',
  wait:           'wait',
  condition:      'condition',
  tag:            'add_tag',
  update_contact: 'update_contact',
  ai_action:      'ai_action',
  notification:   'notify',
}

// Translate UI node + config → backend node payload
function nodeToPayload(n: WorkflowNode): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: n.id,
    type: NODE_TYPE_MAP[n.type] || n.type,
  }
  const c = n.config || {}
  switch (n.type) {
    case 'email':
      return { ...base, subject: c.subject, body: c.template || c.body }
    case 'sms':
      return { ...base, message: c.message }
    case 'wait': {
      const dur = Number(c.duration) || 0
      const unit = c.unit || 'days'
      return {
        ...base,
        delay_minutes: unit === 'minutes' ? dur : 0,
        delay_hours: unit === 'hours' ? dur : 0,
        delay_days: unit === 'days' ? dur : (unit === 'weeks' ? dur * 7 : 0),
      }
    }
    case 'condition':
      return { ...base, field: c.field, operator: c.operator, value: c.value }
    case 'tag':
      return { ...base, tag: c.tag }
    case 'update_contact':
      return { ...base, field_updates: c.field && c.value ? { [c.field]: c.value } : {} }
    case 'ai_action':
      return { ...base, prompt: c.prompt, output_field: c.output_field }
    case 'notification':
      return { ...base, channel: (c.channel || '').toLowerCase().includes('slack') ? 'slack' : 'in_app', body: c.message }
    case 'trigger':
    default:
      return base
  }
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function WorkflowsPage() {
  // Sprint 15F (P2 #19): start empty instead of with INITIAL_WORKFLOWS demo
  // seed. The /api/workflows fetch effect hydrates real rows; showing fake
  // workflows before then was misleading users into thinking demos were live.
  const [workflows, setWorkflows] = useState<WorkflowDef[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('workflows')
  const [filterStatus, setFilterStatus] = useState<string>('All')
  const [editingNode, setEditingNode] = useState<WorkflowNode | null>(null)
  const [addBelowId, setAddBelowId] = useState<string | null>(null)
  const [showAIGenerate, setShowAIGenerate] = useState(false)
  // Sprint 16I (P1 #23): guided nurture-template wizard.
  const [showTemplateWizard, setShowTemplateWizard] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState('')
  const [loadingFromApi, setLoadingFromApi] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  // Load workflows from API on mount
  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { setLoadingFromApi(false); return }
    fetch(`/api/workflows?workspaceId=${wid}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: Array<{ id: string; name: string; status: string; nodes: string | unknown[]; run_count?: number; last_run_at?: string }>) => {
        if (!Array.isArray(rows) || rows.length === 0) { setLoadingFromApi(false); return }
        const loaded: WorkflowDef[] = rows.map(r => {
          let parsedNodes: unknown[] = []
          try { parsedNodes = typeof r.nodes === 'string' ? JSON.parse(r.nodes) : (r.nodes || []) } catch { parsedNodes = [] }
          // Reverse-map backend node types back to UI types
          const REVERSE_MAP: Record<string, NodeType> = {
            trigger: 'trigger', send_email: 'email', send_sms: 'sms', wait: 'wait',
            condition: 'condition', add_tag: 'tag', update_contact: 'update_contact',
            ai_action: 'ai_action', ai_reply: 'ai_action', notify: 'notification',
            notify_slack: 'notification', send_booking_link: 'email',
          }
          const uiNodes = (parsedNodes as Array<{ id?: string; type: string; [k: string]: unknown }>).map(n => {
            const uiType = REVERSE_MAP[n.type] || 'trigger'
            const config: Record<string, string> = {}
            for (const [k, v] of Object.entries(n)) {
              if (k !== 'id' && k !== 'type' && v != null) config[k] = String(v)
            }
            return { id: n.id || nid(), type: uiType, label: NODE_META[uiType].label, config }
          })
          const status: WorkflowStatus = r.status === 'active' ? 'Active' : r.status === 'paused' ? 'Paused' : 'Draft'
          return {
            id: r.id,
            name: r.name,
            triggerIcon: '⚡',
            status,
            enrolled: 0,
            lastRun: r.last_run_at ? new Date(r.last_run_at).toLocaleString() : 'Never',
            nodes: uiNodes,
            stats: { enrolled: 0, completed: r.run_count || 0, convRate: 0, emailsSent: 0, avgTime: '—' },
          }
        })
        setWorkflows(loaded)
        setSelectedId(loaded[0]?.id || '')
      })
      .catch(err => console.error('[workflows] load failed:', err))
      .finally(() => setLoadingFromApi(false))
  }, [])

  const selected = workflows.find(w => w.id === selectedId) || workflows[0]

  // Persist current workflow to API
  const persistWorkflow = useCallback(async (wf: WorkflowDef) => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { setSaveError('No workspace selected'); return }
    setSaving(true); setSaveError(''); setSaveSuccess('')
    try {
      const nodes = wf.nodes.map(nodeToPayload)
      const status = wf.status === 'Active' ? 'active' : wf.status === 'Paused' ? 'paused' : 'draft'
      // If id looks like a local-only id (starts with 'wf' followed by timestamp), create new
      const isLocalId = wf.id.startsWith('wf') && /\d+/.test(wf.id) && wf.id.length < 20
      if (isLocalId) {
        const res = await fetch('/api/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: wid,
            name: wf.name,
            triggerType: 'lead_captured',
            nodes,
            status,
          }),
        })
        const data = await res.json() as { id?: string; ok?: boolean; error?: string }
        if (!data.id) throw new Error(data.error || 'Save failed')
        // Replace local id with server id
        setWorkflows(ws => ws.map(w => w.id === wf.id ? { ...w, id: data.id! } : w))
        if (selectedId === wf.id) setSelectedId(data.id)
      } else {
        const res = await fetch('/api/workflows', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: wf.id, name: wf.name, nodes, status }),
        })
        const data = await res.json() as { ok?: boolean; error?: string }
        if (!data.ok) throw new Error(data.error || 'Save failed')
      }
      setSaveSuccess('✓ Saved')
      setTimeout(() => setSaveSuccess(''), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [selectedId])

  function updateWorkflow(id: string, patch: Partial<WorkflowDef>) {
    setWorkflows(ws => ws.map(w => w.id === id ? { ...w, ...patch } : w))
  }

  function addNode(type: NodeType) {
    if (!selected) return
    const newNode = makeNode(type)
    let nodes: WorkflowNode[]
    if (addBelowId) {
      const idx = selected.nodes.findIndex(n => n.id === addBelowId)
      nodes = [...selected.nodes.slice(0, idx + 1), newNode, ...selected.nodes.slice(idx + 1)]
    } else {
      nodes = [...selected.nodes, newNode]
    }
    updateWorkflow(selected.id, { nodes })
    setAddBelowId(null)
    setEditingNode(newNode)
  }

  function updateNode(updated: WorkflowNode) {
    if (!selected) return
    updateWorkflow(selected.id, { nodes: selected.nodes.map(n => n.id === updated.id ? updated : n) })
    setEditingNode(updated)
  }

  function deleteNode(id: string) {
    if (!selected) return
    updateWorkflow(selected.id, { nodes: selected.nodes.filter(n => n.id !== id) })
    if (editingNode?.id === id) setEditingNode(null)
  }

  function createFromTemplate(t: Template) {
    const newWf: WorkflowDef = {
      id: `wf${Date.now()}`,
      name: t.name,
      triggerIcon: '✨',
      status: 'Draft',
      enrolled: 0,
      lastRun: 'Never',
      nodes: t.nodes.map(n => ({ ...n, id: nid() })),
      stats: { enrolled: 0, completed: 0, convRate: 0, emailsSent: 0, avgTime: '—' },
    }
    setWorkflows(ws => [newWf, ...ws])
    setSelectedId(newWf.id)
    setSidebarTab('workflows')
  }

  function createBlank() {
    const newWf: WorkflowDef = {
      id: `wf${Date.now()}`,
      name: 'New Workflow',
      triggerIcon: '⚡',
      status: 'Draft',
      enrolled: 0,
      lastRun: 'Never',
      nodes: [makeNode('trigger')],
      stats: { enrolled: 0, completed: 0, convRate: 0, emailsSent: 0, avgTime: '—' },
    }
    setWorkflows(ws => [newWf, ...ws])
    setSelectedId(newWf.id)
  }

  /** Sprint 16I (P1 #23): create a workflow from a guided template +
   *  trigger, POST to /api/workflows so it appears in the list
   *  immediately, then select it. */
  async function createFromGuidedTemplate(opts: {
    template: WorkflowTemplate
    trigger: TriggerOption
    customized: Record<number, { subject: string; body: string }>
  }) {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { setSaveError('No workspace'); return }
    setSaving(true); setSaveError(''); setSaveSuccess('')
    try {
      const nodes = templateToWorkflowNodes(opts.template, opts.customized)
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: wid,
          name: opts.template.name,
          triggerType: opts.trigger.id,
          triggerConfig: opts.trigger.defaultConfig || {},
          nodes,
          status: 'draft',
        }),
      })
      const data = await res.json() as { id?: string; error?: string }
      if (!data.id) throw new Error(data.error || 'Save failed')

      // Build the UI representation so the new workflow appears in the
      // sidebar without a full refetch. The shape mirrors the loader.
      const REVERSE_MAP: Record<string, NodeType> = {
        trigger: 'trigger', send_email: 'email', send_sms: 'sms', wait: 'wait',
        condition: 'condition', add_tag: 'tag', update_contact: 'update_contact',
        ai_action: 'ai_action', notify: 'notification',
      }
      const uiNodes: WorkflowNode[] = nodes.map(n => {
        const uiType = REVERSE_MAP[n.type as string] || 'trigger'
        const config: Record<string, string> = {}
        for (const [k, v] of Object.entries(n)) {
          if (k !== 'id' && k !== 'type' && v != null) config[k] = String(v)
        }
        return { id: (n.id as string) || nid(), type: uiType, label: NODE_META[uiType].label, config }
      })
      const newWf: WorkflowDef = {
        id: data.id,
        name: opts.template.name,
        triggerIcon: '✨',
        status: 'Draft',
        enrolled: 0,
        lastRun: 'Never',
        nodes: uiNodes,
        stats: { enrolled: 0, completed: 0, convRate: 0, emailsSent: 0, avgTime: '—' },
      }
      setWorkflows(ws => [newWf, ...ws])
      setSelectedId(newWf.id)
      setSidebarTab('workflows')
      setSaveSuccess('✓ Created from template')
      setTimeout(() => setSaveSuccess(''), 2500)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function generateFromAI(name: string, nodes: WorkflowNode[]) {
    const newWf: WorkflowDef = {
      id: `wf${Date.now()}`,
      name,
      triggerIcon: '🤖',
      status: 'Draft',
      enrolled: 0,
      lastRun: 'Never',
      nodes,
      stats: { enrolled: 0, completed: 0, convRate: 0, emailsSent: 0, avgTime: '—' },
    }
    setWorkflows(ws => [newWf, ...ws])
    setSelectedId(newWf.id)
  }

  function toggleStatus() {
    if (!selected) return
    const next = selected.status === 'Active' ? 'Paused' : selected.status === 'Paused' ? 'Active' : 'Active'
    updateWorkflow(selected.id, { status: next })
  }

  const filteredWorkflows = workflows.filter(w => filterStatus === 'All' || w.status === filterStatus)

  return (
    <div className="flex h-full bg-gray-950 overflow-hidden">

      {/* ── Left Sidebar ────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
        {/* Sidebar header */}
        <div className="px-4 py-4 border-b border-gray-800">
          <button onClick={createBlank} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors mb-2">
            + New Workflow
          </button>
          {/* Sprint 16I (P1 #23): guided nurture-template wizard.
              Wraps lib/workflow-templates.ts → backend node array → POST
              /api/workflows. The new workflow shows up in this same
              sidebar list as soon as the wizard completes. */}
          <button onClick={() => setShowTemplateWizard(true)} className="w-full py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg text-xs font-medium transition-colors mb-3">
            ✨ Create from template
          </button>
          {/* Tabs */}
          <div className="flex rounded-lg border border-gray-700 overflow-hidden">
            {(['workflows','templates'] as SidebarTab[]).map(t => (
              <button key={t} onClick={() => setSidebarTab(t)} className={`flex-1 py-1.5 text-xs font-medium capitalize transition-colors ${sidebarTab === t ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>{t}</button>
            ))}
          </div>
        </div>

        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto">
          {sidebarTab === 'workflows' && (
            <>
              {/* Filter */}
              <div className="flex gap-1 px-3 py-2 border-b border-gray-800/60">
                {['All','Active','Paused','Draft'].map(f => (
                  <button key={f} onClick={() => setFilterStatus(f)} className={`px-2 py-1 rounded text-xs transition-colors ${filterStatus === f ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>{f}</button>
                ))}
              </div>
              <div className="p-2 space-y-1">
                {filteredWorkflows.map(wf => (
                  <div
                    key={wf.id}
                    onClick={() => setSelectedId(wf.id)}
                    className={`px-3 py-3 rounded-lg cursor-pointer transition-colors ${selectedId === wf.id ? 'bg-indigo-950/50 border border-indigo-800/60' : 'hover:bg-gray-800/50'}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm">{wf.triggerIcon}</span>
                      <span className="text-white text-sm font-medium truncate flex-1">{wf.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_STYLES[wf.status]}`}>{wf.status}</span>
                      <span className="text-gray-600 text-xs">{wf.enrolled} enrolled</span>
                      <span className="text-gray-700 text-xs ml-auto">{wf.lastRun}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {sidebarTab === 'templates' && (
            <div className="p-3 space-y-2">
              {TEMPLATES.map(t => (
                <div key={t.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                  <div className="flex items-start justify-between mb-1.5">
                    <div>
                      <p className="text-white text-sm font-medium leading-tight">{t.name}</p>
                      <span className="text-xs text-indigo-400">{t.category}</span>
                    </div>
                    <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{t.stepCount} steps</span>
                  </div>
                  <p className="text-gray-500 text-xs mb-2.5 leading-relaxed">{t.description}</p>
                  <button onClick={() => createFromTemplate(t)} className="w-full py-1.5 bg-indigo-900/40 hover:bg-indigo-900/60 border border-indigo-800/40 text-indigo-300 rounded-lg text-xs font-medium transition-colors">
                    Use Template
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main Canvas Area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {selected && (
          <>
            {/* ── Canvas Header ── */}
            <div className="flex items-center gap-3 px-6 py-3.5 border-b border-gray-800 bg-gray-900 flex-shrink-0 flex-wrap gap-y-2">
              {/* Editable workflow name */}
              {editingName ? (
                <input
                  autoFocus
                  value={nameVal}
                  onChange={e => setNameVal(e.target.value)}
                  onBlur={() => { updateWorkflow(selected.id, { name: nameVal || selected.name }); setEditingName(false) }}
                  onKeyDown={e => { if (e.key === 'Enter') { updateWorkflow(selected.id, { name: nameVal || selected.name }); setEditingName(false) } }}
                  className="text-white font-semibold bg-gray-800 border border-indigo-500 rounded-lg px-2 py-1 text-sm focus:outline-none"
                />
              ) : (
                <h2
                  className="text-white font-semibold cursor-pointer hover:text-indigo-300 transition-colors"
                  onDoubleClick={() => { setNameVal(selected.name); setEditingName(true) }}
                  title="Double-click to edit"
                >
                  {selected.name}
                </h2>
              )}

              <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_STYLES[selected.status]}`}>{selected.status}</span>
              <span className="text-gray-600 text-xs">{selected.nodes.length} steps</span>
              <span className="text-gray-600 text-xs">· {selected.enrolled} enrolled</span>

              <div className="ml-auto flex items-center gap-2">
                {saveSuccess && <span className="text-emerald-400 text-xs">{saveSuccess}</span>}
                {saveError && <span className="text-red-400 text-xs">{saveError}</span>}
                <button
                  onClick={async () => {
                    const newStatus: WorkflowStatus = selected.status === 'Active' ? 'Paused' : 'Active'
                    updateWorkflow(selected.id, { status: newStatus })
                    await persistWorkflow({ ...selected, status: newStatus })
                  }}
                  disabled={saving}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${selected.status === 'Active' ? 'bg-yellow-950/40 border-yellow-800 text-yellow-300 hover:bg-yellow-950/60' : 'bg-emerald-950/40 border-emerald-800 text-emerald-300 hover:bg-emerald-950/60'}`}
                >
                  {selected.status === 'Active' ? '⏸ Pause' : '▶ Activate'}
                </button>
                <button
                  onClick={async () => {
                    const wid = localStorage.getItem('workspaceId')
                    if (!wid) { setSaveError('No workspace'); return }
                    setSaveSuccess('Triggering test run…')
                    try {
                      const res = await fetch('/api/workflows/trigger', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          workspaceId: wid,
                          triggerType: 'lead_captured',
                          data: { test_run: true, contact_email: 'test@example.com' },
                        }),
                      })
                      const data = await res.json() as { triggered?: number; error?: string }
                      if (data.error) throw new Error(data.error)
                      setSaveSuccess(`✓ Test fired (${data.triggered || 0} workflows ran)`)
                      setTimeout(() => setSaveSuccess(''), 4000)
                    } catch (err) {
                      setSaveError(err instanceof Error ? err.message : 'Test failed')
                      setTimeout(() => setSaveError(''), 4000)
                    }
                  }}
                  disabled={saving}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                  ▶ Test Workflow
                </button>
                <button
                  onClick={() => persistWorkflow(selected)}
                  disabled={saving}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                  {saving ? '⟳ Saving…' : '💾 Save'}
                </button>
              </div>
            </div>

            {/* ── Stats Row ── */}
            <div className="grid grid-cols-5 gap-px bg-gray-800 border-b border-gray-800 flex-shrink-0">
              {[
                { label:'Enrolled', value:selected.stats.enrolled, color:'text-white' },
                { label:'Completed', value:selected.stats.completed, color:'text-emerald-300' },
                { label:'Conv Rate', value:`${selected.stats.convRate}%`, color:'text-indigo-300' },
                { label:'Emails Sent', value:selected.stats.emailsSent, color:'text-blue-300' },
                { label:'Avg Time', value:selected.stats.avgTime, color:'text-gray-300' },
              ].map(s => (
                <div key={s.label} className="bg-gray-900 px-4 py-2.5">
                  <p className="text-xs text-gray-600">{s.label}</p>
                  <p className={`text-sm font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* ── Canvas + Right Panel ── */}
            <div className="flex flex-1 overflow-hidden">
              {/* Canvas */}
              <div className="flex-1 overflow-auto p-8 flex justify-center">
                <div className="flex flex-col items-center">
                  {selected.nodes.map((node, i) => (
                    <NodeBlock
                      key={node.id}
                      node={node}
                      isFirst={i === 0}
                      onEdit={n => setEditingNode(editingNode?.id === n.id ? null : n)}
                      onDelete={deleteNode}
                      onAddBelow={id => setAddBelowId(id)}
                      isSelected={editingNode?.id === node.id}
                    />
                  ))}

                  {/* Add node at end */}
                  {selected.nodes.length === 0 && (
                    <div className="text-center py-16">
                      <p className="text-gray-600 text-sm mb-4">No steps yet. Add your first step.</p>
                    </div>
                  )}
                  <div className="mt-2">
                    <button
                      onClick={() => { setAddBelowId(null); setAddBelowId('__end__') }}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-800/60 hover:bg-indigo-950/40 border border-dashed border-gray-700 hover:border-indigo-600 rounded-lg text-gray-500 hover:text-indigo-400 text-sm transition-all"
                    >
                      + Add Step
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Config Panel */}
              {editingNode && (
                <NodeConfigPanel
                  node={editingNode}
                  onUpdate={updateNode}
                  onClose={() => setEditingNode(null)}
                />
              )}
            </div>

            {/* ── AI Suggestions Strip ── */}
            <div className="border-t border-gray-800 bg-gray-900/80 px-4 py-3 flex-shrink-0">
              <div className="flex items-start gap-4 overflow-x-auto pb-0.5">
                <div className="flex-shrink-0">
                  <span className="text-xs text-gray-600 font-semibold uppercase tracking-wide">🤖 AI</span>
                </div>
                {AI_SUGGESTIONS.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 flex-shrink-0 bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2">
                    <p className="text-gray-400 text-xs max-w-xs">{s.text}</p>
                    <button
                      onClick={() => addNode(s.nodeType)}
                      className="flex-shrink-0 px-2.5 py-1 bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-800/40 text-indigo-400 text-xs rounded-lg transition-colors whitespace-nowrap"
                    >
                      {s.action}
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setShowAIGenerate(true)}
                  className="flex-shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                >
                  Generate Full Workflow with AI
                </button>
              </div>
            </div>
          </>
        )}

        {!selected && (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <div className="text-center">
              <div className="text-5xl mb-4">⚡</div>
              <p className="text-lg font-medium text-gray-400 mb-2">Select a workflow</p>
              <p className="text-sm text-gray-600">or create a new one from the sidebar</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Node Type Picker ── */}
      {addBelowId && (
        <NodeTypePicker
          onSelect={type => { addNode(type); setAddBelowId(null) }}
          onClose={() => setAddBelowId(null)}
        />
      )}

      {/* ── AI Generate Modal ── */}
      {showAIGenerate && (
        <AIGenerateModal
          onClose={() => setShowAIGenerate(false)}
          onGenerate={generateFromAI}
        />
      )}

      {/* ── Guided template wizard (Sprint 16I P1 #23) ── */}
      {showTemplateWizard && (
        <TemplateWizard
          onClose={() => setShowTemplateWizard(false)}
          onCreate={async (opts) => {
            await createFromGuidedTemplate(opts)
            setShowTemplateWizard(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Guided Template Wizard (Sprint 16I P1 #23) ────────────────────────────

function TemplateWizard({
  onClose, onCreate,
}: {
  onClose: () => void
  onCreate: (opts: {
    template: WorkflowTemplate
    trigger: TriggerOption
    customized: Record<number, { subject: string; body: string }>
  }) => Promise<void>
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [trigger, setTrigger] = useState<TriggerOption | null>(null)
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null)
  const [customized, setCustomized] = useState<Record<number, { subject: string; body: string }>>({})
  const [submitting, setSubmitting] = useState(false)

  // Re-seed customizations when a different template is picked.
  useEffect(() => {
    if (!template) return
    const seed: Record<number, { subject: string; body: string }> = {}
    template.steps.forEach((s, idx) => {
      if (s.kind === 'email') seed[idx] = { subject: s.subject, body: s.body }
    })
    setCustomized(seed)
  }, [template])

  const emailSteps = template
    ? template.steps.map((s, idx) => ({ s, idx })).filter(x => x.s.kind === 'email')
    : []

  const submit = async () => {
    if (!trigger || !template) return
    setSubmitting(true)
    try {
      await onCreate({ trigger, template, customized })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header + steps indicator */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold text-sm">Create from template</h2>
            <p className="text-gray-500 text-xs mt-0.5">Step {step} of 4 — {step === 1 ? 'choose a trigger' : step === 2 ? 'pick a template' : step === 3 ? 'customize emails' : 'review & create'}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {step === 1 && (
            <div className="space-y-2">
              {WORKFLOW_TRIGGERS.map(t => {
                const selected = trigger?.id === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTrigger(t)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      selected ? 'border-indigo-500 bg-indigo-950/40' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <p className="text-white text-sm font-medium">{t.label}</p>
                    <p className="text-gray-500 text-xs mt-1">{t.description}</p>
                  </button>
                )
              })}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              {WORKFLOW_TEMPLATES.map(t => {
                const selected = template?.id === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      selected ? 'border-indigo-500 bg-indigo-950/40' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-white text-sm font-medium">{t.name}</p>
                      <span className="text-[10px] text-gray-500">{t.steps.length} steps</span>
                    </div>
                    <p className="text-gray-500 text-xs leading-relaxed">{t.description}</p>
                  </button>
                )
              })}
            </div>
          )}

          {step === 3 && template && (
            <div className="space-y-4">
              <p className="text-gray-400 text-xs">Edit subject + body for each email. Wait/tag/notify steps run on the schedule shown.</p>
              {template.steps.map((s, idx) => {
                if (s.kind === 'tag') {
                  return (
                    <div key={idx} className="bg-gray-800/40 border border-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-400">
                      <span className="text-indigo-300">Tag</span> — applies <code className="text-white">{s.tag}</code>
                    </div>
                  )
                }
                if (s.kind === 'notify') {
                  return (
                    <div key={idx} className="bg-gray-800/40 border border-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-400">
                      <span className="text-indigo-300">Notify</span> ({s.channel}) — {s.body}
                    </div>
                  )
                }
                const cur = customized[idx] || { subject: s.subject, body: s.body }
                return (
                  <div key={idx} className="bg-gray-800/40 border border-gray-700/60 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-indigo-300 font-medium">Email — day {s.dayOffset}</p>
                    </div>
                    <input
                      value={cur.subject}
                      onChange={e => setCustomized(prev => ({ ...prev, [idx]: { ...cur, subject: e.target.value } }))}
                      placeholder="Subject"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <textarea
                      value={cur.body}
                      onChange={e => setCustomized(prev => ({ ...prev, [idx]: { ...cur, body: e.target.value } }))}
                      rows={5}
                      placeholder="Body"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>
                )
              })}
            </div>
          )}

          {step === 4 && template && trigger && (
            <div className="space-y-3">
              <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Trigger</p>
                <p className="text-white text-sm">{trigger.label}</p>
              </div>
              <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Template</p>
                <p className="text-white text-sm">{template.name}</p>
                <p className="text-gray-500 text-xs mt-1">{template.description}</p>
              </div>
              <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Sequence ({emailSteps.length} emails)</p>
                <div className="space-y-1.5">
                  {template.steps.map((s, idx) => {
                    if (s.kind === 'email') {
                      const cur = customized[idx] || { subject: s.subject, body: s.body }
                      return (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <span className="text-gray-500 w-12 flex-shrink-0">Day {s.dayOffset}</span>
                          <span className="text-gray-200 truncate">{cur.subject}</span>
                        </div>
                      )
                    }
                    if (s.kind === 'tag') {
                      return (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <span className="text-gray-500 w-12 flex-shrink-0">Tag</span>
                          <span className="text-gray-400">Add {s.tag}</span>
                        </div>
                      )
                    }
                    return (
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        <span className="text-gray-500 w-12 flex-shrink-0">Notify</span>
                        <span className="text-gray-400 truncate">{s.body}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <p className="text-gray-500 text-xs">
                The new workflow will be created as a <span className="text-amber-300">Draft</span>. Activate it from the toolbar after a final review.
              </p>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800">
          <button
            onClick={() => setStep(s => (s === 1 ? 1 : ((s - 1) as 1 | 2 | 3 | 4)))}
            disabled={step === 1}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 rounded-lg"
          >
            ← Back
          </button>
          {step < 4 ? (
            <button
              onClick={() => setStep(s => ((s + 1) as 1 | 2 | 3 | 4))}
              disabled={(step === 1 && !trigger) || (step === 2 && !template)}
              className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting || !trigger || !template}
              className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg"
            >
              {submitting ? 'Creating…' : 'Create workflow'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
