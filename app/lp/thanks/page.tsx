/**
 * /lp/thanks — Thank-you page shown after landing page form submission.
 */
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ name?: string }>
}

export default async function ThanksPage({ searchParams }: Props) {
  const { name } = await searchParams
  const displayName = name ? decodeURIComponent(name) : null

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '24px',
      }}
    >
      <div
        style={{
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '16px',
          padding: '48px',
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        }}
      >
        {/* Checkmark icon */}
        <div
          style={{
            width: '72px',
            height: '72px',
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: '32px',
          }}
        >
          ✓
        </div>

        <h1
          style={{
            color: '#ffffff',
            fontSize: '28px',
            fontWeight: 700,
            margin: '0 0 12px',
            lineHeight: 1.2,
          }}
        >
          {displayName ? `Thank you, ${displayName}!` : 'Thank you!'}
        </h1>

        <p
          style={{
            color: '#9ca3af',
            fontSize: '16px',
            lineHeight: 1.6,
            margin: '0 0 32px',
          }}
        >
          We&apos;ll be in touch soon. Keep an eye on your inbox — we&apos;ve got something special coming your way.
        </p>

        <Link
          href="/"
          style={{
            display: 'inline-block',
            background: '#4f46e5',
            color: '#ffffff',
            padding: '12px 28px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '14px',
            transition: 'background 0.2s',
          }}
        >
          ← Return to Homepage
        </Link>

        <p
          style={{
            color: '#4b5563',
            fontSize: '12px',
            marginTop: '24px',
          }}
        >
          You can close this tab or explore more below.
        </p>
      </div>
    </div>
  )
}
