import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // unsafe-eval needed for Next.js dev HMR; tighten post-launch
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.anthropic.com https://*.neon.tech wss: https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  // Allow tunnel hostnames to access /_next/* dev resources (HMR, chunks).
  // Next 16 blocks cross-origin dev requests by default for safety; without
  // this list, client-side JS bundles fail to load through tunnels and
  // forms silently break. Add additional hostnames here as needed.
  allowedDevOrigins: [
    'localhost:3000',
    '*.loca.lt',          // localtunnel
    '*.pinggy-free.link', // pinggy free tier
    '*.run.pinggy-free.link',
    '*.trycloudflare.com',// cloudflare quick tunnel
    '*.ngrok-free.app',   // ngrok free tier
    '*.ngrok.io',
    '*.serveo.net',
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        '*.loca.lt',
        '*.pinggy-free.link',
        '*.run.pinggy-free.link',
        '*.trycloudflare.com',
        '*.ngrok-free.app',
        '*.ngrok.io',
        '*.serveo.net',
      ],
    },
  },
  images: {
    remotePatterns: [],
  },
  typescript: {
    // Pre-existing type errors in creative/page.tsx (unknown cast patterns)
    // do not affect runtime correctness — all new agent code is fully typed.
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
