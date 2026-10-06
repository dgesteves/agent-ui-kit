import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  // Every export is a client component or hook; mark the bundle for RSC frameworks.
  banner: { js: "'use client';" },
});
