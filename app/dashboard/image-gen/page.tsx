'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Size = '1024x1024' | '1792x1024' | '1024x1792'
type Quality = 'standard' | 'hd'
type Style = 'vivid' | 'natural'

interface ImageResult {
  imageUrl: string
  revisedPrompt: string
  cloudinaryUrl?: string
  artifactId?: string
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs transition-colors"
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

const SIZE_OPTIONS: { label: string; sub: string; value: Size }[] = [
  { label: 'Square', sub: '1:1', value: '1024x1024' },
  { label: 'Landscape', sub: '16:9', value: '1792x1024' },
  { label: 'Portrait', sub: '9:16', value: '1024x1792' },
]

export default function ImageGenPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState<Size>('1024x1024')
  const [quality, setQuality] = useState<Quality>('standard')
  const [style, setStyle] = useState<Style>('vivid')
  const [uploadToCloudinary, setUploadToCloudinary] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [requiresSetup, setRequiresSetup] = useState(false)
  const [result, setResult] = useState<ImageResult | null>(null)

  useEffect(() => {
    setWorkspaceId(localStorage.getItem('workspaceId') || '')
  }, [])

  async function generate() {
    if (!prompt.trim()) {
      setError('Please describe the image you want to generate.')
      return
    }
    setLoading(true)
    setError('')
    setRequiresSetup(false)
    setResult(null)

    try {
      const res = await fetch('/api/agents/creative/image-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, prompt, size, quality, style, uploadToCloudinary }),
      })
      const data = await res.json()

      if (data.requiresSetup) {
        setRequiresSetup(true)
        setError(data.error)
        return
      }
      if (!data.ok) {
        setError(data.error || 'Image generation failed.')
        return
      }

      setResult({
        imageUrl: data.imageUrl,
        revisedPrompt: data.revisedPrompt,
        cloudinaryUrl: data.cloudinaryUrl,
        artifactId: data.artifactId,
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  function downloadImage() {
    if (!result) return
    const url = result.cloudinaryUrl || result.imageUrl
    const a = document.createElement('a')
    a.href = url
    a.download = 'ooumph-generated.png'
    a.target = '_blank'
    a.rel = 'noreferrer'
    a.click()
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white font-bold text-sm">
            ✨
          </div>
          <h1 className="text-2xl font-bold text-white">AI Image Studio</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">Generate stunning visuals with DALL-E 3</p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Controls */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          {/* Prompt */}
          <div>
            <label className="text-gray-400 text-xs mb-1.5 block">
              Describe your image <span className="text-red-400">*</span>
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={4}
              placeholder="A professional headshot of a confident entrepreneur in a modern office, cinematic lighting, sharp focus..."
              className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Size selector */}
          <div>
            <label className="text-gray-400 text-xs mb-2 block">Size</label>
            <div className="grid grid-cols-3 gap-2">
              {SIZE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSize(opt.value)}
                  className={`py-2.5 px-3 rounded-xl border text-center transition-all ${
                    size === opt.value
                      ? 'border-indigo-500 bg-indigo-900/30 ring-1 ring-indigo-500/40'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <p className={`font-semibold text-xs ${size === opt.value ? 'text-indigo-300' : 'text-white'}`}>
                    {opt.label}
                  </p>
                  <p className="text-gray-500 text-xs">{opt.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Quality toggle */}
          <div>
            <label className="text-gray-400 text-xs mb-2 block">Quality</label>
            <div className="flex rounded-xl overflow-hidden border border-gray-700 w-fit">
              {(['standard', 'hd'] as Quality[]).map(q => (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  className={`px-5 py-2 text-xs font-medium transition-colors capitalize ${
                    quality === q
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {q === 'hd' ? 'HD' : 'Standard'}
                </button>
              ))}
            </div>
          </div>

          {/* Style toggle */}
          <div>
            <label className="text-gray-400 text-xs mb-2 block">Style</label>
            <div className="flex rounded-xl overflow-hidden border border-gray-700 w-fit">
              {(['vivid', 'natural'] as Style[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={`px-5 py-2 text-xs font-medium transition-colors capitalize ${
                    style === s
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Cloudinary checkbox */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={uploadToCloudinary}
              onChange={e => setUploadToCloudinary(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
            />
            <div>
              <p className="text-gray-300 text-sm group-hover:text-white transition-colors">
                Save to Media Library
              </p>
              <p className="text-gray-600 text-xs">Upload to Cloudinary CDN for permanent hosting</p>
            </div>
          </label>

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-950/40 border border-red-800/40 p-4">
              <p className="text-red-400 text-sm">{error}</p>
              {requiresSetup && (
                <Link
                  href="/dashboard/settings"
                  className="inline-block mt-2 text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                >
                  Go to Settings to add your OpenAI API key →
                </Link>
              )}
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={loading || !workspaceId}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-6 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating image...
              </>
            ) : (
              '✨ Generate Image'
            )}
          </button>
        </div>

        {/* RIGHT: Result */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col">
          {!result ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm">Your generated image will appear here</p>
              <p className="text-gray-700 text-xs mt-1">Describe what you want and click Generate</p>
            </div>
          ) : (
            <div className="space-y-4 flex-1">
              {/* Image */}
              <div className="rounded-xl overflow-hidden bg-gray-800 border border-gray-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.imageUrl}
                  alt={prompt}
                  className="w-full max-h-96 object-cover"
                />
              </div>

              {/* Revised prompt */}
              {result.revisedPrompt && result.revisedPrompt !== prompt && (
                <div className="bg-gray-800/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs mb-1">Revised prompt by DALL-E:</p>
                  <p className="text-gray-400 text-xs leading-relaxed">{result.revisedPrompt}</p>
                </div>
              )}

              {/* Cloudinary badge */}
              {result.cloudinaryUrl && (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-green-900/40 border border-green-800/40 text-green-300 text-xs rounded-full font-medium">
                    Saved to Media Library
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={downloadImage}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  Download
                </button>
                <CopyButton
                  text={result.cloudinaryUrl || result.imageUrl}
                  label="Copy URL"
                />
                <button
                  onClick={() => { setResult(null); setPrompt('') }}
                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
                >
                  New image
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
