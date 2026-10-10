// How DiffReview holds up on large files, in Chrome with React's production build: the audit's
// cases (local edits to 1,000 and 5,000 lines, full rewrites of 2,000 and 5,000) and the 5,000-line
// rewrite in split view. For each: the first render, the time until every file is compared and on
// screen, the longest task that blocked the page, the DOM it leaves, one keyboard decision, and
// paging through the whole review a screen per frame.
//
// Each metric has a budget, a few times what a laptop measures so CI runners pass with room; CI
// fails when a case goes over. The old behaviour (a 5,000-line rewrite blocking for 3 s, 260k DOM
// nodes) is far outside every budget.
//
//   pnpm build:lib && pnpm perf
//   node scripts/perf.mjs --dist <other checkout>/packages/signoff-ui/dist --no-budget   # compare
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { build } from 'rolldown';

// However the browser behaves, the check ends: a stuck case fails it rather than the CI job's clock.
setTimeout(() => {
  console.error('perf: no result after 8 minutes');
  process.exit(1);
}, 8 * 60_000).unref();

const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};
const dist = resolve(arg('--dist') ?? join(import.meta.dirname, '../packages/signoff-ui/dist'));
const enforce = !process.argv.includes('--no-budget');
const json = process.argv.includes('--json');

// [label, query, budgets]. Times in ms; DOM in elements.
const CASES = [
  ['local edit, 1,000 lines', 's=local&n=1000', { readyMs: 400, longestTaskMs: 250, domNodes: 15_000, keyMs: 40 }],
  ['local edit, 5,000 lines', 's=local&n=5000', { readyMs: 800, longestTaskMs: 250, domNodes: 20_000, keyMs: 40 }],
  ['full rewrite, 2,000 lines', 's=rewrite&n=2000', { readyMs: 1000, longestTaskMs: 250, domNodes: 15_000, keyMs: 40 }],
  ['full rewrite, 5,000 lines', 's=rewrite&n=5000', { readyMs: 1500, longestTaskMs: 250, domNodes: 15_000, keyMs: 40 }],
  [
    'full rewrite, 5,000 lines, split',
    's=rewrite&n=5000&view=split',
    { readyMs: 1500, longestTaskMs: 250, domNodes: 15_000, keyMs: 40 },
  ],
];
const SCROLL_BUDGET = { scrollFrameP95Ms: 120, scrollLongestTaskMs: 250 };

// Bundle the harness against the built package, with the React that package resolves.
const pkg = createRequire(join(dist, '../package.json'));
const out = mkdtempSync(join(tmpdir(), 'signoff-perf-'));
const reactDir = dirname(pkg.resolve('react/package.json'));
const reactDomDir = dirname(pkg.resolve('react-dom/package.json'));
await build({
  input: join(import.meta.dirname, 'perf/harness.mjs'),
  platform: 'browser',
  logLevel: 'silent',
  resolve: { alias: { 'signoff-ui': join(dist, 'index.js'), react: reactDir, 'react-dom': reactDomDir } },
  transform: { define: { 'process.env.NODE_ENV': '"production"' } },
  output: { dir: out, format: 'esm', entryFileNames: 'harness.js', minify: true },
});
// The package starts its diff worker from `new URL('./diff-worker.js', import.meta.url)`, which a
// bundler with worker support emits on its own. Here the worker is built beside the page instead.
const worker = join(dist, 'lib/diff-worker.js');
if (existsSync(worker)) {
  await build({
    input: worker,
    platform: 'browser',
    logLevel: 'silent',
    output: { dir: out, format: 'esm', entryFileNames: 'diff-worker.js', minify: true },
  });
}
copyFileSync(join(dist, 'styles.css'), join(out, 'styles.css'));
writeFileSync(
  join(out, 'index.html'),
  '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css">' +
    '<style>body{margin:0;padding:24px;background:#0d0f12}</style></head>' +
    '<body><div id="root"></div><script type="module" src="harness.js"></script></body></html>',
);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const file = join(out, path === '/' ? 'index.html' : path);
  if (!file.startsWith(out) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, done));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const over = [];
try {
  for (const [label, query, budget] of CASES) {
    const started = Date.now();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(90_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/?${query}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__perf, null, { polling: 100 });
    const result = await page.evaluate(() => window.__perf);
    await page.close();
    if (errors.length || result.error)
      throw new Error(`${label}: ${[result.error, ...errors].filter(Boolean).join('; ')}`);
    console.error(`perf: ${label} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    const budgets = { ...budget, ...SCROLL_BUDGET };
    for (const [metric, limit] of Object.entries(budgets)) {
      if (result[metric] > limit) over.push(`${label}: ${metric} ${Math.round(result[metric])}, budget ${limit}`);
    }
    results.push({ label, ...result, budgets });
  }
} finally {
  await browser.close();
  server.close();
  rmSync(out, { recursive: true, force: true });
}

const ms = (value) => `${Math.round(value)} ms`;
const count = (value) => value.toLocaleString('en-US');
if (json) console.log(JSON.stringify(results, null, 2));
else {
  console.log(
    '| Case | First render | Ready | Longest task | DOM nodes | Keypress | Scroll p95 frame | DOM after scrolling |',
  );
  console.log('| --- | --: | --: | --: | --: | --: | --: | --: |');
  for (const r of results) {
    console.log(
      `| ${r.label} | ${ms(r.mountMs)} | ${ms(r.readyMs)} | ${ms(r.longestTaskMs)} | ${count(r.domNodes)} | ${r.keyMs.toFixed(1)} ms | ${ms(r.scrollFrameP95Ms)} | ${count(r.domNodesAfterScroll)} |`,
    );
  }
}
if (enforce && over.length) {
  console.error(
    `\nOver budget (raise it in scripts/perf.mjs only if the slowdown is worth it):\n  ${over.join('\n  ')}`,
  );
  process.exit(1);
}
process.exit(0);
