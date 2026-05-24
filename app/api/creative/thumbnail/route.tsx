import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const PALETTES: Record<string, { primary: string; accent: string; bg: string; dim: string }> = {
  professional: { primary: '#4f46e5', accent: '#818cf8', bg: '#0a0a0f', dim: '#1a1a2e' },
  energetic:    { primary: '#f59e0b', accent: '#fbbf24', bg: '#0a0a00', dim: '#1c1600' },
  friendly:     { primary: '#10b981', accent: '#34d399', bg: '#00100a', dim: '#001a0f' },
  luxury:       { primary: '#9333ea', accent: '#c084fc', bg: '#07000f', dim: '#130020' },
  bold:         { primary: '#ef4444', accent: '#f87171', bg: '#0f0000', dim: '#1a0000' },
}

function getPalette(tone: string) {
  const t = (tone || '').toLowerCase()
  if (t.includes('luxury') || t.includes('premium') || t.includes('elegant')) return PALETTES.luxury
  if (t.includes('bold') || t.includes('powerful') || t.includes('aggressive')) return PALETTES.bold
  if (t.includes('friend') || t.includes('warm') || t.includes('casual')) return PALETTES.friendly
  if (t.includes('energe') || t.includes('excit') || t.includes('dynamic')) return PALETTES.energetic
  return PALETTES.professional
}

const W = 1280
const H = 720

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const layout = searchParams.get('layout') || 'hook'
  const tone = searchParams.get('tone') || 'professional'
  const business = (searchParams.get('business') || '').slice(0, 40)
  const headline = (searchParams.get('headline') || '').slice(0, 60)
  const subtext = (searchParams.get('subtext') || '').slice(0, 80)
  const accentNumber = (searchParams.get('accentNumber') || '').slice(0, 10)
  const accentWord = (searchParams.get('accentWord') || '').slice(0, 20)

  const { primary, accent, bg, dim } = getPalette(tone)

  if (layout === 'stat' && accentNumber) {
    // ─── STAT LAYOUT: Big number left + text right ────────────────────────────
    return new ImageResponse(
      <div style={{ width: W, height: H, background: bg, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* Top accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 10, background: primary, display: 'flex' }} />

        {/* Background glow for stat */}
        <div style={{
          position: 'absolute', left: -60, top: '50%',
          width: 520, height: 520,
          borderRadius: '50%', background: primary,
          opacity: 0.08, display: 'flex',
          transform: 'translateY(-50%)',
        }} />

        {/* Left panel: stat */}
        <div style={{
          width: 480, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          borderRight: `1px solid ${dim}`, padding: '60px 40px',
        }}>
          <div style={{
            fontSize: accentNumber.length <= 3 ? 200 : 140,
            fontWeight: 900, color: primary,
            lineHeight: 0.85, display: 'flex',
            letterSpacing: '-0.04em',
          }}>
            {accentNumber}
          </div>
          {accentWord && (
            <div style={{
              fontSize: 36, color: accent,
              fontWeight: 800, marginTop: 20,
              display: 'flex', textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}>
              {accentWord}
            </div>
          )}
        </div>

        {/* Right panel: text */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '70px 64px 70px 56px',
        }}>
          {/* Accent line */}
          <div style={{ width: 48, height: 6, background: primary, borderRadius: 3, marginBottom: 32, display: 'flex' }} />

          {/* Headline */}
          <div style={{
            fontSize: headline.length > 30 ? 64 : 80,
            fontWeight: 900, color: '#ffffff',
            lineHeight: 1.05, display: 'flex',
            flexWrap: 'wrap', marginBottom: 28,
            letterSpacing: '-0.02em',
          }}>
            {headline}
          </div>

          {/* Subtext */}
          <div style={{
            fontSize: 30, color: '#9ca3af',
            lineHeight: 1.4, display: 'flex', flexWrap: 'wrap',
          }}>
            {subtext}
          </div>
        </div>

        {/* Channel badge */}
        <div style={{
          position: 'absolute', bottom: 36, left: 40,
          background: primary, color: '#fff',
          padding: '8px 22px', borderRadius: 24,
          fontSize: 22, fontWeight: 700, display: 'flex',
        }}>
          {business}
        </div>

        {/* Play indicator */}
        <div style={{
          position: 'absolute', bottom: 36, right: 48,
          color: '#374151', fontSize: 22,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          ▶ Watch Now
        </div>

        {/* Bottom bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: primary, opacity: 0.4, display: 'flex' }} />
      </div>,
      { width: W, height: H }
    )
  }

  // ─── HOOK LAYOUT: Full-width bold headline ──────────────────────────────────
  return new ImageResponse(
    <div style={{
      width: W, height: H, background: bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '80px 120px', position: 'relative', overflow: 'hidden',
    }}>
      {/* Top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 10, background: primary, display: 'flex' }} />

      {/* Left accent bar */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: primary, display: 'flex' }} />

      {/* Background glow */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 700, height: 700,
        borderRadius: '50%', background: primary,
        opacity: 0.04, display: 'flex',
      }} />

      {/* Accent divider */}
      <div style={{ width: 80, height: 7, background: primary, borderRadius: 4, marginBottom: 44, display: 'flex' }} />

      {/* Headline */}
      <div style={{
        fontSize: headline.length > 35 ? 72 : headline.length > 20 ? 88 : 104,
        fontWeight: 900, color: '#ffffff',
        textAlign: 'center', lineHeight: 1.05,
        display: 'flex', flexWrap: 'wrap',
        justifyContent: 'center', marginBottom: 36,
        letterSpacing: '-0.02em',
      }}>
        {headline}
      </div>

      {/* Subtext */}
      <div style={{
        fontSize: 34, color: accent,
        textAlign: 'center', lineHeight: 1.4,
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {subtext}
      </div>

      {/* Channel badge */}
      <div style={{
        position: 'absolute', bottom: 36, left: 48,
        background: primary, color: '#fff',
        padding: '8px 22px', borderRadius: 24,
        fontSize: 22, fontWeight: 700, display: 'flex',
      }}>
        {business}
      </div>

      {/* Play */}
      <div style={{
        position: 'absolute', bottom: 36, right: 48,
        color: '#374151', fontSize: 22,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        ▶ Watch Now
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: primary, opacity: 0.4, display: 'flex' }} />
    </div>,
    { width: W, height: H }
  )
}
