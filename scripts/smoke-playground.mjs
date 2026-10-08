// Checks the built playground: link preview metadata, then in Chrome what a visitor sees first on
// a phone, and what the header offers when it was built without a model key (OPENAI_API_KEY), as in CI.
//
//   pnpm build:lib && pnpm registry:build && pnpm build:playground
//   pnpm smoke:playground   # starts the built playground on :3220, or tests BASE_URL if set
import { spawn } from 'node:child_process';
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
} finally {
  await browser.close();
  if (server) process.kill(-server.pid);
}
if (failed) process.exit(1);
