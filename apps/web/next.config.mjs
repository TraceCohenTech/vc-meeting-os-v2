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

export default nextConfig;
