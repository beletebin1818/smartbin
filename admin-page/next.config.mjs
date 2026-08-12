import fs from 'fs';
import path from 'path';

const nextDir = path.resolve(process.cwd(), '.next');
try {
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true });
    console.log('Cleaned stale .next directory before starting Next.js');
  }
} catch (error) {
  console.warn('Unable to clean .next directory:', error?.message || error);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
    ];
  },
  webpack: (config, { dev, isServer }) => {
    // Disable React Fast Refresh in development (from next.config.js)
    if (dev && !isServer && Array.isArray(config.plugins)) {
      config.plugins = config.plugins.filter(
        (p) => p && p.constructor && p.constructor.name !== 'ReactRefreshWebpackPlugin'
      );
    }
    return config;
  },
};

export default nextConfig;
