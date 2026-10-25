// Thyme was renamed Timmie: the old hosts permanently redirect to the new ones, keeping the path
const LEGACY_HOST_REDIRECTS = [
  { from: 'getthyme.ai', to: 'https://gettimm.ie' },
  { from: 'www.getthyme.ai', to: 'https://gettimm.ie' },
  { from: 'thyme.knowall.ai', to: 'https://timmie.knowall.ai' },
  // One origin for the app, so sign-in and saved settings aren't split across two
  { from: 'www.gettimm.ie', to: 'https://gettimm.ie' },
];

/**
 * Headers sent on every response, static assets included. The Content-Security-Policy
 * is per-request (it carries a nonce), so it's set in src/proxy.ts instead.
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  // SAMEORIGIN rather than DENY: MSAL's silent sign-in loads Timmie's own origin in a
  // hidden iframe. Nothing else (Teams, Business Central) embeds Timmie.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: require('./package.json').version,
  },
  async redirects() {
    return [
      // Host redirects first, so a legacy host lands on the new host before anything else
      ...LEGACY_HOST_REDIRECTS.map(({ from, to }) => ({
        source: '/:path*',
        has: [{ type: 'host', value: from }],
        destination: `${to}/:path*`,
        permanent: true,
      })),
      // RFC 9116 only requires /.well-known/security.txt, but many tools still try the root
      { source: '/security.txt', destination: '/.well-known/security.txt', permanent: true },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
