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
import { runCases } from './perf/deadline.ts';

// Each case has two minutes, and one more try in a new browser (scripts/perf/deadline.ts). This is
// the backstop: however the browser behaves, the check ends before the CI job's clock does.
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

// [label, query, budgets]. Times in ms; DOM in elements. A local edit renders its hunks in its first
// task (20 and 100 of them, each with decision and comment buttons and the bar of unchanged lines
// around it): about 70 and 90 ms on a laptop, and up to about 310 ms on a shared CI runner.
const CASES = [
  ['local edit, 1,000 lines', 's=local&n=1000', { readyMs: 400, longestTaskMs: 400, domNodes: 15_000, keyMs: 40 }],
  ['local edit, 5,000 lines', 's=local&n=5000', { readyMs: 800, longestTaskMs: 400, domNodes: 20_000, keyMs: 40 }],
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
const LOADED = "console.log('perf: diff worker loaded');";
// The package starts its diff worker from `new URL('./diff-worker.js', import.meta.url)`, which a
// bundler with worker support emits on its own. Here the worker is built beside the page instead.
const worker = join(dist, 'lib/diff-worker.js');
if (existsSync(worker)) {
  await build({
    input: worker,
    platform: 'browser',
    logLevel: 'silent',
    // Once it can answer: a case that stalls says whether its worker got this far.
    output: { dir: out, format: 'esm', entryFileNames: 'diff-worker.js', minify: true, footer: LOADED },
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

/**
 * Chrome, in a process the check can kill. Playwright's `browser.close()` waits for the browser to
 * exit and has no timeout of its own, so a browser that stops answering would hang it.
 */
async function launch() {
  const server = await chromium.launchServer({ channel: 'chrome' });
  const browser = await chromium.connect(server.wsEndpoint());
  const chrome = server.process();
  return {
    browser,
    close: () => server.close(),
    kill() {
      // Its renderers too: Playwright starts Chrome as the leader of a process group.
      try {
        process.kill(-chrome.pid, 'SIGKILL');
      } catch {
        chrome.kill('SIGKILL');
      }
    },
  };
}

/** What a case's page and its worker report, a line each, timed from the start of the case. */
function record(page, log) {
  const started = Date.now();
  const add = (line) => log.push(`${((Date.now() - started) / 1000).toFixed(1)} s ${line}`);
  page.on('console', (message) => add(`console.${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => add(`pageerror: ${error.message}`));
  page.on('crash', () => add('the page crashed'));
  page.on('requestfailed', (request) => add(`request failed: ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', (response) => response.status() >= 400 && add(`${response.status()} for ${response.url()}`));
  page.on('worker', (worker) => {
    add(`worker attached: ${worker.url()}`);
    worker.on('close', () => add(`worker closed: ${worker.url()}`));
  });
}

/**
 * Where a case's main-thread time went, from a Chrome trace of loading it again: self time by
 * kind (script, style, layout, paint, garbage collection) and the busiest trace events. Printed
 * for a case over budget, so a CI failure says what to look at.
 */
async function whereTimeWent(browser, query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const cdp = await page.context().newCDPSession(page);
  const events = [];
  cdp.on('Tracing.dataCollected', ({ value }) => events.push(...value));
  const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8', transferMode: 'ReportEvents' });
  await page.goto(`${base}/?${query}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__perf, null, { polling: 100 });
  await cdp.send('Tracing.end');
  await done;
  await page.close();
  const mains = new Set(
    events
      .filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
      .map((e) => `${e.pid}:${e.tid}`),
  );
  const slices = events
    .filter((e) => e.ph === 'X' && mains.has(`${e.pid}:${e.tid}`) && e.dur > 0)
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  // Self time: an event's duration less its children's, on each thread's stack.
  const self = new Map();
  const stacks = new Map();
  for (const event of slices) {
    const key = `${event.pid}:${event.tid}`;
    const stack = stacks.get(key) ?? [];
    stacks.set(key, stack);
    while (stack.length && stack.at(-1).ts + stack.at(-1).dur <= event.ts) stack.pop();
    const parent = stack.at(-1);
    if (parent) self.set(parent, (self.get(parent) ?? 0) - Math.min(event.dur, parent.ts + parent.dur - event.ts));
    self.set(event, (self.get(event) ?? 0) + event.dur);
    stack.push(event);
  }
  const KIND = [
    ['style', /UpdateLayoutTree|RecalculateStyles|ParseAuthorStyleSheet|ScheduleStyleRecalculation/],
    ['layout', /^Layout$|UpdateLayerTree|IntersectionObserverController/],
    ['paint', /Paint|Layerize|Commit|CompositeLayers|UpdateLayer/],
    ['gc', /GC|Scavenge|MarkCompact/i],
  ];
  const kinds = new Map();
  const names = new Map();
  for (const [event, time] of self) {
    const kind = KIND.find(([, re]) => re.test(event.name))?.[0] ?? 'script and other';
    kinds.set(kind, (kinds.get(kind) ?? 0) + time);
    names.set(event.name, (names.get(event.name) ?? 0) + time);
  }
  const top = (map, n) =>
    [...map]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, us]) => `${name} ${Math.round(us / 1000)} ms`)
      .join(', ');
  return `${top(kinds, 5)}\n    busiest: ${top(names, 8)}`;
}

/** One case: its measurements, the budgets they go over, and if any, where the time went. */
async function measure({ browser }, { label, query, budget }, log) {
  const started = Date.now();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(90_000);
  const errors = [];
  record(page, log);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/?${query}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__perf, null, { polling: 100 });
  const result = await page.evaluate(() => window.__perf);
  await page.close();
  if (errors.length || result.error)
    throw new Error([...new Set([result.error, ...errors])].filter(Boolean).join('; '));
  console.error(`perf: ${label} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const budgets = { ...budget, ...SCROLL_BUDGET };
  const over = Object.entries(budgets)
    .filter(([metric, limit]) => result[metric] > limit)
    .map(([metric, limit]) => `${label}: ${metric} ${Math.round(result[metric])}, budget ${limit}`);
  const breakdown = enforce && over.length ? `${label}: ${await whereTimeWent(browser, query)}` : undefined;
  return { result: { label, ...result, budgets }, over, breakdown };
}

let measured;
try {
  measured = await runCases(
    CASES.map(([label, query, budget]) => ({ label, query, budget })),
    {
      launch,
      run: measure,
      // Playwright's own timeouts, and a crashed page, count as a stuck browser too: worth one more try.
      stalled: (error) => error.name === 'TimeoutError' || /crashed/i.test(error.message),
    },
  );
} catch (error) {
  console.error(error.message);
} finally {
  server.close();
  rmSync(out, { recursive: true, force: true });
}
if (!measured) process.exit(1);
const results = measured.map((m) => m.result);
const over = measured.flatMap((m) => m.over);
const breakdowns = measured.map((m) => m.breakdown).filter(Boolean);

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
  if (breakdowns.length)
    console.error(`\nWhere the main thread's time went, loading each again:\n  ${breakdowns.join('\n  ')}`);
  process.exit(1);
}
process.exit(0);
