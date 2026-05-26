'use client'

import { useState, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ScheduledExport {
  id: string
  name: string
  source: string
  frequency: string
  format: string
  destination: string
  lastRan: string
  nextRun: string
  active: boolean
}

interface ExportRecord {
  id: string
  date: string
  type: string
  format: string
  size: string
  records: number
  status: 'Success' | 'Failed'
}

interface FieldOption { id: string; label: string }

// ─── Data ─────────────────────────────────────────────────────────────────────
const QUICK_EXPORTS = [
  { id: 'analytics', icon: '📊', name: 'All Analytics Data', desc: 'Reach, engagement, leads, revenue · All time', format: 'CSV', size: '~2.4 MB' },
  { id: 'contacts', icon: '👥', name: 'All Contacts', desc: 'Full CRM with RFM scores, tags, stages', format: 'CSV', size: '~1.8 MB' },
  { id: 'email_reports', icon: '📧', name: 'Email Campaign Reports', desc: 'Opens, clicks, revenue per campaign', format: 'CSV', size: '~0.9 MB' },
  { id: 'agent_log', icon: '🤖', name: 'Agent Activity Log', desc: 'All AI tasks, costs, outputs', format: 'JSON', size: '~4.2 MB' },
  { id: 'content', icon: '📝', name: 'All Content', desc: 'Every generated piece with metadata', format: 'JSON', size: '~6.1 MB' },
  { id: 'brand_assets', icon: '🎨', name: 'Brand Assets', desc: 'Logos, images, brand guidelines', format: 'ZIP', size: '~18 MB' },
  { id: 'calendar', icon: '📅', name: 'Calendar Events', desc: 'Import to Google/Apple Calendar', format: 'ICS', size: '~0.1 MB' },
  { id: 'workspace_backup', icon: '💾', name: 'Full Workspace Backup', desc: 'Everything — contacts, content, settings', format: 'JSON', size: '~22 MB' },
]

const DATA_SOURCES: Record<string, FieldOption[]> = {
  Contacts: [
    { id: 'name', label: 'Full Name' }, { id: 'email', label: 'Email' }, { id: 'phone', label: 'Phone' },
    { id: 'stage', label: 'Pipeline Stage' }, { id: 'rfm', label: 'RFM Score' }, { id: 'tags', label: 'Tags' },
    { id: 'source', label: 'Lead Source' }, { id: 'created', label: 'Created At' }, { id: 'last_activity', label: 'Last Activity' },
  ],
  Content: [
    { id: 'title', label: 'Title' }, { id: 'type', label: 'Content Type' }, { id: 'platform', label: 'Platform' },
    { id: 'status', label: 'Approval Status' }, { id: 'agent', label: 'Agent' }, { id: 'created', label: 'Created At' },
    { id: 'published', label: 'Published At' }, { id: 'body', label: 'Body Text' }, { id: 'media', label: 'Media URLs' },
  ],
  Analytics: [
    { id: 'date', label: 'Date' }, { id: 'platform', label: 'Platform' }, { id: 'reach', label: 'Reach' },
    { id: 'impressions', label: 'Impressions' }, { id: 'engagement', label: 'Engagement Rate' }, { id: 'clicks', label: 'Clicks' },
    { id: 'leads', label: 'Leads' }, { id: 'revenue', label: 'Revenue' }, { id: 'cost', label: 'Ad Spend' },
  ],
  Campaigns: [
    { id: 'name', label: 'Campaign Name' }, { id: 'type', label: 'Type' }, { id: 'status', label: 'Status' },
    { id: 'sent', label: 'Emails Sent' }, { id: 'opens', label: 'Open Rate' }, { id: 'clicks', label: 'Click Rate' },
    { id: 'revenue', label: 'Revenue' }, { id: 'date', label: 'Send Date' },
  ],
  Leads: [
    { id: 'name', label: 'Name' }, { id: 'email', label: 'Email' }, { id: 'score', label: 'Lead Score' },
    { id: 'source', label: 'Source' }, { id: 'stage', label: 'Stage' }, { id: 'owner', label: 'Owner' }, { id: 'date', label: 'Created At' },
  ],
  Approvals: [
    { id: 'title', label: 'Content Title' }, { id: 'type', label: 'Type' }, { id: 'status', label: 'Status' },
    { id: 'reviewer', label: 'Reviewer' }, { id: 'decision', label: 'Decision' }, { id: 'date', label: 'Date' },
  ],
  Workflows: [
    { id: 'name', label: 'Workflow Name' }, { id: 'status', label: 'Status' }, { id: 'trigger', label: 'Trigger' },
    { id: 'runs', label: 'Total Runs' }, { id: 'last_run', label: 'Last Run' },
  ],
  'Agent Logs': [
    { id: 'agent', label: 'Agent' }, { id: 'task', label: 'Task' }, { id: 'status', label: 'Status' },
    { id: 'tokens', label: 'Tokens Used' }, { id: 'cost', label: 'Cost ($)' }, { id: 'duration', label: 'Duration' }, { id: 'date', label: 'Date' },
  ],
}

const MOCK_SCHEDULES: ScheduledExport[] = [
  { id: 's1', name: 'Weekly Analytics', source: 'Analytics', frequency: 'Weekly', format: 'CSV', destination: 'Email', lastRan: '2026-05-19', nextRun: '2026-05-26', active: true },
  { id: 's2', name: 'Monthly Contacts Backup', source: 'Contacts', frequency: 'Monthly', format: 'CSV', destination: 'Download', lastRan: '2026-05-01', nextRun: '2026-06-01', active: true },
  { id: 's3', name: 'Daily Agent Log', source: 'Agent Logs', frequency: 'Daily', format: 'JSON', destination: 'Email', lastRan: '2026-05-25', nextRun: '2026-05-26', active: false },
]

const MOCK_HISTORY: ExportRecord[] = [
  { id: 'h1', date: '2026-05-25 14:32', type: 'All Analytics Data', format: 'CSV', size: '2.4 MB', records: 8421, status: 'Success' },
  { id: 'h2', date: '2026-05-24 09:11', type: 'All Contacts', format: 'CSV', size: '1.8 MB', records: 3204, status: 'Success' },
  { id: 'h3', date: '2026-05-22 18:05', type: 'Agent Activity Log', format: 'JSON', size: '4.2 MB', records: 12840, status: 'Success' },
  { id: 'h4', date: '2026-05-20 11:43', type: 'Email Campaign Reports', format: 'CSV', size: '0.9 MB', records: 147, status: 'Failed' },
  { id: 'h5', date: '2026-05-19 08:00', type: 'Weekly Analytics', format: 'CSV', size: '1.1 MB', records: 5630, status: 'Success' },
]

const FORMAT_COLORS: Record<string, string> = {
  CSV: 'bg-green-900/40 text-green-300 border-green-800/50',
  JSON: 'bg-blue-900/40 text-blue-300 border-blue-800/50',
  ZIP: 'bg-yellow-900/40 text-yellow-300 border-yellow-800/50',
  ICS: 'bg-purple-900/40 text-purple-300 border-purple-800/50',
  XLSX: 'bg-emerald-900/40 text-emerald-300 border-emerald-800/50',
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ExportPage() {
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [lastExportDate, setLastExportDate] = useState<string>('May 25, 2026 2:32 PM')

  // Custom export builder state
  const [customSource, setCustomSource] = useState('Contacts')
  const [customFields, setCustomFields] = useState<string[]>(['name', 'email', 'stage'])
  const [customFormat, setCustomFormat] = useState('CSV')
  const [customEncoding, setCustomEncoding] = useState('UTF-8')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [customStatus, setCustomStatus] = useState('')
  const [customTag, setCustomTag] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [customGenerating, setCustomGenerating] = useState(false)

  // Schedules
  const [schedules, setSchedules] = useState<ScheduledExport[]>(MOCK_SCHEDULES)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [newSchedule, setNewSchedule] = useState({ name: '', source: 'Analytics', frequency: 'Weekly', format: 'CSV', destination: 'Email' })

  // History
  const [history, setHistory] = useState<ExportRecord[]>(MOCK_HISTORY)

  const triggerDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleQuickExport = async (id: string, format: string, name: string) => {
    setExportingId(id)
    await new Promise(r => setTimeout(r, 1200))
    // Simulate download
    const ts = new Date().toISOString().slice(0, 10)
    const fname = `ooumph-${id}-${ts}.${format.toLowerCase()}`
    const content = format === 'JSON'
      ? JSON.stringify({ export: id, generated: new Date().toISOString(), data: [] }, null, 2)
      : `# Ooumph Export — ${name}\n# Generated: ${new Date().toISOString()}\n`
    triggerDownload(fname, content, format === 'JSON' ? 'application/json' : 'text/plain')
    setExportingId(null)
    setDoneIds(prev => new Set([...prev, id]))
    setLastExportDate(new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))
  }

  const handleQuickExportAll = async () => {
    setExportingId('all')
    await new Promise(r => setTimeout(r, 1800))
    const ts = new Date().toISOString().slice(0, 10)
    triggerDownload(`ooumph-full-export-${ts}.json`, JSON.stringify({ fullExport: true, generated: new Date().toISOString() }, null, 2), 'application/json')
    setExportingId(null)
  }

  const handleCustomGenerate = async () => {
    setCustomGenerating(true)
    await new Promise(r => setTimeout(r, 1500))
    const ts = new Date().toISOString().slice(0, 10)
    const fname = `ooumph-custom-${customSource.toLowerCase()}-${ts}.${customFormat.toLowerCase()}`
    triggerDownload(fname, customFormat === 'JSON' ? JSON.stringify({ source: customSource, fields: customFields, records: [] }, null, 2) : `${customFields.join(',')}\n`, 'text/plain')
    setCustomGenerating(false)
    const newRecord: ExportRecord = {
      id: `h${Date.now()}`,
      date: new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      type: `Custom — ${customSource}`,
      format: customFormat,
      size: '~0.5 MB',
      records: Math.floor(Math.random() * 5000) + 100,
      status: 'Success',
    }
    setHistory(h => [newRecord, ...h])
  }

  const toggleSchedule = (id: string) => {
    setSchedules(s => s.map(sc => sc.id === id ? { ...sc, active: !sc.active } : sc))
  }

  const deleteSchedule = (id: string) => setSchedules(s => s.filter(sc => sc.id !== id))

  const addSchedule = () => {
    const newSc: ScheduledExport = {
      id: `s${Date.now()}`,
      name: newSchedule.name || `${newSchedule.source} Export`,
      source: newSchedule.source,
      frequency: newSchedule.frequency,
      format: newSchedule.format,
      destination: newSchedule.destination,
      lastRan: '—',
      nextRun: 'Pending',
      active: true,
    }
    setSchedules(s => [...s, newSc])
    setShowScheduleModal(false)
    setNewSchedule({ name: '', source: 'Analytics', frequency: 'Weekly', format: 'CSV', destination: 'Email' })
  }

  const sourceFields = DATA_SOURCES[customSource] || []
  const toggleField = (id: string) => setCustomFields(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id])
  const selectedFields = sourceFields.filter(f => customFields.includes(f.id))

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Data Export Center</h1>
          <p className="text-gray-400 text-sm mt-1">Download, schedule, and manage all your workspace data exports.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
            Last export: {lastExportDate}
          </span>
          <button
            onClick={() => handleQuickExportAll()}
            disabled={exportingId === 'all'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {exportingId === 'all' ? (
              <><span className="animate-spin">⟳</span> Exporting...</>
            ) : (
              <><span>⬇</span> Quick Export All</>
            )}
          </button>
        </div>
      </div>

      {/* ── Section 1: Quick Exports ── */}
      <Section title="Quick Exports" desc="One-click pre-configured exports for common data sets.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICK_EXPORTS.map(ex => {
            const isExporting = exportingId === ex.id
            const isDone = doneIds.has(ex.id)
            return (
              <div key={ex.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col">
                <span className="text-2xl mb-2">{ex.icon}</span>
                <p className="text-white text-sm font-semibold mb-0.5">{ex.name}</p>
                <p className="text-gray-500 text-xs mb-3 flex-1">{ex.desc}</p>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${FORMAT_COLORS[ex.format] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                    {ex.format}
                  </span>
                  <span className="text-[10px] text-gray-600">{ex.size}</span>
                </div>
                <button
                  onClick={() => handleQuickExport(ex.id, ex.format, ex.name)}
                  disabled={!!exportingId}
                  className={`w-full py-2 rounded-lg text-xs font-medium transition-all ${isDone ? 'bg-green-600/20 border border-green-600/40 text-green-400' : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white'}`}
                >
                  {isExporting ? <span className="flex items-center justify-center gap-1"><span className="animate-spin inline-block">⟳</span> Exporting...</span>
                    : isDone ? '✅ Ready to download'
                    : 'Export Now'}
                </button>
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── Section 2: Custom Export Builder ── */}
      <Section title="Custom Export Builder" desc="Choose exactly what data to export and how.">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Data Source</label>
              <select
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                value={customSource}
                onChange={e => { setCustomSource(e.target.value); setCustomFields([]) }}
              >
                {Object.keys(DATA_SOURCES).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Format</label>
              <div className="flex gap-2">
                {['CSV', 'JSON', 'XLSX'].map(f => (
                  <button key={f} type="button" onClick={() => setCustomFormat(f)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${customFormat === f ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-indigo-600'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Field selector */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-400 mb-2">Fields <span className="text-gray-600">({customFields.length} selected)</span></label>
            <div className="flex flex-wrap gap-2">
              {sourceFields.map(f => (
                <button key={f.id} type="button" onClick={() => toggleField(f.id)}
                  className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${customFields.includes(f.id) ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Date From</label>
              <input type="date" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Date To</label>
              <input type="date" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Status Filter</label>
              <input className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder-gray-600" placeholder="e.g. Active" value={customStatus} onChange={e => setCustomStatus(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Tag Filter</label>
              <input className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder-gray-600" placeholder="e.g. vip" value={customTag} onChange={e => setCustomTag(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Encoding</label>
              <select className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500" value={customEncoding} onChange={e => setCustomEncoding(e.target.value)}>
                <option>UTF-8</option>
                <option>UTF-16</option>
              </select>
            </div>
          </div>

          {/* Preview */}
          {showPreview && selectedFields.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <p className="text-xs text-gray-500 mb-2">Preview (first 5 rows)</p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-800">
                    {selectedFields.map(f => (
                      <th key={f.id} className="px-3 py-2 text-left text-gray-400 border border-gray-700 whitespace-nowrap">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5].map(row => (
                    <tr key={row} className="border-b border-gray-800">
                      {selectedFields.map(f => (
                        <td key={f.id} className="px-3 py-1.5 text-gray-400 border border-gray-800">
                          {f.id === 'email' ? `user${row}@example.com` : f.id === 'name' ? `Sample Record ${row}` : `—`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowPreview(!showPreview)} disabled={customFields.length === 0}
              className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-sm hover:bg-gray-700 disabled:opacity-40 transition-colors">
              {showPreview ? 'Hide Preview' : 'Preview (first 5 rows)'}
            </button>
            <button type="button" onClick={handleCustomGenerate} disabled={customFields.length === 0 || customGenerating}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors flex items-center gap-2">
              {customGenerating ? <><span className="animate-spin">⟳</span> Generating...</> : 'Generate Export'}
            </button>
          </div>
        </div>
      </Section>

      {/* ── Section 3: Scheduled Exports ── */}
      <Section
        title="Scheduled Exports"
        desc="Automatically export data on a recurring schedule."
        action={
          <button onClick={() => setShowScheduleModal(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
            + Add Schedule
          </button>
        }
      >
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Name', 'Source', 'Frequency', 'Format', 'Destination', 'Last Ran', 'Next Run', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map(sc => (
                <tr key={sc.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{sc.name}</td>
                  <td className="px-4 py-3 text-gray-400">{sc.source}</td>
                  <td className="px-4 py-3 text-gray-400">{sc.frequency}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${FORMAT_COLORS[sc.format] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>{sc.format}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{sc.destination}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{sc.lastRan}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{sc.nextRun}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => toggleSchedule(sc.id)}
                      className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${sc.active ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${sc.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button className="text-xs text-indigo-400 hover:text-indigo-300">Run</button>
                      <button className="text-xs text-gray-500 hover:text-gray-300">Edit</button>
                      <button onClick={() => deleteSchedule(sc.id)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {schedules.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-600 text-sm">No scheduled exports yet. Click &quot;Add Schedule&quot; to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Section 4: Export History ── */}
      <Section
        title="Export History"
        desc="Files are kept for 30 days after export."
        action={
          <button onClick={() => setHistory([])}
            className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-xs hover:bg-gray-700 transition-colors">
            Clear History
          </button>
        }
      >
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Date', 'Export Type', 'Format', 'Size', 'Records', 'Status', 'Download'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map(rec => (
                <tr key={rec.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{rec.date}</td>
                  <td className="px-4 py-3 text-white text-xs">{rec.type}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${FORMAT_COLORS[rec.format] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>{rec.format}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{rec.size}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{rec.records.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${rec.status === 'Success' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                      {rec.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {rec.status === 'Success' ? (
                      <button className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">⬇ Download</button>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600 text-sm">No export history.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600 mt-2">Export files are kept for 30 days. After that, they are automatically deleted.</p>
      </Section>

      {/* ── Add Schedule Modal ── */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-4">Add Scheduled Export</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Schedule Name</label>
                <input className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder-gray-600" placeholder="e.g. Weekly Analytics" value={newSchedule.name} onChange={e => setNewSchedule(s => ({ ...s, name: e.target.value }))} />
              </div>
              {([
                { label: 'Data Source', key: 'source', options: Object.keys(DATA_SOURCES) },
                { label: 'Frequency', key: 'frequency', options: ['Daily', 'Weekly', 'Monthly'] },
                { label: 'Format', key: 'format', options: ['CSV', 'JSON', 'XLSX'] },
                { label: 'Destination', key: 'destination', options: ['Download', 'Email'] },
              ] as { label: string; key: keyof typeof newSchedule; options: string[] }[]).map(({ label, key, options }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
                  <select className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500" value={newSchedule[key]} onChange={e => setNewSchedule(s => ({ ...s, [key]: e.target.value }))}>
                    {options.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowScheduleModal(false)} className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-300 text-sm hover:bg-gray-800 transition-colors">Cancel</button>
              <button onClick={addSchedule} className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">Create Schedule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Layout helper ────────────────────────────────────────────────────────────
function Section({ title, desc, children, action }: {
  title: string; desc: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="mb-10">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-white">{title}</h2>
          <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
