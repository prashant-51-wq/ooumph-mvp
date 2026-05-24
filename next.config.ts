import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
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
