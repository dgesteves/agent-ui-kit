import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/core.ts'],
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  // One output module per source module, so each keeps its own 'use client'
  // directive: components and hooks are client modules, while the entries and
  // the pure helpers are not and stay callable from Server Components.
  // scripts/check-directives.mjs verifies the output after every build.
  unbundle: true,
  // Rolldown warns that directives may be lost when modules are merged; unbundled, they are kept.
  suppressWarnings: 'module level directive "use client"',
});
