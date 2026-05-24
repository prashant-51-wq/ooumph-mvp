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

// Ad sizes supported
const SIZES: Record<string, { w: number; h: number; label: string }> = {
  square:    { w: 1080, h: 1080, label: '1:1' },       // Feed / Facebook
  landscape: { w: 1200, h: 628,  label: '1.91:1' },    // Facebook/Google banner
  story:     { w: 1080, h: 1920, label: '9:16' },      // Story / Reel
  leaderboard: { w: 728, h: 90,  label: '728×90' },    // Google leaderboard
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tone      = searchParams.get('tone') || 'professional'
  const business  = (searchParams.get('business') || '').slice(0, 40)
  const headline  = (searchParams.get('headline') || '').slice(0, 80)
  const subtext   = (searchParams.get('subtext') || '').slice(0, 120)
  const cta       = (searchParams.get('cta') || 'Get Started').slice(0, 50)
  const offer     = (searchParams.get('offer') || '').slice(0, 60)
  const size      = searchParams.get('size') || 'square'

  const { primary, accent, bg } = getPalette(tone)
  const dim = SIZES[size] || SIZES.square
  const W = dim.w
  const H = dim.h

  // Leaderboard — ultra-horizontal compact layout
  if (size === 'leaderboard') {
    return new ImageResponse(
      <div style={{
        width: W, height: H,
        background: bg, display: 'flex',
        alignItems: 'center', padding: '0 24px',
        gap: 24, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: primary, display: 'flex' }} />
        <div style={{
          background: primary, color: '#fff', padding: '6px 16px',
          borderRadius: 6, fontSize: 14, fontWeight: 800, display: 'flex', whiteSpace: 'nowrap',
        }}>{business}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', display: 'flex', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {headline}
        </div>
        {offer && (
          <div style={{ color: accent, fontSize: 15, fontWeight: 700, display: 'flex', whiteSpace: 'nowrap' }}>
            {offer}
          </div>
        )}
        <div style={{
          background: primary, color: '#fff', padding: '8px 22px',
          borderRadius: 8, fontSize: 15, fontWeight: 800, display: 'flex', whiteSpace: 'nowrap',
        }}>{cta}</div>
      </div>,
      { width: W, height: H }
    )
  }

  // Landscape (Facebook/Google banner) — horizontal split layout
  if (size === 'landscape') {
    const panelW = Math.round(W * 0.42)
    return new ImageResponse(
      <div style={{
        width: W, height: H,
        background: bg, display: 'flex',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Left color panel */}
        <div style={{
          width: panelW, height: H,
          background: primary, display: 'flex',
          flexDirection: 'column', justifyContent: 'center',
          padding: '40px 40px',
        }}>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12, display: 'flex' }}>
            {business}
          </div>
          {offer && (
            <div style={{
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              padding: '6px 16px', borderRadius: 20, fontSize: 16, fontWeight: 700,
              marginBottom: 16, display: 'flex', width: 'fit-content',
            }}>{offer}</div>
          )}
          <div style={{
            background: '#fff', color: primary,
            padding: '12px 28px', borderRadius: 10,
            fontSize: 18, fontWeight: 800, display: 'flex', width: 'fit-content',
          }}>{cta}</div>
        </div>

        {/* Right content area */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '40px 50px',
          position: 'relative',
        }}>
          <div style={{ width: 40, height: 4, background: primary, borderRadius: 2, marginBottom: 20, display: 'flex' }} />
          <div style={{
            fontSize: headline.length > 50 ? 36 : 44,
            fontWeight: 900, color: '#fff', lineHeight: 1.15,
            letterSpacing: '-0.02em', display: 'flex', flexWrap: 'wrap', marginBottom: 16,
          }}>{headline}</div>
          {subtext && (
            <div style={{ fontSize: 22, color: '#9ca3af', lineHeight: 1.5, display: 'flex', flexWrap: 'wrap' }}>
              {subtext}
            </div>
          )}
        </div>

        {/* Bottom accent */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: accent, opacity: 0.4, display: 'flex' }} />
      </div>,
      { width: W, height: H }
    )
  }

  // Story / Reel (9:16 vertical) — centered layout with urgency
  if (size === 'story') {
    return new ImageResponse(
      <div style={{
        width: W, height: H,
        background: bg, display: 'flex',
        flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '120px 80px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Background radial burst */}
        <div style={{
          position: 'absolute', top: '30%', left: '50%',
          width: 900, height: 900, borderRadius: '50%',
          background: primary, opacity: 0.07, display: 'flex',
        }} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: primary, display: 'flex' }} />

        {/* Business + offer top */}
        <div style={{ position: 'absolute', top: 80, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ color: '#6b7280', fontSize: 22, fontWeight: 600, letterSpacing: '0.06em', display: 'flex' }}>{business}</div>
          {offer && (
            <div style={{
              marginTop: 12, background: primary, color: '#fff',
              padding: '8px 24px', borderRadius: 24,
              fontSize: 20, fontWeight: 700, display: 'flex', letterSpacing: '0.02em',
            }}>{offer}</div>
          )}
        </div>

        {/* Center content */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: 60, height: 5, background: primary, borderRadius: 3, marginBottom: 48, display: 'flex' }} />
          <div style={{
            fontSize: headline.length > 40 ? 76 : 92,
            fontWeight: 900, color: '#fff',
            lineHeight: 1.1, letterSpacing: '-0.02em',
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 40,
          }}>{headline}</div>
          {subtext && (
            <div style={{
              fontSize: 32, color: accent, lineHeight: 1.5,
              display: 'flex', flexWrap: 'wrap', justifyContent: 'center', textAlign: 'center',
            }}>{subtext}</div>
          )}
        </div>

        {/* CTA bottom */}
        <div style={{
          position: 'absolute', bottom: 100,
          background: primary, color: '#fff',
          padding: '22px 64px', borderRadius: 18,
          fontSize: 32, fontWeight: 800, display: 'flex',
        }}>{cta}</div>
        <div style={{ position: 'absolute', bottom: 48, color: '#374151', fontSize: 22, display: 'flex' }}>↑  ↑  ↑</div>
      </div>,
      { width: W, height: H }
    )
  }

  // Square (1:1) — default feed ad layout
  return new ImageResponse(
    <div style={{
      width: W, height: H,
      background: bg, display: 'flex',
      flexDirection: 'column', justifyContent: 'space-between',
      padding: '70px 80px 60px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 7, background: primary, display: 'flex' }} />

      {/* Background glows */}
      <div style={{
        position: 'absolute', bottom: -200, right: -200,
        width: 600, height: 600, borderRadius: '50%',
        background: primary, opacity: 0.07, display: 'flex',
      }} />
      <div style={{
        position: 'absolute', top: -100, left: -100,
        width: 350, height: 350, borderRadius: '50%',
        background: accent, opacity: 0.04, display: 'flex',
      }} />

      {/* Top row: business + offer badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          background: primary, color: '#fff',
          padding: '8px 22px', borderRadius: 24,
          fontSize: 20, fontWeight: 700, display: 'flex',
        }}>{business}</div>
        {offer && (
          <div style={{
            background: 'rgba(255,255,255,0.08)', color: accent,
            border: `1px solid ${accent}`,
            padding: '8px 20px', borderRadius: 24,
            fontSize: 18, fontWeight: 700, display: 'flex',
          }}>{offer}</div>
        )}
      </div>

      {/* Center content */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', padding: '36px 0' }}>
        <div style={{ width: 52, height: 5, background: primary, borderRadius: 3, marginBottom: 32, display: 'flex' }} />
        <div style={{
          fontSize: headline.length > 60 ? 56 : headline.length > 35 ? 68 : 80,
          fontWeight: 900, color: '#fff',
          lineHeight: 1.15, letterSpacing: '-0.02em',
          display: 'flex', flexWrap: 'wrap', marginBottom: 28,
        }}>{headline}</div>
        {subtext && (
          <div style={{ fontSize: 28, color: '#9ca3af', lineHeight: 1.6, display: 'flex', flexWrap: 'wrap' }}>
            {subtext}
          </div>
        )}
      </div>

      {/* Bottom: CTA button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          background: primary, color: '#fff',
          padding: '16px 36px', borderRadius: 14,
          fontSize: 24, fontWeight: 800, display: 'flex',
        }}>{cta}</div>
        <div style={{ color: '#374151', fontSize: 18, display: 'flex' }}>AD</div>
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: accent, opacity: 0.3, display: 'flex' }} />
    </div>,
    { width: W, height: H }
  )
}
