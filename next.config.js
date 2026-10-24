// Thyme was renamed Timmie: the old hosts permanently redirect to the new ones, keeping the path
const LEGACY_HOST_REDIRECTS = [
  { from: 'getthyme.ai', to: 'https://gettimm.ie' },
  { from: 'www.getthyme.ai', to: 'https://gettimm.ie' },
  { from: 'thyme.knowall.ai', to: 'https://timmie.knowall.ai' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    NEXT_PUBLIC_APP_VERSION: require('./package.json').version,
  },
  async redirects() {
    return LEGACY_HOST_REDIRECTS.map(({ from, to }) => ({
      source: '/:path*',
      has: [{ type: 'host', value: from }],
      destination: `${to}/:path*`,
      permanent: true,
    }));
  },
};

module.exports = nextConfig;
