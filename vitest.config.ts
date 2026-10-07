import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Run unit tests in UK time whatever the machine's timezone (CI is UTC), so date
// tests behave the same everywhere and BST (UTC+1) bugs show up. Set before the
// workers start: they don't pick up a TZ change made from inside a test file.
process.env.TZ = 'Europe/London';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/unit/setup.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
