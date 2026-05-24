import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const PALETTES: Record<string, { primary: string; accent: string; bg: string }> = {
  professional: { primary: '#4f46e5', accent: '#818cf8', bg: '#0a0a14' },
  energetic:    { primary: '#f59e0b', accent: '#fbbf24', bg: '#0a0a0a' },
  friendly:     { primary: '#10b981', accent: '#34d399', bg: '#020f08' },
  luxury:       { primary: '#9333ea', accent: '#c084fc', bg: '#08010f' },
  bold:         { primary: '#ef4444', accent: '#f87171', bg: '#0a0101' },
}

function getPalette(tone: string) {
  const t = (tone || '').toLowerCase()
  if (t.includes('luxury') || t.includes('premium') || t.includes('elegant')) return PALETTES.luxury
  if (t.includes('bold') || t.includes('powerful')) return PALETTES.bold
  if (t.includes('friend') || t.includes('warm') || t.includes('casual')) return PALETTES.friendly
  if (t.includes('energe') || t.includes('excit') || t.includes('dynamic')) return PALETTES.energetic
  return PALETTES.professional
}

// Supported video formats and their dimensions
const FORMATS: Record<string, { w: number; h: number; label: string }> = {
  reel:    { w: 1080, h: 1920, label: '9:16 Reel' },
  story:   { w: 1080, h: 1920, label: '9:16 Story' },
  short:   { w: 1080, h: 1920, label: '9:16 Short' },
  youtube: { w: 1280, h: 720,  label: '16:9 YouTube' },
  square:  { w: 1080, h: 1080, label: '1:1 Square' },
  ad:      { w: 1080, h: 1080, label: '1:1 Ad' },
}

// Renders a single storyboard scene frame — what the video looks like at that moment
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const format      = searchParams.get('format') || 'reel'
  const tone        = searchParams.get('tone') || 'professional'
  const sceneNum    = parseInt(searchParams.get('sceneNum') || '1', 10)
  const totalScenes = parseInt(searchParams.get('totalScenes') || '1', 10)
  const shotType    = (searchParams.get('shotType') || 'medium shot').slice(0, 40)
  const visual      = (searchParams.get('visual') || '').slice(0, 120)   // visual direction
  const script      = (searchParams.get('script') || '').slice(0, 140)   // spoken/caption text
  const duration    = (searchParams.get('duration') || '3s').slice(0, 8) // scene duration
  const business    = (searchParams.get('business') || '').slice(0, 40)

  const dim = FORMATS[format] || FORMATS.reel
  const W = dim.w
  const H = dim.h
  const { primary, accent, bg } = getPalette(tone)
  const isVertical = H > W

  return new ImageResponse(
    <div style={{
      width: W, height: H,
      background: bg,
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Cinematic texture overlay (diagonal lines) */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(255,255,255,0.008) 40px, rgba(255,255,255,0.008) 41px)`,
        display: 'flex',
      }} />

      {/* Top color bleed */}
      <div style={{
        position: 'absolute', top: -300, left: '20%',
        width: 600, height: 600, borderRadius: '50%',
        background: primary, opacity: 0.06, display: 'flex',
      }} />

      {/* Scene counter badge — top left */}
      <div style={{
        position: 'absolute', top: isVertical ? 80 : 40, left: 50,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          background: primary, color: '#fff',
          width: isVertical ? 64 : 48, height: isVertical ? 64 : 48,
          borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: isVertical ? 28 : 22, fontWeight: 900,
        }}>{sceneNum}</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: '#6b7280', fontSize: isVertical ? 20 : 14, display: 'flex' }}>SCENE</div>
          <div style={{ color: '#4b5563', fontSize: isVertical ? 18 : 12, display: 'flex' }}>of {totalScenes}</div>
        </div>
      </div>

      {/* Format badge — top right */}
      <div style={{
        position: 'absolute', top: isVertical ? 80 : 40, right: 50,
        background: 'rgba(255,255,255,0.05)', border: `1px solid ${primary}40`,
        color: accent, padding: '8px 20px', borderRadius: 20,
        fontSize: isVertical ? 20 : 14, fontWeight: 700, display: 'flex',
        letterSpacing: '0.06em',
      }}>{dim.label}</div>

      {/* Center: visual description area */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: isVertical ? '120px 60px' : '60px 80px',
      }}>
        {/* Shot type pill */}
        <div style={{
          background: `${primary}20`, border: `1px solid ${primary}60`,
          color: primary, padding: '8px 24px', borderRadius: 20,
          fontSize: isVertical ? 20 : 14, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          marginBottom: isVertical ? 48 : 28, display: 'flex',
        }}>{shotType}</div>

        {/* Visual direction — what should be on screen */}
        <div style={{
          fontSize: isVertical ? 42 : 28,
          fontWeight: 700, color: '#f3f4f6',
          lineHeight: 1.3, display: 'flex',
          flexWrap: 'wrap', textAlign: 'center',
          justifyContent: 'center',
          marginBottom: isVertical ? 48 : 32,
        }}>{visual || 'Scene visual'}</div>

        {/* Divider */}
        <div style={{ display: 'flex', gap: 8, marginBottom: isVertical ? 48 : 28 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: i === 1 ? 32 : 8, height: 4, borderRadius: 2,
              background: i === 1 ? primary : '#374151', display: 'flex',
            }} />
          ))}
        </div>

        {/* Script / caption text */}
        {script && (
          <div style={{
            fontSize: isVertical ? 30 : 20,
            color: '#9ca3af', lineHeight: 1.5,
            display: 'flex', flexWrap: 'wrap',
            textAlign: 'center', justifyContent: 'center',
            fontStyle: 'italic',
          }}>"{script}"</div>
        )}
      </div>

      {/* Bottom info bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: isVertical ? '32px 50px' : '20px 50px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
      }}>
        <div style={{ color: '#4b5563', fontSize: isVertical ? 20 : 14, display: 'flex' }}>{business}</div>
        <div style={{
          background: `${accent}20`, color: accent,
          padding: '6px 18px', borderRadius: 12,
          fontSize: isVertical ? 18 : 13, fontWeight: 700, display: 'flex',
        }}>{duration}</div>
      </div>

      {/* Timeline bar at very bottom */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: '#1f2937', display: 'flex' }}>
        <div style={{
          width: `${(sceneNum / totalScenes) * 100}%`, height: '100%',
          background: primary, display: 'flex',
        }} />
      </div>
    </div>,
    { width: W, height: H }
  )
}
