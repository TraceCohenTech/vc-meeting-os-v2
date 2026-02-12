import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Use SWC for faster builds
  swcMinify: true,

  // Optimize images with modern formats
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },

  // Standalone output for smaller deployments
  output: 'standalone',

  // Experimental features for performance
  experimental: {
    // Optimize package imports for faster builds
    optimizePackageImports: ['lucide-react', '@supabase/supabase-js', 'googleapis'],
  },

  // Headers for caching
  async headers() {
    return [
      {
        // Cache static assets aggressively
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Cache Next.js build files
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      // Redirect old domain to new domain
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'web-blond-eight-87.vercel.app',
          },
        ],
        destination: 'https://ai-vc-v2.vercel.app/:path*',
        permanent: true,
      },
    ];
  },
};

// Wrap with Sentry only if DSN is configured
const sentryConfig = {
  silent: true, // Suppresses source map upload logs
  hideSourceMaps: true,
};

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryConfig)
  : nextConfig;
