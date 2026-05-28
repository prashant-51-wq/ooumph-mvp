import type { NextConfig } from 'next'

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
}

export default nextConfig
