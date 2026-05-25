'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface CloudinaryAsset {
  publicId: string
  secureUrl: string
  format: string
  width: number
  height: number
  bytes: number
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MediaLibraryPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [assets, setAssets] = useState<CloudinaryAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [uploadUrl, setUploadUrl] = useState('')
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cloudinaryConfigured, setCloudinaryConfigured] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadAssets = useCallback(async (wid: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/agents/media?workspaceId=${wid}&source=cloudinary&folder=ooumph&limit=50`
      )
      const data = await res.json()
      if (data.requiresSetup) {
        setCloudinaryConfigured(false)
        setAssets([])
      } else if (data.ok) {
        setAssets(data.assets || [])
        setCloudinaryConfigured(true)
      } else {
        setError(data.error || 'Failed to load images')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (wid) loadAssets(wid)
  }, [loadAssets])

  const handleUpload = async () => {
    if (!uploadUrl.trim() || !workspaceId) return
    setUploading(true)
    setError('')
    try {
      const res = await fetch('/api/agents/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_url',
          imageUrl: uploadUrl.trim(),
          workspaceId,
          folder: 'ooumph',
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setUploadUrl('')
        setShowUploadForm(false)
        await loadAssets(workspaceId)
      } else {
        setError(data.error || 'Upload failed')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (publicId: string) => {
    if (!workspaceId) return
    setDeletingId(publicId)
    try {
      const res = await fetch('/api/agents/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', publicId, workspaceId }),
      })
      const data = await res.json()
      if (data.ok) {
        setAssets(prev => prev.filter(a => a.publicId !== publicId))
      } else {
        setError(data.error || 'Delete failed')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setDeletingId(null)
    }
  }

  const handleCopyUrl = (url: string, publicId: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopyFeedback(publicId)
      setTimeout(() => setCopyFeedback(null), 1500)
    })
  }

  const filteredAssets = assets.filter(a =>
    a.publicId.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>🖼️</span> Media Library
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            All generated and uploaded images — powered by Cloudinary
          </p>
        </div>
      </div>

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button
          onClick={() => setShowUploadForm(v => !v)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showUploadForm ? 'Cancel' : '+ Upload from URL'}
        </button>
        <button
          onClick={() => workspaceId && loadAssets(workspaceId)}
          disabled={loading}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? '⏳ Loading...' : '↻ Refresh'}
        </button>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search images..."
          className="flex-1 min-w-48 px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500 placeholder-gray-500"
        />
        {assets.length > 0 && (
          <span className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 text-xs rounded-full">
            {filteredAssets.length} image{filteredAssets.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Upload form */}
      {showUploadForm && (
        <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-white text-sm font-medium mb-3">Upload from URL</p>
          <div className="flex gap-2">
            <input
              type="url"
              value={uploadUrl}
              onChange={e => setUploadUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUpload()}
              placeholder="https://example.com/image.jpg"
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500 placeholder-gray-500"
            />
            <button
              onClick={handleUpload}
              disabled={uploading || !uploadUrl.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          <div className="mt-3 border-2 border-dashed border-gray-700 rounded-lg p-6 text-center text-gray-500 text-sm">
            Paste image URL above to upload
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-5 p-4 bg-red-950/50 border border-red-800 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Setup needed state */}
      {!cloudinaryConfigured && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">☁️</div>
          <h3 className="text-white font-semibold text-lg mb-2">Cloudinary not configured</h3>
          <p className="text-gray-400 text-sm mb-6">
            Add your Cloudinary credentials in Settings to use the Media Library.
          </p>
          <Link
            href="/dashboard/settings?tab=api-keys"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Go to Settings
          </Link>
        </div>
      )}

      {/* Loading state */}
      {loading && cloudinaryConfigured && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden animate-pulse">
              <div className="h-40 bg-gray-800" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-gray-800 rounded w-3/4" />
                <div className="h-3 bg-gray-800 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && cloudinaryConfigured && filteredAssets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">🖼️</div>
          <h3 className="text-white font-semibold text-lg mb-2">No images yet</h3>
          <p className="text-gray-400 text-sm mb-6">
            Generate images in AI Image Studio or upload from a URL.
          </p>
          <Link
            href="/dashboard/image-gen"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Go to Image Studio
          </Link>
        </div>
      )}

      {/* Image grid */}
      {!loading && cloudinaryConfigured && filteredAssets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredAssets.map(asset => (
            <div
              key={asset.publicId}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors group"
            >
              {/* Thumbnail */}
              <div className="relative h-40 bg-gray-800 overflow-hidden">
                <img
                  src={asset.secureUrl}
                  alt={asset.publicId}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  loading="lazy"
                />
              </div>

              {/* Info */}
              <div className="p-3">
                <p className="text-gray-400 text-xs truncate mb-2" title={asset.publicId}>
                  {asset.publicId.split('/').pop() || asset.publicId}
                </p>
                <div className="flex items-center gap-2 mb-3">
                  {asset.bytes > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">
                      {formatBytes(asset.bytes)}
                    </span>
                  )}
                  {asset.width > 0 && asset.height > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">
                      {asset.width} × {asset.height}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCopyUrl(asset.secureUrl, asset.publicId)}
                    className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    {copyFeedback === asset.publicId ? '✓ Copied' : 'Copy URL'}
                  </button>
                  <a
                    href={asset.secureUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors text-center"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => handleDelete(asset.publicId)}
                    disabled={deletingId === asset.publicId}
                    className="py-1.5 px-2 text-xs font-medium rounded-lg bg-red-950 hover:bg-red-900 text-red-400 transition-colors disabled:opacity-50"
                  >
                    {deletingId === asset.publicId ? '...' : 'Del'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
