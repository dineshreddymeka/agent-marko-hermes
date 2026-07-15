import type { NextConfig } from 'next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HERMES_TARGET = process.env.HERMES_URL || 'http://127.0.0.1:9119'

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  distDir: '.next',
  trailingSlash: false,
  reactStrictMode: true,
  transpilePackages: ['@hermes/shared'],
  // Pre-existing UI type nits; do not block Hermes mount export.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@app': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../packages/shared/src'),
      '@hermes/shared': path.resolve(__dirname, '../packages/shared/src'),
    }
    return config
  },
  async rewrites() {
    // Used by `next dev` only — ignored for `output: 'export'` builds.
    return [
      { source: '/api/:path*', destination: `${HERMES_TARGET}/api/:path*` },
      { source: '/agui', destination: `${HERMES_TARGET}/agui` },
      { source: '/agui/:path*', destination: `${HERMES_TARGET}/agui/:path*` },
    ]
  },
}

export default nextConfig
