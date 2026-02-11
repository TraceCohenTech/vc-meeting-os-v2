import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
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
