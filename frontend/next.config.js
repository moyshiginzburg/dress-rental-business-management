/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Ignore lint and type errors during build for this prototype phase
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Proxy /api/* and /uploads/* to the backend.
  // On Vercel: BACKEND_URL or NEXT_PUBLIC_API_URL (stripped of /api) must point to the backend.
  // On Docker/local: defaults to localhost:3001.
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL
      || (process.env.NEXT_PUBLIC_API_URL?.match(/^https?:\/\//)
        ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, '')
        : null)
      || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      // Proxy /uploads/* to the backend so that agreement PDFs,
      // signatures, dress images, and expense receipts are accessible.
      {
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
    ];
  },

  // Increase proxy timeout to handle slow operations (e.g. PDF generation,
  // AI receipt extraction). Default is 30s which can cause "socket hang up".
  experimental: {
    proxyTimeout: 120000, // 120 seconds
  },
  
  // Allow images from various sources
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
