// What each component adds to an app's JavaScript: the built package bundled per import with
// Rolldown, React and React DOM external (the app has them anyway), minified, then gzipped.
// Dependencies count (react-markdown, jsdiff, Radix, tailwind-merge...), and shared ones are
// counted again in every row; CSS is not included.
//
//   pnpm build:lib && pnpm size
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'rolldown';

const dist = join(import.meta.dirname, '../packages/agent-ui-kit/dist');
const index = JSON.stringify(join(dist, 'index.js'));
const core = JSON.stringify(join(dist, 'core.js'));
const rows = [
  ['`addUsage`, `estimateCost` (`/core`, for a route)', `export { addUsage, estimateCost } from ${core};`],
  ['`applyHunks`, `parseFileChange` (`/core`, with jsdiff)', `export { applyHunks, parseFileChange } from ${core};`],
  ['`Sources`', `export { Sources } from ${index};`],
  ['`AgentStatus`', `export { AgentStatus, deriveAgentState } from ${index};`],
  ['`RunMeter`', `export { RunMeter, useRunTiming } from ${index};`],
  ['`ApprovalCard`', `export { ApprovalCard, ToolApprovalCard } from ${index};`],
  ['`ToolCallTimeline`', `export { ToolCallTimeline } from ${index};`],
  ['`DiffReview`', `export { DiffReview } from ${index};`],
  ['`AgentMessage` (with markdown, reasoning, timeline, approvals, sources)', `export { AgentMessage } from ${index};`],
  ['`useAgUiAgent` (`/ag-ui`)', `export * from ${JSON.stringify(join(dist, 'ag-ui.js'))};`],
  ['Everything in the main entry', `export * from ${index};`],
];

const dir = mkdtempSync(join(tmpdir(), 'aui-size-'));
try {
  console.log('| Import | Minified | Gzipped |\n| --- | --: | --: |');
  for (const [label, source] of rows) {
    const entry = join(dir, 'entry.js');
    writeFileSync(entry, source);
    const { output } = await build({
      input: entry,
      external: [/^react($|\/)/, /^react-dom($|\/)/],
      platform: 'browser',
      logLevel: 'silent',
      write: false,
      output: { format: 'esm', minify: true },
    });
    const code = output.map((chunk) => (chunk.type === 'chunk' ? chunk.code : '')).join('');
    const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
    console.log(`| ${label} | ${kb(Buffer.byteLength(code))} | ${kb(gzipSync(code).length)} |`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
