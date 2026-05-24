import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const PALETTES: Record<string, { primary: string; accent: string; bg: string; card: string }> = {
  professional: { primary: '#4f46e5', accent: '#818cf8', bg: '#0f0f0f', card: '#1a1a2e' },
  energetic:    { primary: '#f59e0b', accent: '#fbbf24', bg: '#0f0f0f', card: '#1c1600' },
  friendly:     { primary: '#10b981', accent: '#34d399', bg: '#0f0f0f', card: '#001a0f' },
  luxury:       { primary: '#9333ea', accent: '#c084fc', bg: '#0f0f0f', card: '#130020' },
  bold:         { primary: '#ef4444', accent: '#f87171', bg: '#0f0f0f', card: '#1a0000' },
}

function getPalette(tone: string) {
  const t = (tone || '').toLowerCase()
  if (t.includes('luxury') || t.includes('premium') || t.includes('elegant') || t.includes('sophisticated')) return PALETTES.luxury
  if (t.includes('bold') || t.includes('aggressive') || t.includes('urgent') || t.includes('powerful')) return PALETTES.bold
  if (t.includes('friend') || t.includes('warm') || t.includes('casual') || t.includes('approachable')) return PALETTES.friendly
  if (t.includes('energe') || t.includes('excit') || t.includes('dynamic') || t.includes('vibrant')) return PALETTES.energetic
  return PALETTES.professional
}

const SIZE = 1080

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'slide'
  const tone = searchParams.get('tone') || 'professional'
  const business = (searchParams.get('business') || '').slice(0, 40)
  const { primary, accent, bg } = getPalette(tone)

  if (type === 'cover') {
    const title = (searchParams.get('title') || '').slice(0, 100)
    const coverText = (searchParams.get('coverText') || '').slice(0, 150)

    return new ImageResponse(
      <div
        style={{
          width: SIZE, height: SIZE, background: bg,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 90, position: 'relative',
        }}
      >
        {/* Top accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, background: primary, display: 'flex' }} />

        {/* Decorative background circle */}
        <div style={{
          position: 'absolute', bottom: -120, right: -120,
          width: 500, height: 500, borderRadius: '50%',
          background: primary, opacity: 0.06, display: 'flex',
        }} />

        {/* Business name badge */}
        <div style={{
          background: primary, color: '#fff',
          padding: '10px 28px', borderRadius: 28,
          fontSize: 22, fontWeight: 700, marginBottom: 52,
          display: 'flex', letterSpacing: '0.02em',
        }}>
          {business}
        </div>

        {/* Title */}
        <div style={{
          fontSize: title.length > 50 ? 60 : 72,
          fontWeight: 800, color: '#ffffff',
          textAlign: 'center', lineHeight: 1.1,
          marginBottom: 36, display: 'flex',
          flexWrap: 'wrap', justifyContent: 'center',
        }}>
          {title}
        </div>

        {/* Divider */}
        <div style={{
          width: 64, height: 4, background: accent,
          borderRadius: 2, marginBottom: 36, display: 'flex',
        }} />

        {/* Cover subtitle */}
        <div style={{
          fontSize: 28, color: accent,
          textAlign: 'center', lineHeight: 1.4,
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
        }}>
          {coverText}
        </div>

        {/* Swipe cue */}
        <div style={{
          position: 'absolute', bottom: 44, right: 64,
          color: '#374151', fontSize: 20,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          Swipe →
        </div>

        {/* Bottom accent */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: accent, opacity: 0.3, display: 'flex' }} />
      </div>,
      { width: SIZE, height: SIZE }
    )
  }

  if (type === 'cta') {
    const cta = (searchParams.get('cta') || '').slice(0, 100)

    return new ImageResponse(
      <div
        style={{
          width: SIZE, height: SIZE, background: bg,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 90, position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, background: primary, display: 'flex' }} />

        {/* Decorative bg */}
        <div style={{
          position: 'absolute', top: -80, left: -80,
          width: 400, height: 400, borderRadius: '50%',
          background: primary, opacity: 0.07, display: 'flex',
        }} />

        <div style={{ fontSize: 28, fontWeight: 600, color: '#6b7280', marginBottom: 32, display: 'flex' }}>
          Ready to take the next step?
        </div>

        {/* CTA button */}
        <div style={{
          background: primary, color: '#fff',
          padding: '28px 72px', borderRadius: 20,
          fontSize: 38, fontWeight: 800,
          textAlign: 'center', display: 'flex',
          marginBottom: 52, letterSpacing: '-0.01em',
        }}>
          {cta}
        </div>

        {/* Divider */}
        <div style={{ width: 64, height: 4, background: accent, borderRadius: 2, marginBottom: 32, display: 'flex' }} />

        <div style={{ color: accent, fontSize: 24, fontWeight: 700, display: 'flex', letterSpacing: '0.04em' }}>
          {business.toUpperCase()}
        </div>

        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: primary, display: 'flex' }} />
      </div>,
      { width: SIZE, height: SIZE }
    )
  }

  // Content slide
  const headline = (searchParams.get('headline') || '').slice(0, 80)
  const body = (searchParams.get('body') || '').slice(0, 220)
  const slideNum = searchParams.get('slideNum') || '1'
  const totalSlides = searchParams.get('total') || '8'

  return new ImageResponse(
    <div
      style={{
        width: SIZE, height: SIZE, background: bg,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '80px 90px',
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, background: primary, display: 'flex' }} />

      {/* Slide number badge */}
      <div style={{
        position: 'absolute', top: 40, left: 60,
        width: 56, height: 56,
        background: primary, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 24, fontWeight: 800,
      }}>
        {slideNum}
      </div>

      {/* Decorative right accent */}
      <div style={{
        position: 'absolute', right: 0, top: 200, bottom: 200,
        width: 6, background: primary, opacity: 0.3,
        borderRadius: '3px 0 0 3px', display: 'flex',
      }} />

      {/* Headline */}
      <div style={{
        fontSize: headline.length > 50 ? 52 : 62,
        fontWeight: 800, color: '#ffffff',
        lineHeight: 1.15, marginBottom: 44,
        display: 'flex', flexWrap: 'wrap',
      }}>
        {headline}
      </div>

      {/* Divider */}
      <div style={{ width: 56, height: 4, background: accent, borderRadius: 2, marginBottom: 36, display: 'flex' }} />

      {/* Body */}
      <div style={{
        fontSize: 30, color: '#d1d5db',
        lineHeight: 1.65, display: 'flex', flexWrap: 'wrap',
      }}>
        {body}
      </div>

      {/* Footer: brand + page counter */}
      <div style={{
        position: 'absolute', bottom: 40, left: 60, right: 60,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ color: accent, fontSize: 20, fontWeight: 600, display: 'flex' }}>
          {business}
        </div>
        <div style={{ color: '#374151', fontSize: 18, display: 'flex' }}>
          {slideNum} / {totalSlides}
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: accent, opacity: 0.2, display: 'flex' }} />
    </div>,
    { width: SIZE, height: SIZE }
  )
}
