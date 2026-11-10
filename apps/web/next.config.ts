import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  // Monorepo: trace files from the repo root so @shop/shared is included in the standalone build.
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  transpilePackages: ['@shop/shared'],
  poweredByHeader: false,
  images: {
    // Product images are served by the API / Cloudflare; add the media host here.
    remotePatterns: [{ protocol: 'http', hostname: 'localhost', port: '4000', pathname: '/media/**' }],
    formats: ['image/avif', 'image/webp'],
  },
};

export default config;
