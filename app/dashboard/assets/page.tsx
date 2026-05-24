'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { AssetPackage } from '@/lib/agents/assets'

export default function AssetsPage() {
  const router = useRouter()
  const [fetching, setFetching] = useState(true)
  const [loading, setLoading] = useState(false)
  const [assets, setAssets] = useState<AssetPackage | null>(null)
  const [artifactIds, setArtifactIds] = useState<Record<string, string>>({})
  const [active, setActive] = useState<keyof AssetPackage>('linkedInPost')
  const [editMode, setEditMode] = useState(false)
  const [editJson, setEditJson] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    fetch(`/api/agents/assets?workspaceId=${wid}`)
      .then((r) => r.json())
      .then((data: Array<{ id: string; type: string; content_json: unknown }>) => {
        if (data.length > 0) {
          const assembled: Partial<AssetPackage> = {}
          const ids: Record<string, string> = {}
          for (const a of data) {
            if (!(assembled as Record<string, unknown>)[a.type]) {
              (assembled as Record<string, unknown>)[a.type] = a.content_json
              ids[a.type] = a.id
            }
          }
          setAssets(assembled as AssetPackage)
          setArtifactIds(ids)
        }
      })
      .finally(() => setFetching(false))
  }, [router])

  const generate = async () => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch('/api/agents/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (data.assets) {
        setAssets(data.assets)
        setArtifactIds(data.artifactIds || {})
      }
    } finally { setLoading(false) }
  }

  const startEdit = () => {
    const current = assets?.[active]
    setEditJson(JSON.stringify(current, null, 2))
    setEditError('')
    setEditMode(true)
  }

  const cancelEdit = () => {
    setEditMode(false)
    setEditJson('')
    setEditError('')
  }

  const saveEdit = async () => {
    const artifactId = artifactIds[active]
    if (!artifactId) { setEditError('No artifact ID found'); return }
    let parsed: unknown
    try { parsed = JSON.parse(editJson) } catch { setEditError('Invalid JSON — fix syntax before saving'); return }
    setSaving(true); setEditError('')
    try {
      const res = await fetch('/api/artifacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId, content_json: parsed }),
      })
      const data = await res.json()
      if (data.ok) {
        setAssets((prev) => prev ? { ...prev, [active]: parsed } as AssetPackage : prev)
        setEditMode(false)
      } else {
        setEditError(data.error || 'Save failed')
      }
    } catch { setEditError('Network error') } finally { setSaving(false) }
  }

  const TABS: Array<{ key: keyof AssetPackage; label: string; icon: string }> = [
    { key: 'linkedInPost', label: 'LinkedIn Post', icon: '💼' },
    { key: 'carousel', label: 'Carousel', icon: '🖼️' },
    { key: 'reelScript', label: 'Reel Script', icon: '🎬' },
    { key: 'adCopy', label: 'Ad Copy', icon: '📢' },
    { key: 'emailDraft', label: 'Email', icon: '📧' },
  ]

  const handleTabChange = (key: keyof AssetPackage) => {
    setActive(key)
    setEditMode(false)
    setEditError('')
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">✍️ Marketing Assets</h1>
          <p className="text-gray-400 text-sm mt-1">5 ready-to-use content pieces — all waiting for your approval</p>
        </div>
        <div className="flex gap-3">
          {assets && (
            <button onClick={() => router.push('/dashboard/approvals')} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">
              Review in Approvals →
            </button>
          )}
          <button onClick={generate} disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {loading ? 'Generating...' : assets ? '↻ Regenerate All' : '⚡ Generate Assets'}
          </button>
        </div>
      </div>

      {fetching && !loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex items-center gap-4 mb-6">
          <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Loading assets...</p>
        </div>
      )}

      {loading && (
        <div className="bg-gray-900 border border-indigo-800 rounded-xl p-8 flex items-center gap-4 mb-6">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-300">Copy Agent is creating 5 marketing assets — carousel, reel, ad copy, email, LinkedIn...</p>
        </div>
      )}

      {assets && !loading && (
        <>
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => handleTabChange(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${active === t.key ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            {/* Edit toolbar */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-gray-500 text-xs uppercase tracking-wide">{TABS.find((t) => t.key === active)?.label}</p>
              <div className="flex gap-2">
                {!editMode && assets?.[active] && <CopyButton getText={() => assetToText(active, assets[active]!)} />}
                {!editMode ? (
                  <button onClick={startEdit}
                    className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-indigo-700 text-xs transition-colors">
                    ✏️ Edit
                  </button>
                ) : (
                  <>
                    <button onClick={cancelEdit} className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-xs transition-colors">
                      Cancel
                    </button>
                    <button onClick={saveEdit} disabled={saving}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {editError && <div className="mb-4 p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-xs">{editError}</div>}

            {editMode ? (
              <div>
                <p className="text-xs text-gray-500 mb-2">Edit content as JSON. Changes are saved to the database.</p>
                <textarea
                  className="w-full h-80 px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs font-mono resize-none focus:outline-none focus:border-indigo-500"
                  value={editJson}
                  onChange={(e) => setEditJson(e.target.value)}
                />
              </div>
            ) : (
              <>
                {active === 'linkedInPost' && assets.linkedInPost && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-gray-800">
                      <p className="text-xs text-gray-500 mb-2">HOOK (First line — stops the scroll)</p>
                      <p className="text-white font-semibold">{assets.linkedInPost.hook}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-800">
                      <p className="text-xs text-gray-500 mb-2">BODY</p>
                      <pre className="text-gray-300 text-sm whitespace-pre-wrap">{assets.linkedInPost.body}</pre>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-800">
                      <p className="text-xs text-gray-500 mb-2">CTA</p>
                      <p className="text-indigo-400">{assets.linkedInPost.cta}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {assets.linkedInPost.hashtags?.map((h, i) => <span key={i} className="px-2 py-0.5 rounded bg-gray-800 text-blue-400 text-xs">#{h}</span>)}
                    </div>
                  </div>
                )}

                {active === 'emailDraft' && assets.emailDraft && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-gray-800">
                      <p className="text-xs text-gray-500 mb-1">SUBJECT</p>
                      <p className="text-white font-semibold">{assets.emailDraft.subject}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-800">
                      <p className="text-xs text-gray-500 mb-1">PREVIEW TEXT</p>
                      <p className="text-gray-300 text-sm">{assets.emailDraft.previewText}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-800">
                      <p className="text-xs text-gray-500 mb-2">BODY</p>
                      <pre className="text-gray-300 text-sm whitespace-pre-wrap">{assets.emailDraft.body}</pre>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-800">
                      <p className="text-xs text-gray-500 mb-1">CTA</p>
                      <p className="text-indigo-400 font-medium">{assets.emailDraft.cta}</p>
                    </div>
                  </div>
                )}

                {active === 'adCopy' && assets.adCopy && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-gray-800">
                      <p className="text-xs text-gray-500 mb-1">HEADLINE</p>
                      <p className="text-white font-bold text-lg">{assets.adCopy.headline}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-800">
                      <p className="text-xs text-gray-500 mb-2">PRIMARY TEXT</p>
                      <p className="text-gray-300 text-sm">{assets.adCopy.primaryText}</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1 p-4 rounded-lg bg-gray-800">
                        <p className="text-xs text-gray-500 mb-1">DESCRIPTION</p>
                        <p className="text-gray-300 text-sm">{assets.adCopy.description}</p>
                      </div>
                      <div className="p-4 rounded-lg bg-indigo-950 border border-indigo-800">
                        <p className="text-xs text-gray-500 mb-1">CTA BUTTON</p>
                        <p className="text-indigo-300 font-medium">{assets.adCopy.cta}</p>
                      </div>
                    </div>
                    {assets.adCopy.variations?.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">A/B Variations</p>
                        <div className="space-y-2">
                          {assets.adCopy.variations.map((v, i) => (
                            <div key={i} className="p-3 rounded-lg bg-gray-800 text-sm">
                              <p className="text-white font-medium">{v.headline}</p>
                              <p className="text-gray-400 text-xs mt-1">{v.hook}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {active === 'carousel' && assets.carousel && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-indigo-950 border border-indigo-800">
                      <p className="text-xs text-gray-500 mb-1">COVER TEXT</p>
                      <p className="text-white font-bold text-lg">{assets.carousel.coverText}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {assets.carousel.slides?.map((slide, i) => (
                        <div key={i} className="p-4 rounded-lg bg-gray-800">
                          <p className="text-xs text-gray-600 mb-1">Slide {i + 1}</p>
                          <p className="text-white text-sm font-semibold mb-2">{slide.headline}</p>
                          <p className="text-gray-400 text-xs">{slide.body}</p>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 rounded-lg bg-gray-800">
                      <p className="text-xs text-gray-500 mb-1">LAST SLIDE CTA</p>
                      <p className="text-indigo-400">{assets.carousel.cta}</p>
                    </div>
                  </div>
                )}

                {active === 'reelScript' && assets.reelScript && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-indigo-950 border border-indigo-800">
                      <p className="text-xs text-gray-500 mb-1">HOOK (First 3 seconds)</p>
                      <p className="text-white font-bold text-lg">{assets.reelScript.hook}</p>
                    </div>
                    <div className="space-y-2">
                      {assets.reelScript.scenes?.map((scene, i) => (
                        <div key={i} className="p-4 rounded-lg bg-gray-800 text-sm">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-400 text-xs font-mono">{scene.timecode}</span>
                            <span className="text-gray-500 text-xs">{scene.action}</span>
                          </div>
                          <p className="text-white mb-1">{scene.voiceover}</p>
                          <p className="text-gray-500 text-xs">B-roll: {scene.broll}</p>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 rounded-lg bg-gray-800">
                      <p className="text-xs text-gray-500 mb-1">END SCREEN</p>
                      <p className="text-indigo-400">{assets.reelScript.endScreen}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {!assets && !loading && !fetching && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">✍️</div>
          <p className="text-white font-medium mb-2">No assets yet</p>
          <p className="text-gray-500 text-sm">Generate your strategy first, then create 5 ready-to-use marketing assets.</p>
        </div>
      )}
    </div>
  )
}

function assetToText(type: string, asset: unknown): string {
  const a = asset as Record<string, unknown>
  switch (type) {
    case 'linkedInPost':
      return [a.hook, a.body, a.cta, (a.hashtags as string[] | undefined)?.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n')
    case 'emailDraft':
      return [`Subject: ${a.subject}`, `Preview: ${a.previewText}`, a.body, `CTA: ${a.cta}`].filter(Boolean).join('\n\n')
    case 'adCopy':
      return [`Headline: ${a.headline}`, a.primaryText, `CTA: ${a.cta}`].filter(Boolean).join('\n\n')
    case 'carousel': {
      const slides = (a.slides as Array<{ headline: string; body: string }> | undefined) || []
      return [`Cover: ${a.coverText}`, ...slides.map((s, i) => `Slide ${i + 1}: ${s.headline}\n${s.body}`), `CTA: ${a.cta}`].join('\n\n')
    }
    case 'reelScript': {
      const scenes = (a.scenes as Array<{ timecode: string; voiceover: string }> | undefined) || []
      return [`Hook: ${a.hook}`, ...scenes.map((s) => `[${s.timecode}] ${s.voiceover}`), `End: ${a.endScreen}`].join('\n\n')
    }
    default:
      return JSON.stringify(asset, null, 2)
  }
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(getText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy}
      className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-xs transition-colors">
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}
