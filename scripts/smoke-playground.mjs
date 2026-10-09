// Checks the built playground: link preview metadata and llms.txt, then in Chrome what a visitor
// sees first on a phone, what the header offers when it was built without a model key
// (OPENAI_API_KEY, as in CI), and the gallery.
//
//   pnpm build:lib && pnpm registry:build && pnpm build:playground
//   pnpm smoke:playground   # starts the built playground on :3220, or tests BASE_URL if set
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const PORT = 3220;
const BASE = process.env.BASE_URL ?? `http://localhost:${PORT}`;

let server;
if (!process.env.BASE_URL) {
  server = spawn('pnpm', ['exec', 'next', 'start', '--port', String(PORT)], {
    cwd: join(import.meta.dirname, '../examples/playground'),
    stdio: 'inherit',
    detached: true,
  });
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      if (attempt > 60) throw new Error(`The playground did not start on ${BASE}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const browser = await chromium.launch({ channel: 'chrome' });
let failed = false;
const check = (ok, label, detail = '') => {
  failed ||= !ok;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${label}${ok || !detail ? '' : `: ${detail}`}`);
};

try {
  // Link previews: each page has its title, description and a 1200×630 image that is served.
  for (const [path, title] of [
    ['/', 'agent-ui-kit · playground'],
    ['/gallery', 'agent-ui-kit · components'],
  ]) {
    const html = await (await fetch(BASE + path)).text();
    const meta = (key) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];
    const image = meta('og:image');
    const served = image ? await fetch(BASE + new URL(image).pathname + new URL(image).search) : undefined;
    check(
      meta('og:title') === title &&
        !!meta('og:description') &&
        meta('twitter:card') === 'summary_large_image' &&
        served?.headers.get('content-type') === 'image/png',
      `${path}: Open Graph and Twitter metadata with an image`,
      `og:title ${meta('og:title')}, og:image ${image} (${served?.status})`,
    );
  }

  // Docs for LLMs, built from the README and the registry.
  for (const [path, heading] of [
    ['/llms.txt', '## Components'],
    ['/llms-full.txt', '## shadcn registry items'],
  ]) {
    const response = await fetch(BASE + path);
    const text = await response.text();
    check(
      response.ok &&
        response.headers.get('content-type')?.startsWith('text/plain') &&
        text.startsWith('# agent-ui-kit\n') &&
        text.includes(heading) &&
        !/<img|\]\((?!https?:)/.test(text),
      `${path}: plain markdown with absolute links`,
      `${response.status} ${response.headers.get('content-type')}`,
    );
  }

  // On a phone the run starts on load and grows past the screen; the page must not follow it
  // (and scroll the headline away) until the reader scrolls down or starts a run.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await phone.goto(BASE, { waitUntil: 'networkidle' });
  await phone.waitForFunction(
    () =>
      document.querySelectorAll('[data-slot="tool-call-trigger"]').length >= 3 &&
      document.documentElement.scrollHeight > innerHeight * 1.5,
    null,
    { timeout: 60_000 },
  );
  const scrollY = await phone.evaluate(() => scrollY);
  check(scrollY === 0, 'phone: the page stays on the headline while the run streams', `scrolled to ${scrollY}px`);
  check((await phone.getByRole('radio', { name: 'Live' }).count()) === 0, 'header: no Live mode without a model key');
  await phone.close();

  // The gallery: npm snippets that bring the styles, and frames that switch to the light palette
  // with no axe violations (contrast included).
  const gallery = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await gallery.goto(`${BASE}/gallery`, { waitUntil: 'networkidle' });
  const snippets = await gallery.locator('pre').allInnerTexts();
  check(
    snippets.some((text) => text.includes("import '@dgesteves/agent-ui-kit/styles.css';")),
    'gallery: the npm snippets import the styles',
  );
  await gallery.getByRole('radio', { name: 'light' }).click();
  const frame = await gallery.$eval('[data-shot="approval-card"]', (el) => getComputedStyle(el).backgroundColor);
  check(frame === 'rgb(255, 255, 255)', 'gallery: the light toggle switches the frames', frame);
  await gallery.waitForTimeout(800);
  const require = createRequire(join(import.meta.dirname, '../packages/agent-ui-kit/package.json'));
  await gallery.addScriptTag({ content: readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') });
  const violations = await gallery.evaluate(async () =>
    (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(', ')}`,
    ),
  );
  check(violations.length === 0, 'gallery, light: no axe violations', violations.join('; '));
  await gallery.close();

  // On a phone, diff hunks, code and the compact run meter scroll sideways: each must be reachable
  // from the keyboard while it does (axe's scrollable-region-focusable, WCAG 2.1.1).
  const narrow = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await narrow.goto(`${BASE}/gallery`, { waitUntil: 'networkidle' });
  await narrow.waitForTimeout(800);
  await narrow.addScriptTag({ content: readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') });
  const unreachable = await narrow.evaluate(async () =>
    (
      await window.axe.run(document, { runOnly: ['scrollable-region-focusable'], resultTypes: ['violations'] })
    ).violations.flatMap((v) => v.nodes.map((n) => n.target.join(' '))),
  );
  check(unreachable.length === 0, 'gallery, 390px: every sideways scroller is reachable', unreachable.join(', '));
  await narrow.close();
} finally {
  await browser.close();
  if (server) process.kill(-server.pid);
}
if (failed) process.exit(1);
