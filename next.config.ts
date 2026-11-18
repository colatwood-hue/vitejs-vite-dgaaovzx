import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
]

const config: NextConfig = {
  typedRoutes: true,
  // Uploads (voice notes, photos) go through server actions. Vercel caps request bodies at ~4.5MB,
  // so attachments are limited to 4MB per capture in total (see src/lib/knowledge.ts).
  experimental: { serverActions: { bodySizeLimit: '4.5mb' } },
  serverExternalPackages: ['postgres'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default config
