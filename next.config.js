/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    NEXT_PUBLIC_APP_VERSION: require('./package.json').version,
    // AI usage resources (comma-separated): their entries are AI cost, never hours
    THYME_AI_RESOURCES: process.env.THYME_AI_RESOURCES || 'AI-USAGE',
  },
};

module.exports = nextConfig;
