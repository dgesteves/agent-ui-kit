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

export default defineConfig({
  entry: ['src/index.ts', 'src/core.ts', 'src/ag-ui.ts'],
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
  plugins: [noDeclarationMapReferences],
});
