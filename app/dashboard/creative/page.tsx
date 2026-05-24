'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VisualSlide {
  type: 'cover' | 'slide' | 'cta'
  title?: string
  coverText?: string
  headline?: string
  body?: string
  slideNum?: number
  cta?: string
}

interface VisualCarouselArtifact {
  id: string
  title: string
  created_at: string
  approval_status: string
  approval_id: string
  approval_notes: string
  content_json: {
    businessName: string
    tone: string
    slides: VisualSlide[]
    totalSlides: number
  }
}

interface ThumbnailArtifact {
  id: string
  title: string
  approval_status: string
  approval_id: string
  content_json: {
    topic: string
    businessName: string
    tone: string
    headline: string
    subtext: string
    accentNumber: string | null
    accentWord: string | null
    layout: 'stat' | 'hook'
  }
}

interface SimpleArtifact {
  id: string
  title: string
  approval_status: string
  content_json: Record<string, unknown>
}

// ─── URL builders ─────────────────────────────────────────────────────────────

function buildSlideUrl(slide: VisualSlide, tone: string, business: string, total: number): string {
  const params = new URLSearchParams({ type: slide.type, tone: tone || 'professional', business: business.slice(0, 40) })
  if (slide.type === 'cover') {
    params.set('title', (slide.title || '').slice(0, 100))
    params.set('coverText', (slide.coverText || '').slice(0, 150))
  } else if (slide.type === 'slide') {
    params.set('headline', (slide.headline || '').slice(0, 80))
    params.set('body', (slide.body || '').slice(0, 220))
    params.set('slideNum', String(slide.slideNum || 1))
    params.set('total', String(total - 2))
  } else {
    params.set('cta', (slide.cta || '').slice(0, 100))
  }
  return `/api/creative/carousel/slide?${params.toString()}`
}

function buildThumbnailUrl(c: ThumbnailArtifact['content_json']): string {
  const params = new URLSearchParams({
    layout: c.layout || 'hook',
    tone: c.tone || 'professional',
    business: (c.businessName || '').slice(0, 40),
    headline: (c.headline || '').slice(0, 60),
    subtext: (c.subtext || '').slice(0, 80),
  })
  if (c.accentNumber) params.set('accentNumber', String(c.accentNumber).slice(0, 10))
  if (c.accentWord) params.set('accentWord', String(c.accentWord).slice(0, 20))
  return `/api/creative/thumbnail?${params.toString()}`
}

function buildStaticPostUrl(c: Record<string, unknown>): string {
  const params = new URLSearchParams({
    tone: (c.tone as string) || 'professional',
    business: ((c.businessName as string) || '').slice(0, 40),
    hook: ((c.hook as string) || '').slice(0, 80),
    body: ((c.body as string) || '').slice(0, 120),
    cta: ((c.cta as string) || '').slice(0, 60),
    platform: (c.platform as string) || 'instagram',
  })
  return `/api/creative/static-post?${params.toString()}`
}

function buildStoryUrl(c: Record<string, unknown>): string {
  const params = new URLSearchParams({
    tone: (c.tone as string) || 'professional',
    business: ((c.businessName as string) || '').slice(0, 40),
    hook: ((c.hook as string) || '').slice(0, 80),
    subtext: ((c.subtext as string) || '').slice(0, 100),
    cta: ((c.cta as string) || '').slice(0, 60),
    label: ((c.label as string) || 'NEW').slice(0, 20),
  })
  return `/api/creative/story-cover?${params.toString()}`
}

function buildAdUrl(c: Record<string, unknown>, size = 'square'): string {
  const params = new URLSearchParams({
    tone: (c.tone as string) || 'professional',
    business: ((c.businessName as string) || '').slice(0, 40),
    headline: ((c.headline as string) || '').slice(0, 80),
    subtext: ((c.subtext as string) || '').slice(0, 120),
    cta: ((c.cta as string) || '').slice(0, 50),
    offer: ((c.offer as string) || '').slice(0, 60),
    size,
  })
  return `/api/creative/ad-creative?${params.toString()}`
}

function slideLabel(slide: VisualSlide) {
  if (slide.type === 'cover') return 'Cover'
  if (slide.type === 'cta') return 'CTA'
  return `Slide ${slide.slideNum}`
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-green-900/30 text-green-400',
  rejected: 'bg-red-900/30 text-red-400',
  pending: 'bg-yellow-900/30 text-yellow-400',
}

const TABS = [
  { id: 'carousel', label: 'Visual Carousel', icon: '🖼️' },
  { id: 'thumbnail', label: 'YT Thumbnail', icon: '📺' },
  { id: 'static', label: 'Static Post', icon: '📸' },
  { id: 'story', label: 'Story Cover', icon: '📱' },
  { id: 'ad', label: 'Ad Creative', icon: '📢' },
  { id: 'video', label: 'Video Generator', icon: '🎬' },
  { id: 'landing', label: 'Landing Page', icon: '🏠' },
  { id: 'requests', label: 'Agent Requests', icon: '🔗' },
]

const VIDEO_FORMATS = [
  { id: 'reel',    label: 'Instagram Reel', aspect: '9:16', max: '90s' },
  { id: 'story',   label: 'Story',          aspect: '9:16', max: '60s' },
  { id: 'short',   label: 'YouTube Short',  aspect: '9:16', max: '60s' },
  { id: 'youtube', label: 'YouTube Long',   aspect: '16:9', max: '15m' },
  { id: 'square',  label: 'Feed Video',     aspect: '1:1',  max: '60s' },
  { id: 'ad',      label: 'Video Ad',       aspect: '1:1',  max: '30s' },
]

const LANDING_TYPES = [
  { id: 'lead_capture', label: 'Lead Capture' },
  { id: 'product',      label: 'Product Page' },
  { id: 'webinar',      label: 'Webinar Registration' },
  { id: 'free_trial',   label: 'Free Trial / Demo' },
  { id: 'sale',         label: 'Sales Page' },
]

function buildVideoFrameUrl(scene: Record<string, unknown>, format: string, tone: string, business: string, totalScenes: number): string {
  const params = new URLSearchParams({
    format, tone,
    business: business.slice(0, 40),
    sceneNum: String(scene.sceneNum || 1),
    totalScenes: String(totalScenes),
    shotType: ((scene.shotType as string) || 'medium shot').slice(0, 40),
    visual: ((scene.visual as string) || '').slice(0, 120),
    script: ((scene.script as string) || '').slice(0, 140),
    duration: ((scene.duration as string) || '3s').slice(0, 8),
  })
  return `/api/creative/video-frame?${params.toString()}`
}

function buildLandingHeroUrl(c: Record<string, unknown>): string {
  const hero = (c.hero as Record<string, string>) || {}
  const params = new URLSearchParams({
    section: 'hero', tone: (c.tone as string) || 'professional',
    business: ((c.businessName as string) || '').slice(0, 40),
    headline: (hero.headline || '').slice(0, 80),
    sub: (hero.sub || '').slice(0, 120),
    cta: (hero.cta || 'Get Started').slice(0, 50),
    tag: (hero.tag || '').slice(0, 40),
  })
  return `/api/creative/landing-visual?${params.toString()}`
}

function buildLandingSection(c: Record<string, unknown>, section: string): string {
  const tone = (c.tone as string) || 'professional'
  const business = ((c.businessName as string) || '').slice(0, 40)

  if (section === 'feature') {
    const f = (c.features as Record<string, unknown>) || {}
    const items = (f.items as Array<{ title: string; desc: string }>) || []
    const params = new URLSearchParams({
      section: 'feature', tone, business,
      tag: ((f.tag as string) || '').slice(0, 40),
      headline: ((f.headline as string) || '').slice(0, 80),
      f1t: (items[0]?.title || '').slice(0, 40), f1d: (items[0]?.desc || '').slice(0, 80),
      f2t: (items[1]?.title || '').slice(0, 40), f2d: (items[1]?.desc || '').slice(0, 80),
      f3t: (items[2]?.title || '').slice(0, 40), f3d: (items[2]?.desc || '').slice(0, 80),
    })
    return `/api/creative/landing-visual?${params.toString()}`
  }

  if (section === 'stats') {
    const st = (c.stats as Record<string, unknown>) || {}
    const items = (st.items as Array<{ num: string; label: string }>) || []
    const params = new URLSearchParams({
      section: 'stats', tone, business,
      s1n: (items[0]?.num || '').slice(0, 16), s1l: (items[0]?.label || '').slice(0, 40),
      s2n: (items[1]?.num || '').slice(0, 16), s2l: (items[1]?.label || '').slice(0, 40),
      s3n: (items[2]?.num || '').slice(0, 16), s3l: (items[2]?.label || '').slice(0, 40),
      s4n: (items[3]?.num || '').slice(0, 16), s4l: (items[3]?.label || '').slice(0, 40),
    })
    return `/api/creative/landing-visual?${params.toString()}`
  }

  if (section === 'cta') {
    const ct = (c.cta as Record<string, string>) || {}
    const params = new URLSearchParams({
      section: 'cta', tone, business,
      tag: (ct.tag || '').slice(0, 40),
      headline: (ct.headline || '').slice(0, 80),
      sub: (ct.sub || '').slice(0, 120),
      cta: (ct.cta || 'Get Started').slice(0, 50),
    })
    return `/api/creative/landing-visual?${params.toString()}`
  }

  return ''
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreativePage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [activeTab, setActiveTab] = useState('carousel')

  // Carousel
  const [carousels, setCarousels] = useState<VisualCarouselArtifact[]>([])
  const [generatingCarousel, setGeneratingCarousel] = useState(false)
  const [fetchingCarousel, setFetchingCarousel] = useState(true)
  const [activeSlide, setActiveSlide] = useState(0)

  // Thumbnail
  const [thumbnails, setThumbnails] = useState<ThumbnailArtifact[]>([])
  const [generatingThumb, setGeneratingThumb] = useState(false)
  const [fetchingThumb, setFetchingThumb] = useState(true)
  const [thumbTopic, setThumbTopic] = useState('')

  // Static Post
  const [posts, setPosts] = useState<SimpleArtifact[]>([])
  const [generatingPost, setGeneratingPost] = useState(false)
  const [fetchingPost, setFetchingPost] = useState(true)
  const [postTopic, setPostTopic] = useState('')
  const [postPlatform, setPostPlatform] = useState('instagram')

  // Story Cover
  const [stories, setStories] = useState<SimpleArtifact[]>([])
  const [generatingStory, setGeneratingStory] = useState(false)
  const [fetchingStory, setFetchingStory] = useState(true)
  const [storyTopic, setStoryTopic] = useState('')
  const [storyPlatform, setStoryPlatform] = useState('instagram')

  // Ad Creative
  const [ads, setAds] = useState<SimpleArtifact[]>([])
  const [generatingAd, setGeneratingAd] = useState(false)
  const [fetchingAd, setFetchingAd] = useState(true)
  const [adTopic, setAdTopic] = useState('')
  const [adPlatform, setAdPlatform] = useState('facebook')
  const [adSize, setAdSize] = useState('square')

  // Video Generator
  const [videos, setVideos] = useState<SimpleArtifact[]>([])
  const [generatingVideo, setGeneratingVideo] = useState(false)
  const [fetchingVideo, setFetchingVideo] = useState(true)
  const [videoTopic, setVideoTopic] = useState('')
  const [videoFormat, setVideoFormat] = useState('reel')
  const [activeScene, setActiveScene] = useState(0)

  // Landing Page Visuals
  const [landings, setLandings] = useState<SimpleArtifact[]>([])
  const [generatingLanding, setGeneratingLanding] = useState(false)
  const [fetchingLanding, setFetchingLanding] = useState(true)
  const [landingType, setLandingType] = useState('lead_capture')
  const [landingSection, setLandingSection] = useState('hero')

  // Agent Requests
  const [agentRequests, setAgentRequests] = useState<Record<string, unknown>[]>([])
  const [fetchingRequests, setFetchingRequests] = useState(true)

  const [error, setError] = useState('')

  const fetchAll = useCallback(async (wid: string) => {
    const [carRes, thRes, postRes, stRes, adRes, vidRes, landRes, reqRes] = await Promise.all([
      fetch(`/api/agents/creative/carousel?workspaceId=${wid}`),
      fetch(`/api/agents/creative/thumbnail?workspaceId=${wid}`),
      fetch(`/api/agents/creative/static-post?workspaceId=${wid}`),
      fetch(`/api/agents/creative/story-cover?workspaceId=${wid}`),
      fetch(`/api/agents/creative/ad-creative?workspaceId=${wid}`),
      fetch(`/api/agents/creative/video-generator?workspaceId=${wid}`),
      fetch(`/api/agents/creative/landing-visual?workspaceId=${wid}`),
      fetch(`/api/agents/creative/request?workspaceId=${wid}`),
    ])
    const [carData, thData, postData, stData, adData, vidData, landData, reqData] = await Promise.all([
      carRes.json(), thRes.json(), postRes.json(), stRes.json(), adRes.json(), vidRes.json(), landRes.json(), reqRes.json(),
    ])
    if (Array.isArray(carData)) { setCarousels(carData); setActiveSlide(0) }
    if (Array.isArray(thData)) setThumbnails(thData)
    if (Array.isArray(postData)) setPosts(postData)
    if (Array.isArray(stData)) setStories(stData)
    if (Array.isArray(adData)) setAds(adData)
    if (Array.isArray(vidData)) { setVideos(vidData); setActiveScene(0) }
    if (Array.isArray(landData)) setLandings(landData)
    if (Array.isArray(reqData)) setAgentRequests(reqData)
    setFetchingCarousel(false); setFetchingThumb(false)
    setFetchingPost(false); setFetchingStory(false); setFetchingAd(false)
    setFetchingVideo(false); setFetchingLanding(false); setFetchingRequests(false)
  }, [])

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (wid) fetchAll(wid)
  }, [fetchAll])

  async function generate(endpoint: string, body: object, onDone: () => void, setGenerating: (v: boolean) => void) {
    setGenerating(true); setError('')
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onDone()
      await fetchAll(workspaceId)
    } finally { setGenerating(false) }
  }

  const carousel = carousels[0]
  const slides = carousel?.content_json?.slides || []
  const carouselTone = carousel?.content_json?.tone || 'professional'
  const carouselBusiness = carousel?.content_json?.businessName || ''
  const carouselTotal = carousel?.content_json?.totalSlides || slides.length
  const thumb = thumbnails[0]
  const post = posts[0]
  const story = stories[0]
  const ad = ads[0]
  const video = videos[0]
  const videoScenes = ((video?.content_json?.scenes as unknown[]) || []) as Record<string, unknown>[]
  const videoTone = (video?.content_json?.tone as string) || 'professional'
  const videoBusiness = (video?.content_json?.businessName as string) || ''
  const videoFmt = (video?.content_json?.format as string) || 'reel'
  const landing = landings[0]

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center text-white font-bold">🎨</div>
          <h1 className="text-2xl font-bold text-white">Creative Studio</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">AI-designed visual assets — approve in Approvals before publishing</p>
      </div>

      {error && (
        <div className="mb-5 bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Tab nav */}
      <div className="flex gap-1 mb-8 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB: Visual Carousel ────────────────────────────────────────────── */}
      {activeTab === 'carousel' && (
        <section>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-white font-semibold text-lg">Visual Carousel</h2>
              <p className="text-gray-500 text-xs mt-0.5">1080×1080px · Instagram-ready PNG slides · True carousel post</p>
            </div>
            <button onClick={() => generate('/api/agents/creative/carousel', { workspaceId }, () => {}, setGeneratingCarousel)}
              disabled={generatingCarousel || !workspaceId}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2">
              {generatingCarousel ? <Spinner /> : '✨ Generate Carousel'}
            </button>
          </div>

          {fetchingCarousel ? <Loading /> : !carousel ? (
            <Empty icon="🖼️" title="No visual carousel yet" hint={<>Generate carousel copy in <a href="/dashboard/assets" className="text-indigo-400">Assets</a> first</>} />
          ) : (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-3">
                <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
                  <img key={activeSlide} src={buildSlideUrl(slides[activeSlide], carouselTone, carouselBusiness, carouselTotal)} alt={`Slide ${activeSlide + 1}`} className="w-full aspect-square object-cover" />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {slides.map((slide, i) => (
                    <button key={i} onClick={() => setActiveSlide(i)}
                      className={`flex-none w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${activeSlide === i ? 'border-indigo-500' : 'border-gray-700 opacity-50 hover:opacity-80'}`}>
                      <img src={buildSlideUrl(slide, carouselTone, carouselBusiness, carouselTotal)} alt={slideLabel(slide)} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <button onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))} disabled={activeSlide === 0} className="text-gray-400 hover:text-white disabled:opacity-30">← Prev</button>
                  <span className="text-gray-600">{slideLabel(slides[activeSlide])} · {activeSlide + 1}/{slides.length}</span>
                  <button onClick={() => setActiveSlide(Math.min(slides.length - 1, activeSlide + 1))} disabled={activeSlide === slides.length - 1} className="text-gray-400 hover:text-white disabled:opacity-30">Next →</button>
                </div>
              </div>
              <div className="space-y-3">
                <StatusCard status={carousel.approval_status} notes={carousel.approval_notes} />
                <DownloadCard url={buildSlideUrl(slides[activeSlide], carouselTone, carouselBusiness, carouselTotal)} label="This Slide (PNG)" size="1080×1080px" />
                <a href="/dashboard/approvals" className="flex items-center justify-center w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">Review in Approvals →</a>
                <button onClick={() => generate('/api/agents/creative/carousel', { workspaceId }, () => {}, setGeneratingCarousel)} disabled={generatingCarousel} className="w-full border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white text-sm py-2.5 rounded-xl transition-colors">Regenerate</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── TAB: YouTube Thumbnail ──────────────────────────────────────────── */}
      {activeTab === 'thumbnail' && (
        <section>
          <div className="mb-5">
            <h2 className="text-white font-semibold text-lg">YouTube Thumbnail</h2>
            <p className="text-gray-500 text-xs mt-0.5">1280×720px · Optimised for click-through rate</p>
          </div>
          <div className="flex gap-3 mb-5">
            <input type="text" value={thumbTopic} onChange={e => setThumbTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate('/api/agents/creative/thumbnail', { workspaceId, topic: thumbTopic.trim() }, () => setThumbTopic(''), setGeneratingThumb)}
              placeholder="Enter video topic, e.g. 'How AI replaces a full marketing team'"
              className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
            <button onClick={() => generate('/api/agents/creative/thumbnail', { workspaceId, topic: thumbTopic.trim() }, () => setThumbTopic(''), setGeneratingThumb)}
              disabled={generatingThumb || !workspaceId || !thumbTopic.trim()}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap">
              {generatingThumb ? <Spinner /> : '▶ Generate'}
            </button>
          </div>

          {fetchingThumb ? <Loading /> : !thumb ? (
            <Empty icon="📺" title="No thumbnail yet" hint="Enter a video topic above and click Generate" />
          ) : (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-3">
                <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
                  <img src={buildThumbnailUrl(thumb.content_json)} alt="YouTube Thumbnail" className="w-full" style={{ aspectRatio: '16/9' }} />
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm grid grid-cols-2 gap-4">
                  <div><p className="text-gray-500 text-xs mb-1">Headline</p><p className="text-white font-bold">{thumb.content_json.headline}</p></div>
                  <div><p className="text-gray-500 text-xs mb-1">Subtext</p><p className="text-gray-300">{thumb.content_json.subtext}</p></div>
                  {thumb.content_json.accentNumber && <div><p className="text-gray-500 text-xs mb-1">Accent</p><p className="text-indigo-400 font-bold">{thumb.content_json.accentNumber} {thumb.content_json.accentWord}</p></div>}
                  <div><p className="text-gray-500 text-xs mb-1">Layout</p><p className="text-gray-300 capitalize">{thumb.content_json.layout}</p></div>
                </div>
              </div>
              <div className="space-y-3">
                <StatusCard status={thumb.approval_status} notes="" />
                <DownloadCard url={buildThumbnailUrl(thumb.content_json)} label="Thumbnail (PNG)" size="1280×720px" />
                <a href="/dashboard/approvals" className="flex items-center justify-center w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">Review in Approvals →</a>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── TAB: Static Post ───────────────────────────────────────────────── */}
      {activeTab === 'static' && (
        <section>
          <div className="mb-5">
            <h2 className="text-white font-semibold text-lg">Static Post Designer</h2>
            <p className="text-gray-500 text-xs mt-0.5">1080×1080px · Instagram & LinkedIn feed post</p>
          </div>
          <div className="flex gap-3 mb-5">
            <input type="text" value={postTopic} onChange={e => setPostTopic(e.target.value)}
              placeholder="e.g. 'Why most businesses fail at social media marketing'"
              className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
            <select value={postPlatform} onChange={e => setPostPlatform(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
            </select>
            <button onClick={() => generate('/api/agents/creative/static-post', { workspaceId, topic: postTopic.trim(), platform: postPlatform }, () => setPostTopic(''), setGeneratingPost)}
              disabled={generatingPost || !workspaceId || !postTopic.trim()}
              className="bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap">
              {generatingPost ? <Spinner /> : '✨ Generate'}
            </button>
          </div>

          {fetchingPost ? <Loading /> : !post ? (
            <Empty icon="📸" title="No static post yet" hint="Enter a topic and click Generate above" />
          ) : (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-3">
                <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
                  <img src={buildStaticPostUrl(post.content_json)} alt="Static Post" className="w-full aspect-square object-cover" />
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm grid grid-cols-2 gap-4">
                  <div><p className="text-gray-500 text-xs mb-1">Hook</p><p className="text-white font-bold">{post.content_json.hook as string}</p></div>
                  <div><p className="text-gray-500 text-xs mb-1">CTA</p><p className="text-indigo-400 font-bold">{post.content_json.cta as string}</p></div>
                  <div className="col-span-2"><p className="text-gray-500 text-xs mb-1">Body</p><p className="text-gray-300">{post.content_json.body as string}</p></div>
                  {(post.content_json.hashtags as string[])?.length > 0 && (
                    <div className="col-span-2"><p className="text-gray-500 text-xs mb-1">Hashtags</p><p className="text-indigo-500 text-xs">{(post.content_json.hashtags as string[]).map(h => `#${h}`).join(' ')}</p></div>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <StatusCard status={post.approval_status} notes="" />
                <DownloadCard url={buildStaticPostUrl(post.content_json)} label="Post Image (PNG)" size="1080×1080px" />
                <a href="/dashboard/approvals" className="flex items-center justify-center w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">Review in Approvals →</a>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── TAB: Story Cover ────────────────────────────────────────────────── */}
      {activeTab === 'story' && (
        <section>
          <div className="mb-5">
            <h2 className="text-white font-semibold text-lg">Story & Reel Cover</h2>
            <p className="text-gray-500 text-xs mt-0.5">1080×1920px · Instagram Stories, Reels, Facebook Stories, YouTube Shorts</p>
          </div>
          <div className="flex gap-3 mb-5">
            <input type="text" value={storyTopic} onChange={e => setStoryTopic(e.target.value)}
              placeholder="e.g. '3 tips to double your Instagram reach this week'"
              className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
            <select value={storyPlatform} onChange={e => setStoryPlatform(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="youtube_shorts">YouTube Shorts</option>
            </select>
            <button onClick={() => generate('/api/agents/creative/story-cover', { workspaceId, topic: storyTopic.trim(), platform: storyPlatform }, () => setStoryTopic(''), setGeneratingStory)}
              disabled={generatingStory || !workspaceId || !storyTopic.trim()}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap">
              {generatingStory ? <Spinner /> : '✨ Generate'}
            </button>
          </div>

          {fetchingStory ? <Loading /> : !story ? (
            <Empty icon="📱" title="No story cover yet" hint="Enter a topic and click Generate above" />
          ) : (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 flex justify-center">
                <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800" style={{ maxWidth: 300 }}>
                  <img src={buildStoryUrl(story.content_json)} alt="Story Cover" className="w-full" style={{ aspectRatio: '9/16' }} />
                </div>
              </div>
              <div className="space-y-3">
                <StatusCard status={story.approval_status} notes="" />
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm space-y-3">
                  <div><p className="text-gray-500 text-xs mb-1">Hook</p><p className="text-white font-bold">{story.content_json.hook as string}</p></div>
                  <div><p className="text-gray-500 text-xs mb-1">Subtext</p><p className="text-gray-300">{story.content_json.subtext as string}</p></div>
                  <div><p className="text-gray-500 text-xs mb-1">CTA</p><p className="text-indigo-400">{story.content_json.cta as string}</p></div>
                  <div><p className="text-gray-500 text-xs mb-1">Label badge</p><p className="text-white font-bold uppercase">{story.content_json.label as string}</p></div>
                </div>
                <DownloadCard url={buildStoryUrl(story.content_json)} label="Story Cover (PNG)" size="1080×1920px" />
                <a href="/dashboard/approvals" className="flex items-center justify-center w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">Review in Approvals →</a>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── TAB: Ad Creative ────────────────────────────────────────────────── */}
      {activeTab === 'ad' && (
        <section>
          <div className="mb-5">
            <h2 className="text-white font-semibold text-lg">Ad Creative Pack</h2>
            <p className="text-gray-500 text-xs mt-0.5">All ad sizes — Square, Landscape, Story, Leaderboard — from one generate</p>
          </div>
          <div className="flex gap-3 mb-5">
            <input type="text" value={adTopic} onChange={e => setAdTopic(e.target.value)}
              placeholder="e.g. 'Offer: Free 30-min strategy session for e-commerce brands'"
              className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
            <select value={adPlatform} onChange={e => setAdPlatform(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="google">Google</option>
              <option value="linkedin">LinkedIn</option>
            </select>
            <button onClick={() => generate('/api/agents/creative/ad-creative', { workspaceId, topic: adTopic.trim(), platform: adPlatform, sizes: ['square', 'landscape', 'story', 'leaderboard'] }, () => setAdTopic(''), setGeneratingAd)}
              disabled={generatingAd || !workspaceId || !adTopic.trim()}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap">
              {generatingAd ? <Spinner /> : '✨ Generate Ads'}
            </button>
          </div>

          {fetchingAd ? <Loading /> : !ad ? (
            <Empty icon="📢" title="No ad creative yet" hint="Enter your offer/topic and click Generate Ads" />
          ) : (
            <div className="space-y-6">
              {/* Size selector */}
              <div className="flex gap-2">
                {[
                  { id: 'square', label: '1:1 Feed', dim: '1080×1080' },
                  { id: 'landscape', label: '1.91:1 Banner', dim: '1200×628' },
                  { id: 'story', label: '9:16 Story', dim: '1080×1920' },
                  { id: 'leaderboard', label: '728×90 Banner', dim: '728×90' },
                ].map(s => (
                  <button key={s.id} onClick={() => setAdSize(s.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${adSize === s.id ? 'bg-amber-600 text-white' : 'border border-gray-700 text-gray-400 hover:text-white'}`}>
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2">
                  <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
                    {adSize === 'leaderboard' ? (
                      <img src={buildAdUrl(ad.content_json, adSize)} alt="Ad Creative" className="w-full" />
                    ) : adSize === 'story' ? (
                      <div className="flex justify-center p-4">
                        <img src={buildAdUrl(ad.content_json, adSize)} alt="Ad Creative" className="w-48" style={{ aspectRatio: '9/16' }} />
                      </div>
                    ) : (
                      <img src={buildAdUrl(ad.content_json, adSize)} alt="Ad Creative" className="w-full" style={{ aspectRatio: adSize === 'landscape' ? '1.91/1' : '1/1' }} />
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <StatusCard status={ad.approval_status} notes="" />
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm space-y-3">
                    <div><p className="text-gray-500 text-xs mb-1">Headline</p><p className="text-white font-bold">{ad.content_json.headline as string}</p></div>
                    <div><p className="text-gray-500 text-xs mb-1">Offer badge</p><p className="text-amber-400 font-bold">{ad.content_json.offer as string}</p></div>
                    <div><p className="text-gray-500 text-xs mb-1">CTA</p><p className="text-indigo-400">{ad.content_json.cta as string}</p></div>
                  </div>
                  <DownloadCard url={buildAdUrl(ad.content_json, adSize)} label={`Ad PNG (${adSize})`} size="" />
                  <a href="/dashboard/approvals" className="flex items-center justify-center w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">Review in Approvals →</a>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── TAB: Video Generator ─────────────────────────────────────────────── */}
      {activeTab === 'video' && (
        <section>
          <div className="mb-5">
            <h2 className="text-white font-semibold text-lg">Video Generator</h2>
            <p className="text-gray-500 text-xs mt-0.5">Scene-by-scene storyboard · Pulls from Content + Strategy supervisors · Runway-ready briefs</p>
          </div>

          {/* Format + topic input */}
          <div className="flex gap-3 mb-5 flex-wrap">
            <select value={videoFormat} onChange={e => { setVideoFormat(e.target.value); setActiveScene(0) }}
              className="px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
              {VIDEO_FORMATS.map(f => (
                <option key={f.id} value={f.id}>{f.label} ({f.aspect}, max {f.max})</option>
              ))}
            </select>
            <input type="text" value={videoTopic} onChange={e => setVideoTopic(e.target.value)}
              placeholder="Optional: specific topic (leave blank to use your Reel Script)"
              className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
            <button onClick={() => generate('/api/agents/creative/video-generator', { workspaceId, format: videoFormat, topic: videoTopic.trim() || undefined }, () => { setVideoTopic(''); setActiveScene(0) }, setGeneratingVideo)}
              disabled={generatingVideo || !workspaceId}
              className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap">
              {generatingVideo ? <Spinner /> : '🎬 Generate Storyboard'}
            </button>
          </div>

          {/* Cross-supervisor info banner */}
          <div className="bg-indigo-900/20 border border-indigo-800/40 rounded-xl p-3 mb-5 flex gap-3">
            <span className="text-indigo-400 text-sm">🔗</span>
            <p className="text-indigo-300 text-xs">Automatically pulls your <strong>Reel Script</strong> (Content Supervisor), <strong>Strategy</strong> (Strategy Supervisor), and <strong>Content Calendar themes</strong> to generate aligned video content.</p>
          </div>

          {fetchingVideo ? <Loading /> : !video ? (
            <Empty icon="🎬" title="No video brief yet" hint="Select a format and click Generate — or generate a Reel Script in Assets first for richer output" />
          ) : (
            <div className="space-y-5">
              {/* Video metadata */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><p className="text-gray-500 text-xs mb-1">Title</p><p className="text-white font-bold">{video.content_json.title as string}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Format</p><p className="text-indigo-400 font-bold uppercase">{videoFmt}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Duration</p><p className="text-white">{video.content_json.totalDuration as string}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Music</p><p className="text-gray-300 text-xs">{video.content_json.musicStyle as string}</p></div>
                <div className="col-span-2"><p className="text-gray-500 text-xs mb-1">Hook (first 3 seconds)</p><p className="text-white font-semibold italic">"{video.content_json.hook as string}"</p></div>
                <div className="col-span-2"><p className="text-gray-500 text-xs mb-1">Color Grading</p><p className="text-gray-300">{video.content_json.colorGrading as string}</p></div>
                {!!video.content_json.pulledFrom && (
                  <div className="col-span-4 flex gap-2 flex-wrap">
                    {!!(video.content_json.pulledFrom as Record<string, boolean>).strategy && <span className="text-xs bg-indigo-900/40 text-indigo-400 px-2 py-1 rounded">✓ Strategy</span>}
                    {!!(video.content_json.pulledFrom as Record<string, boolean>).reelScript && <span className="text-xs bg-green-900/40 text-green-400 px-2 py-1 rounded">✓ Reel Script</span>}
                    {!!(video.content_json.pulledFrom as Record<string, boolean>).contentCalendar && <span className="text-xs bg-amber-900/40 text-amber-400 px-2 py-1 rounded">✓ Content Calendar</span>}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold text-sm">Storyboard — {videoScenes.length} scenes</h3>
                  <div className="flex gap-1">
                    {videoScenes.map((_, i) => (
                      <button key={i} onClick={() => setActiveScene(i)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${activeScene === i ? 'bg-rose-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-5">
                  <div className="col-span-2">
                    {videoScenes[activeScene] && (
                      <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
                        <img
                          key={activeScene}
                          src={buildVideoFrameUrl(videoScenes[activeScene], videoFmt, videoTone, videoBusiness, videoScenes.length)}
                          alt={`Scene ${activeScene + 1}`}
                          className="w-full"
                          style={{ aspectRatio: videoFmt === 'youtube' ? '16/9' : videoFmt === 'reel' || videoFmt === 'story' || videoFmt === 'short' ? '9/16' : '1/1', maxHeight: 480, objectFit: 'cover' }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <StatusCard status={video.approval_status} notes="" />
                    {videoScenes[activeScene] && (
                      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm space-y-3">
                        <div><p className="text-gray-500 text-xs mb-1">Shot type</p><p className="text-white font-bold capitalize">{videoScenes[activeScene].shotType as string}</p></div>
                        <div><p className="text-gray-500 text-xs mb-1">Visual</p><p className="text-gray-300 text-xs leading-relaxed">{videoScenes[activeScene].visual as string}</p></div>
                        <div><p className="text-gray-500 text-xs mb-1">Script</p><p className="text-indigo-300 text-xs italic">"{videoScenes[activeScene].script as string}"</p></div>
                        <div className="flex gap-3">
                          <div><p className="text-gray-500 text-xs mb-1">Duration</p><p className="text-white text-xs">{videoScenes[activeScene].duration as string}</p></div>
                          <div><p className="text-gray-500 text-xs mb-1">Transition</p><p className="text-white text-xs">{(videoScenes[activeScene].transition as string) || 'cut'}</p></div>
                        </div>
                      </div>
                    )}
                    <DownloadCard url={buildVideoFrameUrl(videoScenes[activeScene] || {}, videoFmt, videoTone, videoBusiness, videoScenes.length)} label={`Scene ${activeScene + 1} Frame`} size="" />
                    <a href="/dashboard/approvals" className="flex items-center justify-center w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">Review in Approvals →</a>
                  </div>
                </div>
              </div>

              {/* Caption */}
              {video.content_json.postCaption && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Post Caption</p>
                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{video.content_json.postCaption as string}</p>
                  {(video.content_json.hashtags as string[])?.length > 0 && (
                    <p className="text-indigo-500 text-xs mt-2">{(video.content_json.hashtags as string[]).map(h => `#${h}`).join(' ')}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── TAB: Landing Page Visuals ────────────────────────────────────────── */}
      {activeTab === 'landing' && (
        <section>
          <div className="mb-5">
            <h2 className="text-white font-semibold text-lg">Landing Page Visuals</h2>
            <p className="text-gray-500 text-xs mt-0.5">Full visual pack — Hero, Features, Stats bar, CTA banner · Pulls from Strategy + Funnel + Lead Gen supervisors</p>
          </div>

          <div className="flex gap-3 mb-5">
            <select value={landingType} onChange={e => setLandingType(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
              {LANDING_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button onClick={() => generate('/api/agents/creative/landing-visual', { workspaceId, pageType: landingType }, () => {}, setGeneratingLanding)}
              disabled={generatingLanding || !workspaceId}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2">
              {generatingLanding ? <Spinner /> : '🏠 Generate Visual Pack'}
            </button>
          </div>

          {/* Cross-supervisor info */}
          <div className="bg-indigo-900/20 border border-indigo-800/40 rounded-xl p-3 mb-5 flex gap-3">
            <span className="text-indigo-400 text-sm">🔗</span>
            <p className="text-indigo-300 text-xs">Automatically pulls your <strong>Marketing Strategy</strong>, <strong>Funnel Plan</strong>, and <strong>Lead Gen Plan</strong> to write high-converting landing page copy and visuals.</p>
          </div>

          {fetchingLanding ? <Loading /> : !landing ? (
            <Empty icon="🏠" title="No landing page yet" hint="Select a page type and click Generate — generates Hero, Features, Stats, and CTA sections" />
          ) : (
            <div className="space-y-5">
              {/* Metadata */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-gray-500 text-xs mb-1">Page Name</p><p className="text-white font-bold">{landing.content_json.pageName as string}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">SEO Title</p><p className="text-gray-300 text-xs">{landing.content_json.seoTitle as string}</p></div>
                <div className="col-span-2"><p className="text-gray-500 text-xs mb-1">Meta Description</p><p className="text-gray-400 text-xs">{landing.content_json.seoDescription as string}</p></div>
                {!!landing.content_json.pulledFrom && (
                  <div className="col-span-2 flex gap-2 flex-wrap">
                    {!!(landing.content_json.pulledFrom as Record<string, boolean>).strategy && <span className="text-xs bg-indigo-900/40 text-indigo-400 px-2 py-1 rounded">✓ Strategy</span>}
                    {!!(landing.content_json.pulledFrom as Record<string, boolean>).funnelPlan && <span className="text-xs bg-purple-900/40 text-purple-400 px-2 py-1 rounded">✓ Funnel Plan</span>}
                    {!!(landing.content_json.pulledFrom as Record<string, boolean>).leadGenPlan && <span className="text-xs bg-amber-900/40 text-amber-400 px-2 py-1 rounded">✓ Lead Gen Plan</span>}
                  </div>
                )}
              </div>

              {/* Section switcher */}
              <div className="flex gap-2">
                {[
                  { id: 'hero', label: 'Hero (1200×630)' },
                  { id: 'feature', label: 'Features (1200×500)' },
                  { id: 'stats', label: 'Stats (1200×280)' },
                  { id: 'cta', label: 'CTA Banner (1200×400)' },
                ].map(s => (
                  <button key={s.id} onClick={() => setLandingSection(s.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${landingSection === s.id ? 'bg-emerald-600 text-white' : 'border border-gray-700 text-gray-400 hover:text-white'}`}>
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-5">
                <div className="col-span-2">
                  <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
                    {landingSection === 'hero' && (
                      <img src={buildLandingHeroUrl(landing.content_json)} alt="Hero section" className="w-full" style={{ aspectRatio: '1200/630' }} />
                    )}
                    {landingSection !== 'hero' && landingSection !== 'og' && (
                      <img src={buildLandingSection(landing.content_json, landingSection)} alt={`${landingSection} section`} className="w-full" />
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <StatusCard status={landing.approval_status} notes="" />
                  <DownloadCard
                    url={landingSection === 'hero' ? buildLandingHeroUrl(landing.content_json) : buildLandingSection(landing.content_json, landingSection)}
                    label={`${landingSection} PNG`} size=""
                  />
                  <a href="/dashboard/approvals" className="flex items-center justify-center w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">Review in Approvals →</a>
                  <button onClick={() => generate('/api/agents/creative/landing-visual', { workspaceId, pageType: landingType }, () => {}, setGeneratingLanding)} disabled={generatingLanding}
                    className="w-full border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white text-sm py-2.5 rounded-xl transition-colors">Regenerate</button>
                </div>
              </div>

              {/* Hero copy preview */}
              {landing.content_json.hero && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><p className="text-gray-500 text-xs mb-1">H1 Headline</p><p className="text-white font-bold">{((landing.content_json.hero as Record<string, string>).headline)}</p></div>
                  <div><p className="text-gray-500 text-xs mb-1">CTA Button</p><p className="text-emerald-400 font-bold">{((landing.content_json.hero as Record<string, string>).cta)}</p></div>
                  <div className="col-span-2"><p className="text-gray-500 text-xs mb-1">Subheadline</p><p className="text-gray-300">{((landing.content_json.hero as Record<string, string>).sub)}</p></div>
                  <div><p className="text-gray-500 text-xs mb-1">OG Card Headline</p><p className="text-gray-300 text-xs">{landing.content_json.ogHeadline as string}</p></div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── TAB: Agent Requests ─────────────────────────────────────────────── */}
      {activeTab === 'requests' && (
        <section>
          <div className="mb-5">
            <h2 className="text-white font-semibold text-lg">Agent Requests</h2>
            <p className="text-gray-500 text-xs mt-0.5">Creative assets requested by Campaign, Growth, Content, Funnel, and Lead Gen agents</p>
          </div>

          <div className="bg-indigo-900/20 border border-indigo-800/40 rounded-xl p-3 mb-5 flex gap-3">
            <span className="text-indigo-400">🤖</span>
            <p className="text-indigo-300 text-xs">
              When you generate a campaign, growth plan, or content calendar, the AI automatically requests creatives here.
              All generated assets go to <a href="/dashboard/approvals" className="underline">Approvals</a> — nothing is published until you approve.
            </p>
          </div>

          {fetchingRequests ? <Loading /> : agentRequests.length === 0 ? (
            <div className="border border-dashed border-gray-700 rounded-2xl p-12 text-center">
              <div className="text-4xl mb-3">🔗</div>
              <p className="text-white font-medium mb-1">No agent requests yet</p>
              <p className="text-gray-500 text-sm">Generate a Campaign, Growth Plan, or Content Calendar to see creative requests appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Summary bar */}
              <div className="flex gap-4 mb-4">
                {(['completed', 'in_progress', 'failed'] as const).map(s => {
                  const count = agentRequests.filter(r => r.status === s).length
                  if (!count) return null
                  const styles: Record<string, string> = {
                    completed: 'bg-green-900/30 text-green-400 border-green-800/40',
                    in_progress: 'bg-amber-900/30 text-amber-400 border-amber-800/40',
                    failed: 'bg-red-900/30 text-red-400 border-red-800/40',
                  }
                  const labels: Record<string, string> = { completed: '✅ Completed', in_progress: '⏳ In Progress', failed: '❌ Failed' }
                  return (
                    <div key={s} className={`border rounded-lg px-4 py-2 text-sm font-medium ${styles[s]}`}>
                      {count} {labels[s]}
                    </div>
                  )
                })}
              </div>

              {/* Request rows */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs px-4 py-3 font-medium">Requesting Agent</th>
                      <th className="text-left text-gray-500 text-xs px-4 py-3 font-medium">Creative Type</th>
                      <th className="text-left text-gray-500 text-xs px-4 py-3 font-medium">Context</th>
                      <th className="text-left text-gray-500 text-xs px-4 py-3 font-medium">Status</th>
                      <th className="text-left text-gray-500 text-xs px-4 py-3 font-medium">Artifact</th>
                      <th className="text-left text-gray-500 text-xs px-4 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentRequests.map((req) => {
                      const ctx = (req.context_json as Record<string, unknown>) || {}
                      const contextSummary = (ctx.topic as string) || (ctx.hook as string) || (ctx.pageType as string) || (ctx.pillar as string) || '—'
                      const status = req.status as string
                      const statusStyles: Record<string, string> = {
                        completed: 'bg-green-900/40 text-green-400',
                        in_progress: 'bg-amber-900/40 text-amber-400',
                        failed: 'bg-red-900/40 text-red-400',
                        pending: 'bg-gray-800 text-gray-400',
                      }
                      const agentLabels: Record<string, string> = {
                        campaign: '📣 Campaign',
                        growth_engine: '📈 Growth',
                        content_intelligence: '📅 Content',
                        lead_funnel: '🎯 Lead Funnel',
                        funnel: '🔮 Funnel',
                      }
                      const typeLabels: Record<string, string> = {
                        visual_post: 'Static Post',
                        visual_story: 'Story Cover',
                        visual_ad: 'Ad Creative',
                        video_brief: 'Video Brief',
                        landing_visual_pack: 'Landing Pack',
                        visual_carousel: 'Carousel',
                        youtube_thumbnail: 'YT Thumbnail',
                      }
                      const createdAt = new Date(req.created_at as string).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      return (
                        <tr key={req.id as string} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-300">
                            {agentLabels[req.requesting_agent as string] || (req.requesting_agent as string)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-indigo-900/30 text-indigo-300 px-2 py-0.5 rounded">
                              {typeLabels[req.creative_type as string] || (req.creative_type as string)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px] truncate" title={contextSummary}>
                            {contextSummary.slice(0, 50)}{contextSummary.length > 50 ? '…' : ''}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyles[status] || statusStyles.pending}`}>
                              {status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {req.artifact_id ? (
                              <a href="/dashboard/approvals" className="text-indigo-400 hover:underline">
                                {(req.artifact_title as string) || 'View →'}
                              </a>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{createdAt}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Coming soon workers ──────────────────────────────────────────────── */}
      <div className="mt-12 pt-8 border-t border-gray-800">
        <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-4">Advanced Workers — Coming Soon</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: '🎭', label: 'A/B Creative Variants', desc: 'Auto-generate 3 variants per creative for split testing' },
            { icon: '🎥', label: 'Runway AI Video', desc: 'Send storyboard to Runway Gen-3 to render actual video clips' },
            { icon: '📊', label: 'Performance Analytics', desc: 'Track which creatives drive the most clicks, saves, and conversions' },
          ].map(item => (
            <div key={item.label} className="border border-gray-800 rounded-xl p-5 opacity-40 hover:opacity-60 transition-opacity">
              <div className="text-2xl mb-2">{item.icon}</div>
              <h3 className="text-white font-medium text-sm mb-1">{item.label}</h3>
              <p className="text-gray-500 text-xs leading-relaxed">{item.desc}</p>
              <div className="mt-3 text-xs text-indigo-400 font-semibold">Coming soon</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Small reusable components ─────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

function Loading() {
  return <div className="border border-gray-800 rounded-2xl p-12 text-center text-gray-600 text-sm animate-pulse">Loading...</div>
}

function Empty({ icon, title, hint }: { icon: string; title: string; hint: React.ReactNode }) {
  return (
    <div className="border border-dashed border-gray-700 rounded-2xl p-12 text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-white font-medium mb-1">{title}</p>
      <p className="text-gray-500 text-sm">{hint}</p>
    </div>
  )
}

function StatusCard({ status, notes }: { status: string; notes: string }) {
  const s = status || 'pending'
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Status</p>
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${STATUS_STYLES[s] || STATUS_STYLES.pending}`}>
        {s === 'approved' ? '✅' : s === 'rejected' ? '❌' : '⏳'} <span className="capitalize">{s}</span>
      </div>
      {notes && <p className="text-gray-400 text-xs mt-3 pt-3 border-t border-gray-800">{notes}</p>}
    </div>
  )
}

function DownloadCard({ url, label, size }: { url: string; label: string; size: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Download</p>
      <a href={url} download target="_blank" rel="noopener noreferrer"
        className="block w-full text-center bg-gray-800 hover:bg-gray-700 text-white text-sm py-2 rounded-lg transition-colors mb-1">↓ {label}</a>
      {size && <p className="text-gray-600 text-xs text-center">{size}</p>}
    </div>
  )
}
