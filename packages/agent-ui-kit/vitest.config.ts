import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
    // `pnpm test:coverage`. The suite is deterministic, so coverage is too: the thresholds sit a
    // point or two under it, to catch code that lands without tests.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'json-summary', 'html'],
      // Also when a test fails, for the CI job summary.
      reportOnFailure: true,
      thresholds: { statements: 92, branches: 87, functions: 92, lines: 94 },
    },
  },
});
