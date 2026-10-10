// Prints the test coverage that `pnpm test:coverage` measured as a Markdown table, for the CI job
// summary: the totals against their thresholds, then each file, least covered first.
//
//   pnpm test:coverage && pnpm coverage:summary
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const pkg = join(import.meta.dirname, '../packages/agent-ui-kit');
const file = join(pkg, 'coverage/coverage-summary.json');
if (!existsSync(file)) {
  console.log('## Test coverage\n\nNo coverage report: the test run did not finish.');
  process.exit(0);
}
const summary = JSON.parse(readFileSync(file, 'utf8'));
const metrics = ['statements', 'branches', 'functions', 'lines'];
const pct = (entry) => `${entry.pct.toFixed(1)}%`;

const lines = [
  '## Test coverage',
  '',
  '| | Statements | Branches | Functions | Lines |',
  '| --- | --: | --: | --: | --: |',
];
lines.push(`| **All files** | ${metrics.map((m) => `**${pct(summary.total[m])}**`).join(' | ')} |`);
const files = Object.entries(summary)
  .filter(([file]) => file !== 'total')
  .sort(([, a], [, b]) => a.lines.pct - b.lines.pct);
for (const [file, entry] of files) {
  lines.push(`| \`${relative(pkg, file)}\` | ${metrics.map((m) => pct(entry[m])).join(' | ')} |`);
}
console.log(lines.join('\n'));
