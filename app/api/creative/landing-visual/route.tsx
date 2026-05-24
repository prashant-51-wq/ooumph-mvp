import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const PALETTES: Record<string, { primary: string; accent: string; bg: string; bgAlt: string }> = {
  professional: { primary: '#4f46e5', accent: '#818cf8', bg: '#0f0f0f', bgAlt: '#111827' },
  energetic:    { primary: '#f59e0b', accent: '#fbbf24', bg: '#0f0f0f', bgAlt: '#111806' },
  friendly:     { primary: '#10b981', accent: '#34d399', bg: '#0f0f0f', bgAlt: '#061110' },
  luxury:       { primary: '#9333ea', accent: '#c084fc', bg: '#0f0f0f', bgAlt: '#0d0814' },
  bold:         { primary: '#ef4444', accent: '#f87171', bg: '#0f0f0f', bgAlt: '#140808' },
}

function getPalette(tone: string) {
  const t = (tone || '').toLowerCase()
  if (t.includes('luxury') || t.includes('premium') || t.includes('elegant')) return PALETTES.luxury
  if (t.includes('bold') || t.includes('powerful')) return PALETTES.bold
  if (t.includes('friend') || t.includes('warm') || t.includes('casual')) return PALETTES.friendly
  if (t.includes('energe') || t.includes('excit') || t.includes('dynamic')) return PALETTES.energetic
  return PALETTES.professional
}

// Landing page visual sections and their canvas sizes
// hero:     1200×630  — OpenGraph / above-fold hero
// feature:  1200×500  — 3-column feature grid row
// cta:      1200×400  — call-to-action strip
// stats:    1200×280  — social proof numbers bar
// faq:      800×600   — FAQ/accordion background card
// og:       1200×630  — Open Graph share card (same as hero, reused)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const section  = searchParams.get('section') || 'hero'
  const tone     = searchParams.get('tone') || 'professional'
  const business = (searchParams.get('business') || '').slice(0, 40)
  const headline = (searchParams.get('headline') || '').slice(0, 80)
  const sub      = (searchParams.get('sub') || '').slice(0, 120)
  const cta      = (searchParams.get('cta') || 'Get Started').slice(0, 50)
  const tag      = (searchParams.get('tag') || '').slice(0, 40)     // section eyebrow label
  // For feature sections: up to 3 feature items
  const f1t = (searchParams.get('f1t') || '').slice(0, 40)
  const f1d = (searchParams.get('f1d') || '').slice(0, 80)
  const f2t = (searchParams.get('f2t') || '').slice(0, 40)
  const f2d = (searchParams.get('f2d') || '').slice(0, 80)
  const f3t = (searchParams.get('f3t') || '').slice(0, 40)
  const f3d = (searchParams.get('f3d') || '').slice(0, 80)
  // For stats: up to 4 stat items
  const s1n = (searchParams.get('s1n') || '').slice(0, 16)
  const s1l = (searchParams.get('s1l') || '').slice(0, 40)
  const s2n = (searchParams.get('s2n') || '').slice(0, 16)
  const s2l = (searchParams.get('s2l') || '').slice(0, 40)
  const s3n = (searchParams.get('s3n') || '').slice(0, 16)
  const s3l = (searchParams.get('s3l') || '').slice(0, 40)
  const s4n = (searchParams.get('s4n') || '').slice(0, 16)
  const s4l = (searchParams.get('s4l') || '').slice(0, 40)

  const { primary, accent, bg, bgAlt } = getPalette(tone)

  // ── HERO (1200×630) ──────────────────────────────────────────────────────────
  if (section === 'hero' || section === 'og') {
    const W = 1200, H = 630
    return new ImageResponse(
      <div style={{
        width: W, height: H, background: bg,
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start', justifyContent: 'center',
        padding: '80px 100px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: primary, display: 'flex' }} />
        {/* Glow top right */}
        <div style={{ position: 'absolute', top: -200, right: -100, width: 700, height: 700, borderRadius: '50%', background: primary, opacity: 0.06, display: 'flex' }} />
        {/* Glow bottom left */}
        <div style={{ position: 'absolute', bottom: -150, left: -100, width: 500, height: 500, borderRadius: '50%', background: accent, opacity: 0.04, display: 'flex' }} />

        {/* Eyebrow */}
        {tag && (
          <div style={{
            background: `${primary}20`, border: `1px solid ${primary}50`,
            color: primary, padding: '6px 18px', borderRadius: 20,
            fontSize: 18, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: 32, display: 'flex',
          }}>{tag}</div>
        )}

        {/* Headline */}
        <div style={{
          fontSize: headline.length > 50 ? 52 : headline.length > 35 ? 62 : 74,
          fontWeight: 900, color: '#ffffff', lineHeight: 1.1,
          letterSpacing: '-0.02em', display: 'flex', flexWrap: 'wrap',
          maxWidth: 800, marginBottom: 28,
        }}>{headline}</div>

        {/* Subheadline */}
        {sub && (
          <div style={{
            fontSize: 24, color: '#9ca3af', lineHeight: 1.6,
            display: 'flex', flexWrap: 'wrap', maxWidth: 640, marginBottom: 44,
          }}>{sub}</div>
        )}

        {/* CTA button */}
        <div style={{
          background: primary, color: '#fff',
          padding: '16px 40px', borderRadius: 14,
          fontSize: 22, fontWeight: 800, display: 'flex',
        }}>{cta} →</div>

        {/* Business watermark */}
        <div style={{ position: 'absolute', top: 30, right: 50, color: '#374151', fontSize: 16, display: 'flex', fontWeight: 600 }}>{business}</div>
        {/* Bottom bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: accent, opacity: 0.25, display: 'flex' }} />
      </div>,
      { width: W, height: H }
    )
  }

  // ── FEATURE GRID (1200×500) ────────────────────────────────────────────────
  if (section === 'feature') {
    const W = 1200, H = 500
    const features = [
      { title: f1t, desc: f1d, icon: '⚡' },
      { title: f2t, desc: f2d, icon: '🎯' },
      { title: f3t, desc: f3d, icon: '🚀' },
    ].filter(f => f.title)

    return new ImageResponse(
      <div style={{
        width: W, height: H, background: bgAlt,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '60px 80px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: primary, opacity: 0.5, display: 'flex' }} />

        {/* Section eyebrow + headline */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 48 }}>
          {tag && <div style={{ color: primary, fontSize: 16, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12, display: 'flex' }}>{tag}</div>}
          <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: '-0.01em', display: 'flex' }}>{headline}</div>
        </div>

        {/* Feature cards row */}
        <div style={{ display: 'flex', gap: 24, width: '100%' }}>
          {features.map((f, i) => (
            <div key={i} style={{
              flex: 1, background: bg,
              border: `1px solid ${primary}30`,
              borderRadius: 16, padding: '32px 28px', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ fontSize: 36, marginBottom: 16, display: 'flex' }}>{f.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 12, display: 'flex' }}>{f.title}</div>
              <div style={{ fontSize: 16, color: '#9ca3af', lineHeight: 1.5, display: 'flex', flexWrap: 'wrap' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>,
      { width: W, height: H }
    )
  }

  // ── CTA BANNER (1200×400) ─────────────────────────────────────────────────
  if (section === 'cta') {
    const W = 1200, H = 400
    return new ImageResponse(
      <div style={{
        width: W, height: H, background: primary,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '60px 100px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -100, left: -80, width: 350, height: 350, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', display: 'flex' }} />

        {tag && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20, display: 'flex' }}>{tag}</div>}
        <div style={{ fontSize: headline.length > 50 ? 44 : 56, fontWeight: 900, color: '#fff', lineHeight: 1.1, textAlign: 'center', letterSpacing: '-0.02em', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>{headline}</div>
        {sub && <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.75)', textAlign: 'center', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 36 }}>{sub}</div>}
        <div style={{ background: '#fff', color: primary, padding: '16px 40px', borderRadius: 14, fontSize: 22, fontWeight: 800, display: 'flex' }}>{cta} →</div>
      </div>,
      { width: W, height: H }
    )
  }

  // ── STATS BAR (1200×280) ──────────────────────────────────────────────────
  if (section === 'stats') {
    const W = 1200, H = 280
    const stats = [
      { num: s1n, label: s1l },
      { num: s2n, label: s2l },
      { num: s3n, label: s3l },
      { num: s4n, label: s4l },
    ].filter(s => s.num)

    return new ImageResponse(
      <div style={{
        width: W, height: H, background: bgAlt,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 100px', position: 'relative', overflow: 'hidden',
        gap: 0,
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: primary, display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: accent, opacity: 0.3, display: 'flex' }} />

        {stats.map((s, i) => (
          <div key={i} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            borderRight: i < stats.length - 1 ? `1px solid #1f2937` : 'none',
            padding: '0 40px',
          }}>
            <div style={{ fontSize: 56, fontWeight: 900, color: primary, letterSpacing: '-0.02em', display: 'flex', lineHeight: 1 }}>{s.num}</div>
            <div style={{ fontSize: 18, color: '#6b7280', fontWeight: 600, marginTop: 10, textAlign: 'center', display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>{s.label}</div>
          </div>
        ))}
      </div>,
      { width: W, height: H }
    )
  }

  // ── FAQ / CARD BACKGROUND (800×600) ──────────────────────────────────────
  const W = 800, H = 600
  return new ImageResponse(
    <div style={{
      width: W, height: H, background: bgAlt,
      display: 'flex', flexDirection: 'column',
      padding: '60px 60px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: primary, display: 'flex' }} />
      {tag && <div style={{ color: primary, fontSize: 16, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 24, display: 'flex' }}>{tag}</div>}
      <div style={{ fontSize: 38, fontWeight: 900, color: '#fff', lineHeight: 1.2, display: 'flex', flexWrap: 'wrap', marginBottom: 24 }}>{headline}</div>
      {sub && <div style={{ fontSize: 22, color: '#9ca3af', lineHeight: 1.6, display: 'flex', flexWrap: 'wrap', marginBottom: 40 }}>{sub}</div>}
      <div style={{ display: 'flex', marginTop: 'auto' }}>
        <div style={{ background: primary, color: '#fff', padding: '14px 32px', borderRadius: 12, fontSize: 20, fontWeight: 700, display: 'flex' }}>{cta}</div>
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: primary, display: 'flex' }} />
    </div>,
    { width: W, height: H }
  )
}
