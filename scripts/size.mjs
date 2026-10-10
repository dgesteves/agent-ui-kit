// What each component adds to an app's JavaScript: the built package bundled per import with
// Rolldown, React and React DOM external (the app has them anyway), minified, then gzipped.
// Dependencies count (react-markdown, jsdiff, Radix, tailwind-merge...), and shared ones are
// counted again in every row; CSS is not included.
//
// Each row has a budget, in gzipped kB, about 5% over its size: CI fails when an import outgrows
// it. Raise a budget here, in the same pull request, when the growth is worth it.
//
//   pnpm build:lib && pnpm size
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'rolldown';

const dist = join(import.meta.dirname, '../packages/signoff-ui/dist');
const index = JSON.stringify(join(dist, 'index.js'));
const core = JSON.stringify(join(dist, 'core.js'));
const rows = [
  ['`addUsage`, `estimateCost` (`/core`, for a route)', `export { addUsage, estimateCost } from ${core};`, 0.5],
  ['`applyHunks`, `parseFileChange` (`/core`, with jsdiff)', `export { applyHunks, parseFileChange } from ${core};`, 7],
  ['`Sources`', `export { Sources } from ${index};`, 10.5],
  ['`AgentStatus`', `export { AgentStatus, deriveAgentState } from ${index};`, 11.8],
  ['`RunMeter`', `export { RunMeter, useRunTiming } from ${index};`, 13],
  ['`ApprovalCard`', `export { ApprovalCard, ToolApprovalCard } from ${index};`, 18.5],
  ['`useApprovalPolicy` (no markup)', `export { useApprovalPolicy } from ${index};`, 2],
  ['`toToolApproval` (`/core`, for a route)', `export { toToolApproval } from ${core};`, 1],
  ['`ToolCallTimeline`', `export { ToolCallTimeline } from ${index};`, 20.5],
  ['`DiffReview`', `export { DiffReview } from ${index};`, 42.5],
  ['`useDiffReview` (no markup)', `export { useDiffReview } from ${index};`, 16],
  [
    '`AgentMessage` (with markdown, reasoning, timeline, approvals, sources)',
    `export { AgentMessage } from ${index};`,
    85.5,
  ],
  ['`useAgUiAgent` (`/ag-ui`)', `export * from ${JSON.stringify(join(dist, 'ag-ui.js'))};`, 3],
  ['ACP converters (`/acp`)', `export * from ${JSON.stringify(join(dist, 'acp.js'))};`, 1.8],
  [
    '`signoffTools` (`/assistant-ui`, with DiffReview and the approval card)',
    `export * from ${JSON.stringify(join(dist, 'assistant-ui.js'))};`,
    52.5,
  ],
  ['Everything in the main entry', `export * from ${index};`, 122.5],
];

const overBudget = [];
const dir = mkdtempSync(join(tmpdir(), 'signoff-size-'));
try {
  console.log('| Import | Minified | Gzipped | Budget |\n| --- | --: | --: | --: |');
  for (const [label, source, budget] of rows) {
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
    const gzipped = gzipSync(code).length;
    const over = gzipped > budget * 1024;
    if (over) overBudget.push(`${label}: ${kb(gzipped)}, budget ${budget} kB`);
    console.log(
      `| ${label} | ${kb(Buffer.byteLength(code))} | ${kb(gzipped)} | ${budget} kB${over ? ' (over)' : ''} |`,
    );
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (overBudget.length > 0) {
  console.error(
    `\nOver budget (raise it in scripts/size.mjs if the growth is worth it):\n  ${overBudget.join('\n  ')}`,
  );
  process.exit(1);
}
