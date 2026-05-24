import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const PALETTES: Record<string, { primary: string; accent: string; bg: string }> = {
  professional: { primary: '#4f46e5', accent: '#818cf8', bg: '#0f0f0f' },
  energetic:    { primary: '#f59e0b', accent: '#fbbf24', bg: '#0f0f0f' },
  friendly:     { primary: '#10b981', accent: '#34d399', bg: '#0f0f0f' },
  luxury:       { primary: '#9333ea', accent: '#c084fc', bg: '#0f0f0f' },
  bold:         { primary: '#ef4444', accent: '#f87171', bg: '#0f0f0f' },
}

function getPalette(tone: string) {
  const t = (tone || '').toLowerCase()
  if (t.includes('luxury') || t.includes('premium') || t.includes('elegant')) return PALETTES.luxury
  if (t.includes('bold') || t.includes('powerful')) return PALETTES.bold
  if (t.includes('friend') || t.includes('warm') || t.includes('casual')) return PALETTES.friendly
  if (t.includes('energe') || t.includes('excit') || t.includes('dynamic')) return PALETTES.energetic
  return PALETTES.professional
}

const SIZE = 1080

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tone = searchParams.get('tone') || 'professional'
  const business = (searchParams.get('business') || '').slice(0, 40)
  const hook = (searchParams.get('hook') || '').slice(0, 120)
  const body = (searchParams.get('body') || '').slice(0, 200)
  const cta = (searchParams.get('cta') || '').slice(0, 80)
  const platform = searchParams.get('platform') || 'instagram'

  const { primary, accent, bg } = getPalette(tone)
  const isLinkedIn = platform === 'linkedin'

  return new ImageResponse(
    <div style={{
      width: SIZE, height: SIZE,
      background: isLinkedIn ? '#1a1a2e' : bg,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '80px 80px 70px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, background: primary, display: 'flex' }} />

      {/* Background glow circle */}
      <div style={{
        position: 'absolute', bottom: -200, right: -200,
        width: 600, height: 600, borderRadius: '50%',
        background: primary, opacity: 0.06, display: 'flex',
      }} />
      <div style={{
        position: 'absolute', top: -150, left: -150,
        width: 400, height: 400, borderRadius: '50%',
        background: accent, opacity: 0.04, display: 'flex',
      }} />

      {/* Business badge - top */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          background: primary, color: '#fff',
          padding: '8px 22px', borderRadius: 24,
          fontSize: 20, fontWeight: 700, display: 'flex',
        }}>
          {business}
        </div>
        {isLinkedIn && (
          <div style={{ color: '#0a66c2', fontSize: 28, fontWeight: 900, display: 'flex' }}>in</div>
        )}
      </div>

      {/* Main content - center */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', padding: '40px 0' }}>
        {/* Accent divider */}
        <div style={{ width: 56, height: 5, background: primary, borderRadius: 3, marginBottom: 36, display: 'flex' }} />

        {/* Hook - main headline */}
        <div style={{
          fontSize: hook.length > 70 ? 52 : hook.length > 40 ? 62 : 72,
          fontWeight: 900, color: '#ffffff',
          lineHeight: 1.15, display: 'flex',
          flexWrap: 'wrap', marginBottom: 32,
          letterSpacing: '-0.02em',
        }}>
          {hook}
        </div>

        {/* Body */}
        {body && (
          <div style={{
            fontSize: 28, color: '#9ca3af',
            lineHeight: 1.6, display: 'flex',
            flexWrap: 'wrap',
          }}>
            {body}
          </div>
        )}
      </div>

      {/* CTA - bottom */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          background: primary, color: '#fff',
          padding: '14px 32px', borderRadius: 14,
          fontSize: 22, fontWeight: 700,
          display: 'flex', letterSpacing: '0.01em',
        }}>
          {cta || 'Learn More →'}
        </div>
        <div style={{ color: '#374151', fontSize: 18, display: 'flex' }}>
          {platform === 'instagram' ? '#marketing' : '#B2B #growth'}
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: accent, opacity: 0.3, display: 'flex' }} />
    </div>,
    { width: SIZE, height: SIZE }
  )
}
