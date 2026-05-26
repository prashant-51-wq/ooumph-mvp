'use client'

import { useState, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'list' | 'details'
type FilterType = 'All' | 'Images' | 'Videos' | 'Audio' | 'Documents' | 'Brand Assets' | 'AI Generated'
type SortMode = 'Newest' | 'Oldest' | 'Name' | 'Size' | 'Most Used'
type SourceFilter = 'All' | 'Uploaded' | 'AI Generated' | 'From Campaigns' | 'Imported'

interface MediaItem {
  id: string
  name: string
  type: FilterType
  source: SourceFilter
  size: string
  bytes: number
  date: string
  campaignCount: number
  url: string
  width?: number
  height?: number
  aiPrompt?: string
  aiModel?: string
  tags: string[]
  color: string
}

interface Folder {
  id: string
  name: string
  icon: string
  count: number
}

interface AgentMessage {
  role: 'user' | 'agent'
  content: string
  actions?: string[]
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_MEDIA: MediaItem[] = [
  { id: '1', name: 'hero-banner-q1.png', type: 'Images', source: 'AI Generated', size: '1.2 MB', bytes: 1258000, date: '2026-05-24', campaignCount: 3, url: '', width: 1920, height: 1080, aiPrompt: 'Professional hero banner for Q1 campaign', aiModel: 'DALL-E 3', tags: ['hero', 'banner', 'Q1'], color: 'bg-indigo-500' },
  { id: '2', name: 'product-demo-reel.mp4', type: 'Videos', source: 'Uploaded', size: '24.7 MB', bytes: 25900000, date: '2026-05-23', campaignCount: 1, url: '', width: 1080, height: 1920, tags: ['product', 'reel', 'demo'], color: 'bg-rose-500' },
  { id: '3', name: 'brand-logo-primary.svg', type: 'Brand Assets', source: 'Uploaded', size: '48 KB', bytes: 49152, date: '2026-05-22', campaignCount: 8, url: '', tags: ['logo', 'brand', 'primary'], color: 'bg-violet-500' },
  { id: '4', name: 'voiceover-ad-30s.mp3', type: 'Audio', source: 'AI Generated', size: '3.4 MB', bytes: 3565000, date: '2026-05-21', campaignCount: 2, url: '', aiPrompt: '30-second ad voiceover warm professional tone', aiModel: 'ElevenLabs', tags: ['audio', 'ad', 'voiceover'], color: 'bg-yellow-500' },
  { id: '5', name: 'instagram-carousel-05.png', type: 'Images', source: 'AI Generated', size: '892 KB', bytes: 913408, date: '2026-05-20', campaignCount: 1, url: '', width: 1080, height: 1080, aiPrompt: 'Instagram carousel slide 5 of 7', aiModel: 'DALL-E 3', tags: ['instagram', 'carousel'], color: 'bg-pink-500' },
  { id: '6', name: 'case-study-deck.pdf', type: 'Documents', source: 'Uploaded', size: '5.1 MB', bytes: 5349000, date: '2026-05-19', campaignCount: 0, url: '', tags: ['case-study', 'pdf'], color: 'bg-blue-500' },
  { id: '7', name: 'linkedin-banner.jpg', type: 'Images', source: 'AI Generated', size: '456 KB', bytes: 467000, date: '2026-05-18', campaignCount: 2, url: '', width: 1584, height: 396, aiPrompt: 'LinkedIn profile banner professional dark theme', aiModel: 'DALL-E 3', tags: ['linkedin', 'banner'], color: 'bg-green-500' },
  { id: '8', name: 'product-explainer-90s.mp4', type: 'Videos', source: 'AI Generated', size: '18.3 MB', bytes: 19200000, date: '2026-05-17', campaignCount: 3, url: '', width: 1920, height: 1080, aiPrompt: '90-second explainer video storyboard', aiModel: 'Kling 2.0', tags: ['video', 'explainer'], color: 'bg-amber-500' },
  { id: '9', name: 'twitter-graphic-set.png', type: 'Images', source: 'From Campaigns', size: '234 KB', bytes: 239616, date: '2026-05-16', campaignCount: 1, url: '', width: 1200, height: 675, tags: ['twitter', 'graphic'], color: 'bg-cyan-500' },
  { id: '10', name: 'brand-pattern.png', type: 'Brand Assets', source: 'Uploaded', size: '78 KB', bytes: 79872, date: '2026-05-15', campaignCount: 5, url: '', tags: ['brand', 'pattern'], color: 'bg-teal-500' },
  { id: '11', name: 'facebook-ad-square.png', type: 'Images', source: 'AI Generated', size: '512 KB', bytes: 524288, date: '2026-05-14', campaignCount: 2, url: '', width: 1080, height: 1080, aiPrompt: 'Facebook ad square format high-contrast', aiModel: 'DALL-E 3', tags: ['facebook', 'ad'], color: 'bg-blue-600' },
  { id: '12', name: 'podcast-intro.mp3', type: 'Audio', source: 'AI Generated', size: '1.8 MB', bytes: 1887436, date: '2026-05-13', campaignCount: 0, url: '', aiPrompt: 'Podcast intro music energetic upbeat 15 seconds', aiModel: 'ElevenLabs', tags: ['podcast', 'audio'], color: 'bg-purple-500' },
]

const FOLDERS: Folder[] = [
  { id: 'all', name: 'All Media', icon: '🗂️', count: 12 },
  { id: 'brand', name: 'Brand Assets', icon: '🏷️', count: 3 },
  { id: 'campaigns', name: 'Campaigns', icon: '📣', count: 5 },
  { id: 'social', name: 'Social', icon: '📱', count: 4 },
  { id: 'blog', name: 'Blog', icon: '📝', count: 2 },
  { id: 'ai', name: 'AI Generated', icon: '🤖', count: 7 },
  { id: 'archived', name: 'Archived', icon: '📦', count: 0 },
]

const AGENT_QUICK_ACTIONS = ['Find duplicates', 'Organize by campaign', 'Generate alt text for all', 'Export report']

const TYPE_COLORS: Record<string, string> = {
  Images: 'bg-indigo-900/40 text-indigo-300',
  Videos: 'bg-rose-900/40 text-rose-300',
  Audio: 'bg-yellow-900/40 text-yellow-300',
  Documents: 'bg-blue-900/40 text-blue-300',
  'Brand Assets': 'bg-violet-900/40 text-violet-300',
  'AI Generated': 'bg-green-900/40 text-green-300',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MediaLibraryPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<FilterType>('All')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('All')
  const [sortMode, setSortMode] = useState<SortMode>('Newest')
  const [activeFolder, setActiveFolder] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null)
  const [agentChat, setAgentChat] = useState<AgentMessage[]>([
    { role: 'agent', content: 'Hi! I\'m your AI Media Agent. I can help you find, organize, and optimize your media library. What would you like to do?', actions: AGENT_QUICK_ACTIONS },
  ])
  const [agentInput, setAgentInput] = useState('')
  const [showFolderSidebar, setShowFolderSidebar] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredMedia = MOCK_MEDIA.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) || item.tags.some(t => t.includes(search.toLowerCase()))
    const matchType = typeFilter === 'All' || item.type === typeFilter
    const matchSource = sourceFilter === 'All' || item.source === sourceFilter
    const matchFolder = activeFolder === 'all' ||
      (activeFolder === 'brand' && item.type === 'Brand Assets') ||
      (activeFolder === 'ai' && item.source === 'AI Generated') ||
      (activeFolder === 'social' && item.tags.some(t => ['instagram', 'twitter', 'linkedin', 'facebook', 'social'].includes(t)))
    return matchSearch && matchType && matchSource && matchFolder
  })

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(filteredMedia.map(m => m.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function handleBatchDownload() {
    const selected = filteredMedia.filter(m => selectedIds.has(m.id))
    const manifest = { files: selected.map(m => ({ name: m.name, type: m.type, size: m.size })) }
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ooumph-media-export-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function sendAgentMessage(msg: string) {
    if (!msg.trim()) return
    const userMsg: AgentMessage = { role: 'user', content: msg }
    let agentReply: AgentMessage

    if (msg.toLowerCase().includes('duplicate')) {
      agentReply = { role: 'agent', content: 'I scanned your library and found 0 exact duplicates. However, I found 2 visually similar image pairs. Want me to show them?', actions: ['Show similar pairs', 'Cancel'] }
    } else if (msg.toLowerCase().includes('q1') || msg.toLowerCase().includes('campaign')) {
      agentReply = { role: 'agent', content: 'Found 3 items tagged or used in Q1 campaigns: hero-banner-q1.png, facebook-ad-square.png, instagram-carousel-05.png. Filtering the library now.', actions: ['Apply filter', 'Download all 3'] }
    } else if (msg.toLowerCase().includes('compress')) {
      agentReply = { role: 'agent', content: 'I found 4 images over 2MB. Compressing them could save 8.3MB total while maintaining quality. Shall I proceed?', actions: ['Apply compression', 'Preview changes', 'Cancel'] }
    } else if (msg.toLowerCase().includes('alt text')) {
      agentReply = { role: 'agent', content: 'I can generate SEO-optimized alt text for all 9 images in your library using their filenames and visual context. This takes about 30 seconds.', actions: ['Generate alt text', 'Preview first', 'Cancel'] }
    } else {
      agentReply = { role: 'agent', content: `I processed your request: "${msg}". I found ${filteredMedia.length} relevant items. What would you like to do with them?`, actions: ['Show results', 'Export list'] }
    }

    setAgentChat(prev => [...prev, userMsg, agentReply])
    setAgentInput('')
  }

  const TYPE_FILTERS: FilterType[] = ['All', 'Images', 'Videos', 'Audio', 'Documents', 'Brand Assets', 'AI Generated']
  const SORT_OPTIONS: SortMode[] = ['Newest', 'Oldest', 'Name', 'Size', 'Most Used']
  const SOURCE_OPTIONS: SourceFilter[] = ['All', 'Uploaded', 'AI Generated', 'From Campaigns', 'Imported']

  const storagePercent = 42
  const selectedCount = selectedIds.size

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Folder Sidebar */}
      {showFolderSidebar && (
        <div className="w-52 flex-shrink-0 bg-gray-950 border-r border-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-sm">Folders</h2>
              <button className="text-indigo-400 text-xs hover:text-indigo-300">+ New</button>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            {FOLDERS.map(folder => (
              <button
                key={folder.id}
                onClick={() => setActiveFolder(folder.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors mb-0.5 ${
                  activeFolder === folder.id
                    ? 'bg-indigo-900/40 text-indigo-300'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-base">{folder.icon}</span>
                  <span className="truncate">{folder.name}</span>
                </span>
                {folder.count > 0 && (
                  <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">{folder.count}</span>
                )}
              </button>
            ))}
          </nav>
          {/* Storage */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-gray-400">Storage</span>
              <span className="text-white font-medium">4.2 / 10 GB</span>
            </div>
            <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${storagePercent}%` }} />
            </div>
            <p className="text-gray-600 text-xs mt-1">{storagePercent}% used</p>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gray-950 border-b border-gray-800 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFolderSidebar(v => !v)}
                className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
                title="Toggle folders"
              >
                ☰
              </button>
              <h1 className="text-xl font-bold text-white">Media Library</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAiPanel(v => !v)}
                className={`px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors ${showAiPanel ? 'bg-indigo-600 text-white' : 'border border-gray-700 text-gray-400 hover:text-white'}`}
              >
                🤖 AI Agent
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
              >
                ⬆ Upload
              </button>
              {/* View toggle */}
              <div className="flex border border-gray-700 rounded-xl overflow-hidden">
                {(['grid', 'list', 'details'] as ViewMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-3 py-2 text-xs transition-colors capitalize ${viewMode === mode ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}
                  >
                    {mode === 'grid' ? '⊞' : mode === 'list' ? '☰' : '≡'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search media..."
              className="w-52 px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-600"
            />
            <div className="flex gap-1 overflow-x-auto">
              {TYPE_FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    typeFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value as SourceFilter)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-xl focus:outline-none focus:border-indigo-500"
            >
              {SOURCE_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-xl focus:outline-none focus:border-indigo-500"
            >
              {SORT_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
            <span className="text-gray-500 text-xs ml-auto">{filteredMedia.length} items</span>
            {selectedCount > 0 && (
              <button onClick={clearSelection} className="text-gray-500 text-xs hover:text-white">✕ Deselect all</button>
            )}
            {filteredMedia.length > 0 && selectedCount < filteredMedia.length && (
              <button onClick={selectAll} className="text-indigo-400 text-xs hover:text-indigo-300">Select all</button>
            )}
          </div>
        </div>

        {/* Media content */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredMedia.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <p className="text-4xl mb-3">🗂️</p>
              <p className="text-white font-medium">No media found</p>
              <p className="text-gray-500 text-sm mt-1">Try adjusting your filters or upload new assets</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-4 gap-4">
              {filteredMedia.map(item => (
                <div
                  key={item.id}
                  className={`bg-gray-900 border rounded-xl overflow-hidden group cursor-pointer transition-all ${
                    selectedIds.has(item.id) ? 'border-indigo-500 ring-1 ring-indigo-500/30' : 'border-gray-800 hover:border-gray-700'
                  }`}
                  onClick={() => setDetailItem(item)}
                >
                  <div className="relative aspect-square bg-gray-800 overflow-hidden">
                    {/* Color placeholder */}
                    <div className={`w-full h-full ${item.color} opacity-20 flex items-center justify-center`}>
                      <span className="text-4xl opacity-40">
                        {item.type === 'Images' ? '🖼️' : item.type === 'Videos' ? '🎬' :
                         item.type === 'Audio' ? '🎵' : item.type === 'Documents' ? '📄' :
                         item.type === 'Brand Assets' ? '🏷️' : '🤖'}
                      </span>
                    </div>
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gray-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); toggleSelect(item.id) }}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                          selectedIds.has(item.id) ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-white hover:bg-indigo-600'
                        }`}
                      >
                        {selectedIds.has(item.id) ? '✓' : '☐'}
                      </button>
                      <button onClick={e => e.stopPropagation()} className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center text-xs hover:bg-gray-600">↓</button>
                      <button
                        onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(item.url) }}
                        className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center text-xs hover:bg-gray-600"
                      >🔗</button>
                    </div>
                    {/* Select checkbox */}
                    {selectedIds.has(item.id) && (
                      <div className="absolute top-2 left-2 w-5 h-5 bg-indigo-600 rounded flex items-center justify-center text-xs text-white font-bold">✓</div>
                    )}
                    {/* Source badge */}
                    {item.source === 'AI Generated' && (
                      <div className="absolute bottom-2 right-2 bg-gray-900/80 text-xs text-green-400 px-1.5 py-0.5 rounded font-medium">AI</div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-white text-xs font-medium truncate mb-1">{item.name}</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${TYPE_COLORS[item.type] || 'bg-gray-800 text-gray-400'}`}>{item.type}</span>
                      <span className="text-gray-500 text-xs">{item.size}</span>
                    </div>
                    {item.campaignCount > 0 && (
                      <p className="text-gray-600 text-xs mt-1">Used in {item.campaignCount} campaign{item.campaignCount !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* List view */
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-4 py-3 text-left text-gray-500 text-xs font-medium w-8">
                      <input type="checkbox" onChange={e => e.target.checked ? selectAll() : clearSelection()} className="accent-indigo-500" />
                    </th>
                    <th className="px-4 py-3 text-left text-gray-500 text-xs font-medium">Name</th>
                    <th className="px-4 py-3 text-left text-gray-500 text-xs font-medium">Type</th>
                    <th className="px-4 py-3 text-left text-gray-500 text-xs font-medium">Source</th>
                    <th className="px-4 py-3 text-left text-gray-500 text-xs font-medium">Size</th>
                    <th className="px-4 py-3 text-left text-gray-500 text-xs font-medium">Campaigns</th>
                    <th className="px-4 py-3 text-left text-gray-500 text-xs font-medium">Date</th>
                    <th className="px-4 py-3 text-right text-gray-500 text-xs font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMedia.map(item => (
                    <tr
                      key={item.id}
                      className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer ${selectedIds.has(item.id) ? 'bg-indigo-900/10' : ''}`}
                      onClick={() => setDetailItem(item)}
                    >
                      <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(item.id) }}>
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => {}} className="accent-indigo-500" />
                      </td>
                      <td className="px-4 py-3 text-white text-xs font-medium">{item.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[item.type] || 'bg-gray-800 text-gray-400'}`}>{item.type}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{item.source}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{item.size}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{item.campaignCount}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{item.date}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button className="text-gray-600 hover:text-gray-300 text-xs px-2 py-1 hover:bg-gray-700 rounded">↓</button>
                          <button className="text-gray-600 hover:text-gray-300 text-xs px-2 py-1 hover:bg-gray-700 rounded">🔗</button>
                          <button className="text-red-800 hover:text-red-400 text-xs px-2 py-1 hover:bg-gray-700 rounded">✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Batch action bar */}
        {selectedCount > 0 && (
          <div className="border-t border-gray-800 bg-gray-900 px-6 py-3 flex items-center gap-3">
            <span className="text-white font-medium text-sm">{selectedCount} selected</span>
            <button
              onClick={handleBatchDownload}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              ↓ Download Selected ({selectedCount})
            </button>
            <button className="border border-gray-700 text-gray-400 hover:text-white px-4 py-2 rounded-xl text-sm transition-colors">
              📁 Move to Folder ({selectedCount})
            </button>
            <button className="border border-gray-700 text-gray-400 hover:text-white px-4 py-2 rounded-xl text-sm transition-colors">
              📣 Add to Campaign ({selectedCount})
            </button>
            <button className="border border-red-900/50 text-red-500 hover:text-red-400 hover:border-red-700 px-4 py-2 rounded-xl text-sm transition-colors ml-auto">
              🗑 Delete ({selectedCount})
            </button>
            <button onClick={clearSelection} className="text-gray-600 hover:text-white text-sm px-2">✕</button>
          </div>
        )}
      </div>

      {/* AI Media Agent Panel */}
      {showAiPanel && (
        <div className="w-80 flex-shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <h3 className="text-white font-semibold text-sm">AI Media Agent</h3>
              <span className="w-2 h-2 rounded-full bg-green-400" />
            </div>
            <button onClick={() => setShowAiPanel(false)} className="text-gray-500 hover:text-white">✕</button>
          </div>

          {/* Chat */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {agentChat.map((msg, i) => (
              <div key={i} className={`${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                <div className={`max-w-full rounded-2xl px-3 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                }`}>
                  <p className="leading-relaxed text-xs">{msg.content}</p>
                  {msg.actions && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.actions.map(action => (
                        <button
                          key={action}
                          onClick={() => sendAgentMessage(action)}
                          className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-2 py-1 rounded-lg transition-colors"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex gap-2">
              <input
                value={agentInput}
                onChange={e => setAgentInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendAgentMessage(agentInput)}
                placeholder="Ask the agent..."
                className="flex-1 bg-gray-800 border border-gray-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-600"
              />
              <button
                onClick={() => sendAgentMessage(agentInput)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl text-xs"
              >
                →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-white font-bold">Upload Media</h2>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-500 hover:text-white text-2xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false) }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-indigo-500 bg-indigo-900/10' : 'border-gray-700 hover:border-indigo-600 hover:bg-indigo-900/5'
                }`}
              >
                <div className="text-4xl mb-3">📁</div>
                <p className="text-white font-medium">Drag & drop files here</p>
                <p className="text-gray-500 text-sm mt-1">or click to browse</p>
                <p className="text-gray-600 text-xs mt-2">PNG, JPG, MP4, MP3, PDF — up to 50MB each</p>
              </div>
              <input ref={fileInputRef} type="file" multiple className="hidden" />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Add to folder</label>
                  <select className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none">
                    {FOLDERS.filter(f => f.id !== 'all').map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Add to campaign</label>
                  <select className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none">
                    <option value="">None</option>
                    <option>Q2 Brand Launch</option>
                    <option>Summer Promotion</option>
                    <option>Product Demo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Tags (comma separated)</label>
                <input
                  placeholder="e.g. brand, hero, Q2, campaign"
                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-600"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium"
                >
                  ⬆ Upload Files
                </button>
                <button onClick={() => setShowUploadModal(false)} className="flex-1 border border-gray-700 text-gray-400 hover:text-white py-2.5 rounded-xl text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Slide-over */}
      {detailItem && (
        <div className="fixed inset-0 bg-gray-950/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-96 bg-gray-900 border-l border-gray-800 overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h3 className="text-white font-semibold text-sm truncate flex-1 mr-3">{detailItem.name}</h3>
              <button onClick={() => setDetailItem(null)} className="text-gray-500 hover:text-white text-xl flex-shrink-0">×</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Preview */}
              <div className={`w-full aspect-video rounded-xl ${detailItem.color} opacity-30 flex items-center justify-center`}>
                <span className="text-6xl opacity-50">
                  {detailItem.type === 'Images' ? '🖼️' : detailItem.type === 'Videos' ? '🎬' : '📄'}
                </span>
              </div>

              {/* Metadata */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { label: 'Type', value: detailItem.type },
                    { label: 'Source', value: detailItem.source },
                    { label: 'Size', value: detailItem.size },
                    { label: 'Date', value: detailItem.date },
                    detailItem.width ? { label: 'Dimensions', value: `${detailItem.width} × ${detailItem.height}` } : null,
                  ].filter(Boolean).map(item => item && (
                    <div key={item.label} className="bg-gray-800 rounded-xl px-3 py-2">
                      <p className="text-gray-500 mb-0.5">{item.label}</p>
                      <p className="text-white font-medium">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-gray-800 rounded-xl px-3 py-2 text-xs">
                  <p className="text-gray-500 mb-0.5">Usage</p>
                  <p className="text-white">Used in {detailItem.campaignCount} campaign{detailItem.campaignCount !== 1 ? 's' : ''}</p>
                </div>

                {detailItem.aiPrompt && (
                  <div className="bg-green-900/20 border border-green-800/30 rounded-xl px-3 py-2 text-xs">
                    <p className="text-green-400 font-medium mb-1">AI Generated</p>
                    <p className="text-gray-400 mb-1"><strong className="text-gray-300">Prompt:</strong> {detailItem.aiPrompt}</p>
                    <p className="text-gray-400"><strong className="text-gray-300">Model:</strong> {detailItem.aiModel}</p>
                  </div>
                )}

                {/* Tags */}
                <div>
                  <p className="text-gray-500 text-xs mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detailItem.tags.map(tag => (
                      <span key={tag} className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                    <button className="border border-dashed border-gray-700 text-gray-600 text-xs px-2 py-0.5 rounded-full hover:text-white">+ Add</button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={() => navigator.clipboard.writeText(detailItem.url)}
                  className="w-full border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white py-2 rounded-xl text-sm transition-colors"
                >
                  🔗 Copy URL
                </button>
                <button className="w-full border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white py-2 rounded-xl text-sm transition-colors">
                  ↓ Download
                </button>
                <button className="w-full border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white py-2 rounded-xl text-sm transition-colors">
                  🔄 Replace File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
