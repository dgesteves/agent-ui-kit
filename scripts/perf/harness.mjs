// The page scripts/perf.mjs loads in Chrome: one DiffReview, timed from the first render until
// every file is compared and on screen. Bundled with Rolldown against the built package.
import { createElement as h } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { DiffReview } from 'signoff-ui';

// Where the page got to, for scripts/perf.mjs to print if the case stalls: the console reaches it as
// it goes, even when the page stops answering later.
const step = (what) => console.log(`perf: ${what}`);

// The diff worker DiffReview starts for a large file: whether it was created, failed or answered.
const NativeWorker = globalThis.Worker;
globalThis.Worker = class extends NativeWorker {
  constructor(url, options) {
    super(url, options);
    step(`diff worker created from ${url}`);
    this.addEventListener('error', (event) =>
      step(`diff worker failed: ${event.message ?? 'its script did not load'}`),
    );
    this.addEventListener('messageerror', () => step('diff worker sent a message that could not be read'));
    this.addEventListener('message', () => step('diff worker answered'), { once: true });
  }

  postMessage(...args) {
    step('diff worker asked');
    super.postMessage(...args);
  }
};

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
// A frame, or 100 ms if the browser stops painting the page: the harness never waits forever.
const frame = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
    setTimeout(resolve, 100);
  });
const time = (fn) => {
  const t = performance.now();
  flushSync(fn);
  return performance.now() - t;
};

const result = {};
const start = performance.now();
result.mountMs = time(() => root.render(h(DiffReview, { files, view, onSubmit() {} })));
step(`rendered in ${Math.round(result.mountMs)} ms`);
// Ready: every file compared (none busy) and the hunks on the page.
const hunkSelector = '[data-slot="signoff-diff-hunk"]';
for (;;) {
  if (container.querySelector(hunkSelector) && !container.querySelector('[aria-busy="true"]')) break;
  if (performance.now() - start > 60_000) {
    window.__perf = { error: 'the review was not ready after 60 s' };
    throw new Error(window.__perf.error);
  }
  await frame();
}
result.readyMs = performance.now() - start;
step(`ready in ${Math.round(result.readyMs)} ms`);
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
step('decided five hunks from the keyboard');

// Scroll through the whole review, a screen per frame: what a reader paging down meets.
longTasks.length = 0;
const frames = [];
let last = performance.now();
const page = Math.max(innerHeight, 200);
for (let y = 0, n = 0; y < document.documentElement.scrollHeight && n < 400; y += page, n++) {
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
step(`scrolled through in ${frames.length} frames`);

window.__perf = result;
