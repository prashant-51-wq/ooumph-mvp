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

// 1080×1920 — Instagram/Facebook Story, YouTube Short cover
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tone = searchParams.get('tone') || 'professional'
  const business = (searchParams.get('business') || '').slice(0, 40)
  const hook = (searchParams.get('hook') || '').slice(0, 80)
  const subtext = (searchParams.get('subtext') || '').slice(0, 100)
  const cta = (searchParams.get('cta') || '').slice(0, 60)
  const label = (searchParams.get('label') || 'NEW').slice(0, 20)

  const { primary, accent, bg } = getPalette(tone)
  const W = 1080
  const H = 1920

  return new ImageResponse(
    <div style={{
      width: W, height: H, background: bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '120px 80px', position: 'relative', overflow: 'hidden',
    }}>
      {/* Left accent stripe */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: primary, display: 'flex' }} />

      {/* Top glow */}
      <div style={{
        position: 'absolute', top: -200, left: '50%',
        width: 800, height: 800, borderRadius: '50%',
        background: primary, opacity: 0.08, display: 'flex',
      }} />

      {/* Bottom glow */}
      <div style={{
        position: 'absolute', bottom: -200, right: -200,
        width: 700, height: 700, borderRadius: '50%',
        background: accent, opacity: 0.05, display: 'flex',
      }} />

      {/* Label chip - top */}
      <div style={{
        position: 'absolute', top: 100, right: 60,
        background: primary, color: '#fff',
        padding: '10px 28px', borderRadius: 28,
        fontSize: 24, fontWeight: 800, display: 'flex',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        {label}
      </div>

      {/* Business name */}
      <div style={{
        position: 'absolute', top: 100, left: 40,
        color: '#6b7280', fontSize: 22, fontWeight: 600,
        display: 'flex', letterSpacing: '0.04em',
      }}>
        {business}
      </div>

      {/* Center content */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        {/* Accent line */}
        <div style={{ width: 72, height: 6, background: primary, borderRadius: 3, marginBottom: 60, display: 'flex' }} />

        {/* Hook */}
        <div style={{
          fontSize: hook.length > 40 ? 80 : 96,
          fontWeight: 900, color: '#ffffff',
          lineHeight: 1.1, display: 'flex',
          flexWrap: 'wrap', justifyContent: 'center',
          marginBottom: 48, letterSpacing: '-0.02em',
        }}>
          {hook}
        </div>

        {/* Divider dots */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 48 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: i === 1 ? 32 : 12, height: 12,
              borderRadius: 6, display: 'flex',
              background: i === 1 ? primary : '#374151',
            }} />
          ))}
        </div>

        {/* Subtext */}
        <div style={{
          fontSize: 34, color: accent,
          lineHeight: 1.5, display: 'flex',
          flexWrap: 'wrap', justifyContent: 'center',
          textAlign: 'center',
        }}>
          {subtext}
        </div>
      </div>

      {/* CTA - bottom */}
      <div style={{
        position: 'absolute', bottom: 120,
        background: primary, color: '#fff',
        padding: '22px 60px', borderRadius: 18,
        fontSize: 32, fontWeight: 800, display: 'flex',
        letterSpacing: '0.01em',
      }}>
        {cta || 'Swipe Up ↑'}
      </div>

      {/* Swipe indicator */}
      <div style={{
        position: 'absolute', bottom: 52,
        color: '#374151', fontSize: 22, display: 'flex',
      }}>
        ↑  ↑  ↑
      </div>
    </div>,
    { width: W, height: H }
  )
}
