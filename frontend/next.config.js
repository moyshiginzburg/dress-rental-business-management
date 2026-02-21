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
  
  // Proxy /api/* to the backend Express server running on the same host.
  // Used in both development and production (Docker container runs both).
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
      // Proxy /uploads/* to the backend so that agreement PDFs,
      // signatures, dress images, and expense receipts are accessible.
      {
        source: '/uploads/:path*',
        destination: 'http://localhost:3001/uploads/:path*',
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
