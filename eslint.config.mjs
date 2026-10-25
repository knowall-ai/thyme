import nextConfig from 'eslint-config-next';

const config = [
  ...nextConfig,
  {
    ignores: ['node_modules/**', 'public/**', '.next/**', '.turbo/**', 'coverage/**'],
  },
  {
    // Downgrade new strict rules to warnings for migration compatibility
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  // Ask Timmie, the public helper, must never be able to reach Business Central, sign-in,
  // Graph, settings, the enquiry mailer or anything else in the signed-in app. See
  // docs/PUBLIC_ASSISTANT.adoc; tests/unit/public-timmie/isolation.test.ts checks the full
  // import graph too.
  {
    files: [
      'src/app/api/public/**',
      'src/services/public-timmie/**',
      'src/components/public-timmie/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/services/auth',
                '@/services/auth/**',
                '@/services/bc',
                '@/services/bc/**',
                '@/services/health',
                '@/services/health/**',
                '@/services/contact/graphMail',
                '@/services/contact/enquiry',
                '@/hooks',
                '@/hooks/**',
                '@/config',
                '@/config/**',
                '@/components/layout',
                '@/components/layout/**',
                '@/components/settings/**',
                '@/components/access/**',
                '**/services/auth/**',
                '**/services/bc/**',
                '**/hooks/**',
                '@azure/msal-browser',
                '@azure/msal-react',
                'jose',
              ],
              message:
                'Ask Timmie (the public helper) must not import sign-in, Business Central, Graph, settings or the signed-in app.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
