// The page scripts/perf.mjs loads in Chrome: one DiffReview, timed from the first render until
// every file is compared and on screen. Bundled with Rolldown against the built package.
import { createElement as h } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { DiffReview } from 'signoff-ui';

const params = new URLSearchParams(location.search);
const scenario = params.get('s') ?? 'local';
const n = Number(params.get('n') ?? 1000);
const view = params.get('view') ?? 'unified';

const lines = (count, prefix) =>
  Array.from(
    { length: count },
    (_, i) => `export const ${prefix}${i} = compute(${i}, "value ${i}") + other(${i * 3});`,
  );

// The audit's cases: a local edit changes every 50th line, a full rewrite changes every line.
const old = lines(n, 'a');
const next =
  scenario === 'local' ? old.map((l, i) => (i % 50 === 0 ? l.replace('other', 'another') : l)) : lines(n, 'b');
const files = [{ path: 'src/big.ts', oldContent: old.join('\n') + '\n', newContent: next.join('\n') + '\n' }];

const longTasks = [];
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) longTasks.push(entry.duration);
}).observe({ type: 'longtask', buffered: false });

const container = document.getElementById('root');
const root = createRoot(container);
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const time = (fn) => {
  const t = performance.now();
  flushSync(fn);
  return performance.now() - t;
};

const result = {};
const start = performance.now();
result.mountMs = time(() => root.render(h(DiffReview, { files, view, onSubmit() {} })));
// Ready: every file compared (none busy) and the hunks on the page.
const hunkSelector = '[data-slot="signoff-diff-hunk"]';
for (;;) {
  if (container.querySelector(hunkSelector) && !container.querySelector('[aria-busy="true"]')) break;
  await frame();
}
result.readyMs = performance.now() - start;
await frame();
await frame();
await new Promise((resolve) => setTimeout(resolve, 300));
result.domNodes = container.querySelectorAll('*').length;
result.longestTaskMs = Math.max(0, ...longTasks);

// Accept a hunk from the keyboard, five times: each decision re-renders the review.
const keys = [];
for (let i = 0; i < 5; i++) {
  const hunk = container.querySelector(`${hunkSelector}[tabindex="0"]`);
  hunk.focus();
  keys.push(time(() => hunk.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))));
  await frame();
}
result.keyMs = keys.sort((a, b) => a - b)[2];

// Scroll through the whole review, a screen per frame: what a reader paging down meets.
longTasks.length = 0;
const frames = [];
let last = performance.now();
for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
  scrollTo(0, y);
  await frame();
  const now = performance.now();
  frames.push(now - last);
  last = now;
}
frames.sort((a, b) => a - b);
result.scrollFrameP95Ms = frames[Math.floor(frames.length * 0.95)] ?? 0;
result.scrollLongestTaskMs = Math.max(0, ...longTasks);
result.domNodesAfterScroll = container.querySelectorAll('*').length;

window.__perf = result;
