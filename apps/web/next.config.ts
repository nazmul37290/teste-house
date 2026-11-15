import path from 'node:path';
import type { NextConfig } from 'next';

// The API's address inside the network (Dokploy: http://<api service>:4000). Never exposed to browsers.
const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  output: 'standalone',
  // Monorepo: trace files from the repo root so @shop/shared is included in the standalone build.
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  transpilePackages: ['@shop/shared'],
  poweredByHeader: false,
  images: {
    // Product images are served by the API / Cloudflare; add the media host here.
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '4000', pathname: '/media/**' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  // Same origin for the browser (docs/auth.md decision 10): /api/v1/* on the web origin goes to the
  // API, so auth cookies are first-party.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiInternalUrl}/api/v1/:path*` }];
  },
};

export default config;
