'use client'

import { useState } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'pending'
type Category = 'All' | 'Social Media' | 'Email' | 'CRM' | 'Ads' | 'Analytics' | 'AI Tools' | 'Productivity' | 'E-commerce' | 'Communication'
type SyncFrequency = 'Real-time' | 'Every 15min' | 'Hourly' | 'Daily'

interface Integration {
  id: string
  name: string
  category: Exclude<Category, 'All'>
  initial: string
  color: string
  status: IntegrationStatus
  lastSynced?: string
  syncFreq?: SyncFrequency
  accountName?: string
  dataSummary?: string
  syncTypes?: { label: string; enabled: boolean }[]
}

interface SyncLog {
  timestamp: string
  type: string
  records: number
  status: 'success' | 'error'
}

interface Webhook {
  id: string
  url: string
  source?: string
  trigger: string
  lastTriggered: string
  status: 'active' | 'inactive'
  direction: 'incoming' | 'outgoing'
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const INTEGRATIONS: Integration[] = [
  // Social Media
  { id: 'facebook', name: 'Facebook', category: 'Social Media', initial: 'F', color: 'bg-blue-600', status: 'connected', lastSynced: '2 min ago', syncFreq: 'Every 15min', accountName: 'Ooumph Official', dataSummary: '→ 1.2K posts synced', syncTypes: [{ label: 'Pages', enabled: true }, { label: 'Insights', enabled: true }, { label: 'Ads', enabled: false }] },
  { id: 'instagram', name: 'Instagram', category: 'Social Media', initial: 'I', color: 'bg-pink-600', status: 'connected', lastSynced: '5 min ago', syncFreq: 'Every 15min', accountName: '@ooumph.ai', dataSummary: '→ 487 posts synced', syncTypes: [{ label: 'Feed', enabled: true }, { label: 'Stories', enabled: true }, { label: 'Reels', enabled: true }] },
  { id: 'linkedin', name: 'LinkedIn', category: 'Social Media', initial: 'L', color: 'bg-blue-700', status: 'connected', lastSynced: '1 hour ago', syncFreq: 'Hourly', accountName: 'Ooumph Inc.', dataSummary: '→ 89 posts synced', syncTypes: [{ label: 'Company Page', enabled: true }, { label: 'Analytics', enabled: true }, { label: 'Ads', enabled: false }] },
  { id: 'twitter', name: 'Twitter / X', category: 'Social Media', initial: 'X', color: 'bg-gray-800', status: 'connected', lastSynced: '12 min ago', syncFreq: 'Every 15min', accountName: '@ooumph', dataSummary: '→ 312 tweets synced', syncTypes: [{ label: 'Tweets', enabled: true }, { label: 'Analytics', enabled: false }] },
  { id: 'tiktok', name: 'TikTok', category: 'Social Media', initial: 'T', color: 'bg-black border border-gray-700', status: 'disconnected' },
  { id: 'pinterest', name: 'Pinterest', category: 'Social Media', initial: 'P', color: 'bg-red-600', status: 'disconnected' },
  { id: 'youtube', name: 'YouTube', category: 'Social Media', initial: 'Y', color: 'bg-red-700', status: 'error', lastSynced: '3 days ago', dataSummary: 'Token expired — reconnect' },
  // Email
  { id: 'klaviyo', name: 'Klaviyo', category: 'Email', initial: 'K', color: 'bg-green-700', status: 'connected', lastSynced: '8 min ago', syncFreq: 'Real-time', accountName: 'ooumph@klaviyo', dataSummary: '→ 4,721 contacts synced', syncTypes: [{ label: 'Contacts', enabled: true }, { label: 'Campaigns', enabled: true }, { label: 'Flows', enabled: true }] },
  { id: 'mailchimp', name: 'Mailchimp', category: 'Email', initial: 'M', color: 'bg-yellow-600', status: 'disconnected' },
  { id: 'activecampaign', name: 'ActiveCampaign', category: 'Email', initial: 'A', color: 'bg-blue-500', status: 'disconnected' },
  { id: 'convertkit', name: 'ConvertKit', category: 'Email', initial: 'C', color: 'bg-orange-600', status: 'disconnected' },
  { id: 'brevo', name: 'Brevo', category: 'Email', initial: 'B', color: 'bg-teal-600', status: 'pending', lastSynced: 'Syncing...' },
  // CRM
  { id: 'hubspot', name: 'HubSpot', category: 'CRM', initial: 'H', color: 'bg-orange-500', status: 'connected', lastSynced: '4 min ago', syncFreq: 'Real-time', accountName: 'Ooumph HubSpot', dataSummary: '→ 247 contacts, ← 12 deals', syncTypes: [{ label: 'Contacts', enabled: true }, { label: 'Deals', enabled: true }, { label: 'Companies', enabled: true }, { label: 'Emails', enabled: false }] },
  { id: 'salesforce', name: 'Salesforce', category: 'CRM', initial: 'S', color: 'bg-blue-400', status: 'disconnected' },
  { id: 'zoho', name: 'Zoho CRM', category: 'CRM', initial: 'Z', color: 'bg-red-500', status: 'disconnected' },
  { id: 'pipedrive', name: 'Pipedrive', category: 'CRM', initial: 'P', color: 'bg-green-600', status: 'disconnected' },
  // Ads
  { id: 'google-ads', name: 'Google Ads', category: 'Ads', initial: 'G', color: 'bg-green-500', status: 'connected', lastSynced: '30 min ago', syncFreq: 'Hourly', accountName: 'Ooumph-Ads', dataSummary: '← 8 campaigns imported', syncTypes: [{ label: 'Campaigns', enabled: true }, { label: 'Keywords', enabled: true }, { label: 'Conversions', enabled: true }] },
  { id: 'meta-ads', name: 'Meta Ads', category: 'Ads', initial: 'M', color: 'bg-blue-600', status: 'connected', lastSynced: '45 min ago', syncFreq: 'Hourly', accountName: 'act_123456789', dataSummary: '← 5 campaigns, → 14 creatives', syncTypes: [{ label: 'Campaigns', enabled: true }, { label: 'Ad Sets', enabled: true }, { label: 'Creatives', enabled: true }] },
  { id: 'linkedin-ads', name: 'LinkedIn Ads', category: 'Ads', initial: 'L', color: 'bg-blue-700', status: 'disconnected' },
  // Analytics
  { id: 'ga4', name: 'Google Analytics', category: 'Analytics', initial: 'G', color: 'bg-orange-400', status: 'connected', lastSynced: '15 min ago', syncFreq: 'Hourly', accountName: 'GA4 — Ooumph', dataSummary: '← 12K events today', syncTypes: [{ label: 'Traffic', enabled: true }, { label: 'Events', enabled: true }, { label: 'Conversions', enabled: true }] },
  { id: 'mixpanel', name: 'Mixpanel', category: 'Analytics', initial: 'M', color: 'bg-purple-600', status: 'disconnected' },
  { id: 'segment', name: 'Segment', category: 'Analytics', initial: 'S', color: 'bg-green-500', status: 'disconnected' },
  // AI Tools
  { id: 'openai', name: 'OpenAI', category: 'AI Tools', initial: 'O', color: 'bg-gray-700', status: 'connected', lastSynced: 'Active', syncFreq: 'Real-time', accountName: 'sk-...xxxx', dataSummary: '→ 1,847 API calls this month', syncTypes: [{ label: 'GPT-4o', enabled: true }, { label: 'DALL-E', enabled: true }, { label: 'Whisper', enabled: false }] },
  { id: 'anthropic', name: 'Anthropic', category: 'AI Tools', initial: 'A', color: 'bg-orange-700', status: 'connected', lastSynced: 'Active', syncFreq: 'Real-time', accountName: 'sk-ant-...xxxx', dataSummary: '→ 5,213 API calls this month', syncTypes: [{ label: 'Claude Sonnet', enabled: true }, { label: 'Claude Haiku', enabled: true }] },
  { id: 'elevenlabs', name: 'ElevenLabs', category: 'AI Tools', initial: 'E', color: 'bg-teal-600', status: 'disconnected' },
  { id: 'replicate', name: 'Replicate', category: 'AI Tools', initial: 'R', color: 'bg-indigo-600', status: 'disconnected' },
  // Productivity
  { id: 'slack', name: 'Slack', category: 'Productivity', initial: 'S', color: 'bg-purple-600', status: 'connected', lastSynced: '1 min ago', syncFreq: 'Real-time', accountName: 'Ooumph workspace', dataSummary: '→ Notifications active', syncTypes: [{ label: 'Notifications', enabled: true }, { label: 'Approval alerts', enabled: true }] },
  { id: 'notion', name: 'Notion', category: 'Productivity', initial: 'N', color: 'bg-gray-700', status: 'disconnected' },
  { id: 'gdrive', name: 'Google Drive', category: 'Productivity', initial: 'G', color: 'bg-yellow-500', status: 'connected', lastSynced: '2 hours ago', syncFreq: 'Daily', accountName: 'ooumph@gmail.com', dataSummary: '→ 23 assets synced', syncTypes: [{ label: 'Assets', enabled: true }, { label: 'Documents', enabled: false }] },
  { id: 'zapier', name: 'Zapier', category: 'Productivity', initial: 'Z', color: 'bg-orange-500', status: 'disconnected' },
  { id: 'make', name: 'Make', category: 'Productivity', initial: 'M', color: 'bg-purple-500', status: 'disconnected' },
  // E-commerce
  { id: 'shopify', name: 'Shopify', category: 'E-commerce', initial: 'S', color: 'bg-green-600', status: 'connected', lastSynced: '10 min ago', syncFreq: 'Real-time', accountName: 'ooumph.myshopify.com', dataSummary: '← 847 products, → 124 orders', syncTypes: [{ label: 'Products', enabled: true }, { label: 'Orders', enabled: true }, { label: 'Customers', enabled: true }, { label: 'Inventory', enabled: false }] },
  { id: 'woocommerce', name: 'WooCommerce', category: 'E-commerce', initial: 'W', color: 'bg-purple-700', status: 'disconnected' },
  { id: 'stripe', name: 'Stripe', category: 'E-commerce', initial: 'S', color: 'bg-indigo-500', status: 'connected', lastSynced: '5 min ago', syncFreq: 'Real-time', accountName: 'Ooumph Payments', dataSummary: '← 312 transactions this month', syncTypes: [{ label: 'Payments', enabled: true }, { label: 'Subscriptions', enabled: true }, { label: 'Customers', enabled: false }] },
]

const MOCK_SYNC_LOGS: SyncLog[] = [
  { timestamp: '2026-05-26 14:32', type: 'Contacts sync', records: 247, status: 'success' },
  { timestamp: '2026-05-26 14:17', type: 'Campaign import', records: 12, status: 'success' },
  { timestamp: '2026-05-26 14:00', type: 'Orders sync', records: 84, status: 'success' },
  { timestamp: '2026-05-26 13:45', type: 'Events pull', records: 1240, status: 'success' },
  { timestamp: '2026-05-26 13:30', type: 'Token refresh', records: 0, status: 'error' },
]

const MOCK_WEBHOOKS: Webhook[] = [
  { id: '1', url: 'https://ooumph.ai/webhooks/shopify-orders', source: 'Shopify', trigger: 'order.created', lastTriggered: '5 min ago', status: 'active', direction: 'incoming' },
  { id: '2', url: 'https://ooumph.ai/webhooks/stripe-payments', source: 'Stripe', trigger: 'payment.succeeded', lastTriggered: '12 min ago', status: 'active', direction: 'incoming' },
  { id: '3', url: 'https://hooks.zapier.com/hooks/catch/12345/abcdef/', trigger: 'lead.qualified', lastTriggered: '2 hours ago', status: 'active', direction: 'outgoing' },
  { id: '4', url: 'https://hooks.slack.com/services/T01234/B12345/xxxx', trigger: 'campaign.completed', lastTriggered: '1 hour ago', status: 'active', direction: 'outgoing' },
]

const CATEGORIES: Category[] = ['All', 'Social Media', 'Email', 'CRM', 'Ads', 'Analytics', 'AI Tools', 'Productivity', 'E-commerce', 'Communication']

// ─── Status helpers ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: IntegrationStatus }) {
  if (status === 'connected') return <span className="text-green-400 text-base">✅</span>
  if (status === 'error') return <span className="text-yellow-400 text-base">⚠</span>
  if (status === 'pending') return <span className="text-blue-400 text-base animate-pulse">🔄</span>
  return <span className="text-gray-600 text-base">❌</span>
}

function StatusLabel({ status }: { status: IntegrationStatus }) {
  const map: Record<IntegrationStatus, { color: string; label: string }> = {
    connected: { color: 'text-green-400', label: 'Connected' },
    disconnected: { color: 'text-gray-500', label: 'Disconnected' },
    error: { color: 'text-yellow-400', label: 'Error' },
    pending: { color: 'text-blue-400', label: 'Pending' },
  }
  const { color, label } = map[status]
  return <span className={`text-xs font-medium ${color}`}>{label}</span>
}

// ─── Integration Card ───────────────────────────────────────────────────────────

function IntegrationCard({ integration, onManage }: { integration: Integration; onManage: (id: string) => void }) {
  const isConnected = integration.status === 'connected'
  const hasIssue = integration.status === 'error'

  return (
    <div className={`bg-gray-900 border rounded-xl p-4 flex flex-col gap-3 transition-colors hover:border-gray-700 ${hasIssue ? 'border-yellow-800/50' : 'border-gray-800'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${integration.color} flex items-center justify-center text-white font-bold text-base flex-shrink-0`}>
            {integration.initial}
          </div>
          <div>
            <p className="text-white text-sm font-semibold">{integration.name}</p>
            <span className="text-gray-600 text-xs">{integration.category}</span>
          </div>
        </div>
        <StatusIcon status={integration.status} />
      </div>

      {isConnected && (
        <div className="space-y-1">
          {integration.accountName && <p className="text-gray-400 text-xs">{integration.accountName}</p>}
          {integration.dataSummary && <p className="text-indigo-400 text-xs">{integration.dataSummary}</p>}
          {integration.lastSynced && <p className="text-gray-600 text-xs">Last synced: {integration.lastSynced}</p>}
        </div>
      )}

      {integration.status === 'error' && (
        <p className="text-yellow-400 text-xs">{integration.dataSummary || 'Connection error — action required'}</p>
      )}

      {integration.status === 'pending' && (
        <p className="text-blue-400 text-xs">{integration.lastSynced}</p>
      )}

      <div className="flex items-center gap-2 mt-auto">
        <StatusLabel status={integration.status} />
        <div className="ml-auto">
          {isConnected || hasIssue ? (
            <button onClick={() => onManage(integration.id)}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg border border-gray-700 transition-colors">
              Manage
            </button>
          ) : (
            <button onClick={() => onManage(integration.id)}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors">
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('All')
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [showAddWebhook, setShowAddWebhook] = useState(false)
  const [disconnectConfirm, setDisconnectConfirm] = useState(false)

  const connectedCount = INTEGRATIONS.filter(i => i.status === 'connected').length
  const filtered = activeCategory === 'All' ? INTEGRATIONS : INTEGRATIONS.filter(i => i.category === activeCategory)

  function handleManage(id: string) {
    const integration = INTEGRATIONS.find(i => i.id === id)
    if (integration) setSelectedIntegration(integration)
  }

  const syncedToday = MOCK_SYNC_LOGS.filter(l => l.status === 'success').reduce((s, l) => s + l.records, 0)

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* ── Header ── */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-lg">🔗</div>
            <div>
              <h1 className="text-lg font-bold text-white">Connections & Integrations</h1>
              <p className="text-gray-500 text-xs">Manage all your platform connections and data syncs</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-green-900/30 border border-green-800/40 text-green-400 text-xs font-semibold px-3 py-1.5 rounded-full">
              {connectedCount} connected
            </span>
            <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Explore Marketplace
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4 mt-5">
          {[
            { label: 'Connected Platforms', value: String(connectedCount) },
            { label: 'Active Syncs', value: String(INTEGRATIONS.filter(i => i.status === 'connected' && i.syncFreq).length) },
            { label: 'Data Points Synced Today', value: syncedToday.toLocaleString() },
            { label: 'Last Sync', value: '2 min ago' },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-white font-bold text-xl">{s.value}</p>
              <p className="text-gray-500 text-xs mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 mt-5 flex-wrap">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${activeCategory === cat ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Integration Grid ── */}
      <div className="flex-1 p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 mb-10">
          {filtered.map(integration => (
            <IntegrationCard key={integration.id} integration={integration} onManage={handleManage} />
          ))}
        </div>

        {/* ── Webhook Manager ── */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-semibold">Webhook Manager</h2>
              <p className="text-gray-500 text-xs mt-0.5">Manage incoming and outgoing webhook connections</p>
            </div>
            <button onClick={() => setShowAddWebhook(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              + Add Webhook
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Incoming */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-white text-sm font-semibold">Incoming Webhooks</h3>
                <span className="text-green-400 text-xs">{MOCK_WEBHOOKS.filter(w => w.direction === 'incoming').length} active</span>
              </div>
              <div className="divide-y divide-gray-800">
                {MOCK_WEBHOOKS.filter(w => w.direction === 'incoming').map(wh => (
                  <div key={wh.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white text-sm font-medium">{wh.source}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${wh.status === 'active' ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                        {wh.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{wh.trigger}</span>
                      <span className="text-gray-600 text-xs">Last triggered: {wh.lastTriggered}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-indigo-400 text-xs bg-gray-800 px-2 py-1 rounded flex-1 truncate">{wh.url}</code>
                      <button
                        onClick={() => navigator.clipboard.writeText(wh.url)}
                        className="text-xs text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded transition-colors flex-shrink-0">
                        Copy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Outgoing */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-white text-sm font-semibold">Outgoing Webhooks</h3>
                <span className="text-green-400 text-xs">{MOCK_WEBHOOKS.filter(w => w.direction === 'outgoing').length} active</span>
              </div>
              <div className="divide-y divide-gray-800">
                {MOCK_WEBHOOKS.filter(w => w.direction === 'outgoing').map(wh => (
                  <div key={wh.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{wh.trigger}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${wh.status === 'active' ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                        {wh.status}
                      </span>
                    </div>
                    <div className="mb-2">
                      <span className="text-gray-600 text-xs">Last sent: {wh.lastTriggered}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-indigo-400 text-xs bg-gray-800 px-2 py-1 rounded flex-1 truncate">{wh.url}</code>
                      <button
                        onClick={() => navigator.clipboard.writeText(wh.url)}
                        className="text-xs text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded transition-colors flex-shrink-0">
                        Copy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ CONNECTION DETAIL SLIDE-OVER ═══ */}
      {selectedIntegration && (
        <div className="fixed inset-0 bg-gray-950/60 backdrop-blur-sm z-50 flex items-start justify-end" onClick={() => { setSelectedIntegration(null); setDisconnectConfirm(false) }}>
          <div className="w-96 h-full bg-gray-900 border-l border-gray-800 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${selectedIntegration.color} flex items-center justify-center text-white font-bold text-sm`}>
                  {selectedIntegration.initial}
                </div>
                <div>
                  <p className="text-white font-bold text-sm">{selectedIntegration.name}</p>
                  <StatusLabel status={selectedIntegration.status} />
                </div>
              </div>
              <button onClick={() => { setSelectedIntegration(null); setDisconnectConfirm(false) }} className="text-gray-500 hover:text-white">✕</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Account info */}
              {selectedIntegration.accountName && (
                <div className="bg-gray-800 rounded-xl p-3">
                  <p className="text-gray-500 text-xs mb-1">Connected account</p>
                  <p className="text-white text-sm font-medium">{selectedIntegration.accountName}</p>
                  {selectedIntegration.lastSynced && <p className="text-gray-500 text-xs mt-1">Last sync: {selectedIntegration.lastSynced}</p>}
                </div>
              )}

              {/* Connect form for disconnected */}
              {selectedIntegration.status === 'disconnected' && (
                <div className="space-y-3">
                  <p className="text-gray-400 text-sm">Connect your {selectedIntegration.name} account to start syncing data.</p>
                  <div>
                    <label className="block text-gray-400 text-xs font-medium mb-1.5">API Key / Access Token</label>
                    <input type="password" placeholder="Paste your API key or access token..."
                      className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs font-medium mb-1.5">Account ID (if required)</label>
                    <input type="text" placeholder="Account ID or workspace URL..."
                      className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
                  </div>
                  <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                    Connect {selectedIntegration.name}
                  </button>
                </div>
              )}

              {/* Sync frequency */}
              {selectedIntegration.status === 'connected' && selectedIntegration.syncFreq && (
                <div>
                  <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Sync Frequency</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Real-time', 'Every 15min', 'Hourly', 'Daily'] as SyncFrequency[]).map(freq => (
                      <button key={freq}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${selectedIntegration.syncFreq === freq ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'}`}>
                        {freq}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sync types */}
              {selectedIntegration.syncTypes && selectedIntegration.syncTypes.length > 0 && (
                <div>
                  <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">What&apos;s Syncing</label>
                  <div className="space-y-2">
                    {selectedIntegration.syncTypes.map(st => (
                      <div key={st.label} className="flex items-center justify-between">
                        <span className="text-gray-300 text-sm">{st.label}</span>
                        <span className={`text-xs ${st.enabled ? 'text-green-400' : 'text-gray-600'}`}>
                          {st.enabled ? '✅ Enabled' : '❌ Disabled'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sync logs */}
              {selectedIntegration.status === 'connected' && (
                <div>
                  <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Sync Logs</label>
                  <div className="bg-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left px-3 py-2 text-gray-500 text-xs">Time</th>
                          <th className="text-left px-3 py-2 text-gray-500 text-xs">Type</th>
                          <th className="text-right px-3 py-2 text-gray-500 text-xs">Records</th>
                          <th className="text-right px-3 py-2 text-gray-500 text-xs">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MOCK_SYNC_LOGS.slice(0, 4).map((log, i) => (
                          <tr key={i} className="border-b border-gray-700 last:border-0">
                            <td className="px-3 py-2 text-gray-500 text-xs">{log.timestamp.split(' ')[1]}</td>
                            <td className="px-3 py-2 text-gray-400 text-xs">{log.type}</td>
                            <td className="px-3 py-2 text-gray-400 text-xs text-right">{log.records}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`text-xs ${log.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                                {log.status === 'success' ? '✓' : '✗'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* API Limits expandable */}
              {selectedIntegration.status === 'connected' && (
                <details className="bg-gray-800 rounded-xl">
                  <summary className="px-4 py-3 text-gray-400 text-xs font-medium cursor-pointer hover:text-white">View API Limits</summary>
                  <div className="px-4 pb-3 space-y-2">
                    {[
                      { label: 'Requests / hour', used: 342, limit: 1000 },
                      { label: 'Requests / day', used: 2847, limit: 10000 },
                    ].map(row => (
                      <div key={row.label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-500">{row.label}</span>
                          <span className="text-gray-400">{row.used} / {row.limit}</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-1.5">
                          <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${(row.used / row.limit) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Actions */}
              {selectedIntegration.status === 'connected' && (
                <div className="space-y-2 pt-2">
                  <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                    Force Sync Now
                  </button>
                  {!disconnectConfirm ? (
                    <button onClick={() => setDisconnectConfirm(true)}
                      className="w-full bg-gray-800 hover:bg-red-900/30 text-red-400 py-2.5 rounded-xl text-sm font-medium transition-colors border border-gray-700 hover:border-red-800">
                      Disconnect
                    </button>
                  ) : (
                    <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
                      <p className="text-red-300 text-sm mb-3">Are you sure you want to disconnect {selectedIntegration.name}? This will stop all data syncs.</p>
                      <div className="flex gap-2">
                        <button onClick={() => { setDisconnectConfirm(false); setSelectedIntegration(null) }}
                          className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                          Yes, disconnect
                        </button>
                        <button onClick={() => setDisconnectConfirm(false)}
                          className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-700">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADD WEBHOOK MODAL ═══ */}
      {showAddWebhook && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-white font-bold">Add Webhook</h2>
              <button onClick={() => setShowAddWebhook(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Incoming', 'Outgoing'].map(d => (
                    <button key={d} className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-400 hover:text-white border border-gray-700 transition-colors first:bg-indigo-600 first:text-white first:border-transparent">
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Endpoint URL</label>
                <input type="url" placeholder="https://your-endpoint.com/webhook"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Trigger Event</label>
                <select className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
                  {['order.created', 'payment.succeeded', 'lead.qualified', 'campaign.completed', 'contact.created', 'form.submitted'].map(e => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Source (optional)</label>
                <input type="text" placeholder="e.g. Shopify, Stripe..."
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAddWebhook(false)}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                  Add Webhook
                </button>
                <button onClick={() => setShowAddWebhook(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium transition-colors border border-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
