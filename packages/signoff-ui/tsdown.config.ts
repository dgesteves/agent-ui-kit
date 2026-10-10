import { defineConfig, type TsdownPlugin } from 'tsdown';

/**
 * Declaration maps would point into src/, which is not published, so none are emitted; drop the
 * `sourceMappingURL` comments the .d.ts chunks still get. scripts/check-dist.mjs checks the rest.
 */
const noDeclarationMapReferences: TsdownPlugin = {
  name: 'no-declaration-map-references',
  generateBundle(_, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type === 'chunk' && chunk.fileName.endsWith('.d.ts'))
        chunk.code = chunk.code.replace(/\n\/\/# sourceMappingURL=\S+\.d\.ts\.map\s*$/, '\n');
    }
  },
};

/**
 * The diff worker is started with `new URL('./diff-worker.ts', import.meta.url)`: the source as it
 * is, for apps that copy it from the shadcn registry and bundle it themselves. The package ships
 * JavaScript, so its URL names the built file. Same length, so the source maps still line up.
 */
const workerUrls: TsdownPlugin = {
  name: 'worker-urls',
  generateBundle(_, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type === 'chunk' && chunk.fileName.endsWith('.js'))
        chunk.code = chunk.code.replace(
          /new URL\((["'])(\.\/[\w-]+)\.ts\1, import\.meta\.url\)/g,
          'new URL($1$2.js$1, import.meta.url)',
        );
    }
  },
};

export default defineConfig({
  // The diff worker is an entry of its own: nothing imports it, DiffReview starts it by URL.
  entry: ['src/index.ts', 'src/core.ts', 'src/ag-ui.ts', 'src/assistant-ui.ts', 'src/lib/diff-worker.ts'],
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
  plugins: [noDeclarationMapReferences, workerUrls],
});
