import nextConfig from 'eslint-config-next';

const config = [
  ...nextConfig,
  {
    ignores: ['node_modules/**', 'public/**'],
  },
  {
    // Downgrade new strict rules to warnings for migration compatibility
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
];

export default config;
