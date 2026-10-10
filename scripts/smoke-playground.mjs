// Checks the built playground: link preview metadata and llms.txt, then in Chrome what a visitor
// sees first on a phone, what the header offers when it was built without a model key
// (OPENAI_API_KEY, as in CI), the phone menu, and the gallery.
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
    ['/', 'signoff-ui: review what your agent changed and control what it may do'],
    ['/gallery', 'Components · signoff-ui'],
    ['/docs/getting-started', 'Getting started · signoff-ui docs'],
    ['/docs/components/approval-card', 'ApprovalCard · signoff-ui docs'],
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

  // Every page in the sitemap, which robots.txt points to.
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  check(
    ['/docs/getting-started', '/docs/components/approval-card', '/gallery'].every((path) =>
      sitemap.includes(`https://agent-ui-kit-demo.vercel.app${path}</loc>`),
    ) && robots.includes('Sitemap: https://agent-ui-kit-demo.vercel.app/sitemap.xml'),
    'sitemap.xml lists the docs and components, and robots.txt points to it',
  );

  // Docs for LLMs, built from the README, the docs and the registry: no HTML, and every component described
  // in words (its screenshot's indented <source srcset> lines once stood in for the description).
  for (const [path, heading] of [
    ['/llms.txt', '## Components'],
    ['/llms-full.txt', '## shadcn registry items'],
  ]) {
    const response = await fetch(BASE + path);
    const text = await response.text();
    // Code shows JSX and element names, which is fine; the prose around it has no HTML.
    const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    const html = /<\/?(?:img|picture|source|p|div|br)\b[^>]*>/.exec(prose)?.[0];
    check(
      response.ok &&
        response.headers.get('content-type')?.startsWith('text/plain') &&
        text.startsWith('# signoff-ui\n') &&
        text.includes(heading) &&
        !html &&
        !/\]\((?!https?:)/.test(text),
      `${path}: plain markdown with absolute links`,
      `${response.status} ${response.headers.get('content-type')}${html ? `, HTML: ${html}` : ''}`,
    );
  }
  const llms = await (await fetch(`${BASE}/llms.txt`)).text();
  const components = llms.slice(llms.indexOf('## Components'), llms.indexOf('## Optional')).match(/^- .+$/gm) ?? [];
  const undescribed = components.filter((line) => !/^- `\w+`: [^\s<][^<]*\.$/.test(line));
  check(
    components.length >= 7 && undescribed.length === 0,
    '/llms.txt: each component has a sentence of its own',
    undescribed.join(' | ') || `${components.length} components`,
  );

  // Each docs page is also Markdown at its URL plus .md, for "Copy page" and coding agents.
  for (const [path, heading] of [
    ['/docs.md', '# Introduction\n'],
    ['/docs/getting-started.md', '# Getting started\n'],
    ['/docs/ag-ui.md', '# AG-UI agents\n'],
    ['/docs/components/approval-card.md', '# ApprovalCard\n'],
  ]) {
    const response = await fetch(BASE + path);
    const text = await response.text();
    check(
      response.ok && response.headers.get('content-type')?.startsWith('text/markdown') && text.startsWith(heading),
      `${path}: the page as Markdown`,
      `${response.status} ${response.headers.get('content-type')}`,
    );
  }

  // Component pages document props from the package's own types: ApprovalCard's toolName is a
  // required string, risk has no default, and approveLabel defaults to 'Approve' (the page and its
  // Markdown share the source).
  const card = await (await fetch(`${BASE}/docs/components/approval-card.md`)).text();
  check(
    card.includes('| `toolName` (required) | `string` |') &&
      /\| `risk` \| `RiskLevel` \| {2}\|/.test(card) &&
      /\| `approveLabel` \| `string` \| `'Approve'` \|/.test(card),
    'docs: props tables come from the types, with defaults from the source',
    card
      .split('\n')
      .filter((line) => /`(risk|approveLabel)`/.test(line))
      .join('\n'),
  );

  // The docs search finds sections, not only pages.
  const docs = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await docs.goto(`${BASE}/docs`, { waitUntil: 'networkidle' });
  await docs.keyboard.press('ControlOrMeta+k');
  await docs.keyboard.type('theme');
  const found = await docs.getByRole('list', { name: 'Search results' }).getByRole('link').allInnerTexts();
  check(
    found.some((text) => text.includes('Theming')),
    'docs: ⌘K focuses the search, and "theme" finds Theming',
    found.join(', '),
  );
  await docs.close();

  // On a phone the run starts on load and grows past the screen; the page must not follow it
  // (and scroll the headline away) until the reader scrolls down or starts a run.
  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
    isMobile: true,
    hasTouch: true,
  });
  const phone = await phoneContext.newPage();
  await phone.goto(BASE, { waitUntil: 'networkidle' });

  // The first screen says what the kit is and how to get it, and shows the run's status.
  const fold = await phone.evaluate(() =>
    ['h1', 'aside [data-slot="signoff-agent-status"]'].map(
      (s) => document.querySelector(s)?.getBoundingClientRect().bottom,
    ),
  );
  const install = phone.getByRole('button', { name: 'Copy the install command' }).first();
  const star = phone.getByRole('link', { name: 'Star on GitHub' }).first();
  check(
    fold.every((bottom) => bottom !== undefined && bottom < 844) &&
      (await install.boundingBox())?.y < 844 &&
      (await star.boundingBox())?.y < 844,
    'phone: headline, install command, star link and run status on the first screen',
    JSON.stringify(fold),
  );
  check(!(await phone.locator('#kbd-heading').isVisible()), 'phone: no keyboard shortcuts card on a touch screen');
  await phone.waitForFunction(
    () =>
      document.querySelectorAll('[data-slot="signoff-tool-call-trigger"]').length >= 3 &&
      document.documentElement.scrollHeight > innerHeight * 1.5,
    null,
    { timeout: 60_000 },
  );
  const scrollY = await phone.evaluate(() => scrollY);
  check(scrollY === 0, 'phone: the page stays on the headline while the run streams', `scrolled to ${scrollY}px`);
  check((await phone.getByRole('radio', { name: 'Live' }).count()) === 0, 'header: no Live mode without a model key');

  // The pages stay reachable on a phone, through the menu.
  await phone.evaluate(() => scrollTo(0, 0));
  await phone.getByRole('button', { name: 'Menu' }).click();
  await phone.locator('#site-menu').getByRole('link', { name: 'Components' }).click();
  await phone.waitForURL(/\/gallery$/, { timeout: 10_000 }).catch(() => {});
  check(new URL(phone.url()).pathname === '/gallery', 'phone: the menu reaches the components page', phone.url());
  await phoneContext.close();

  // Through a whole run from the keyboard: after the review is applied, the reader stays with the
  // run (the diff folds away above them) and sees it finish at the bottom of the screen, not
  // scrolled past it into the sections below.
  const run = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  await run.goto(`${BASE}/?speed=4`, { waitUntil: 'networkidle' });
  await run.waitForSelector('[data-slot="signoff-approval-card"][data-status="pending"]', { timeout: 60_000 });
  await run.keyboard.press('y');
  await run.waitForSelector('[data-slot="signoff-diff-submit"]', { timeout: 60_000 });
  for (const key of ['a', 'a', 'a', 'r']) await run.keyboard.press(key);
  await run.keyboard.press('Control+Enter');
  await run.getByText('Run complete').waitFor({ timeout: 60_000 });
  await run.waitForTimeout(1000);
  const end = await run.evaluate(() => {
    const box = [...document.querySelectorAll('span')].find((el) => el.textContent === 'Run complete');
    const { top, bottom } = box.getBoundingClientRect();
    return { top: Math.round(top), bottom: Math.round(bottom), height: innerHeight };
  });
  check(
    end.top > end.height / 2 && end.bottom <= end.height,
    'run: after the review is applied, the run fills the screen down to its end',
    JSON.stringify(end),
  );
  await run.close();

  // Replay mid-run starts over once the stopped run has settled, so the new run's time to first
  // token is measured from its own request (the script pauses 680ms first, 170ms at 4x), not 0ms.
  const replay = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  await replay.goto(`${BASE}/?speed=4`, { waitUntil: 'networkidle' });
  const calls = replay.locator('[data-slot="signoff-tool-call-trigger"]');
  await calls.first().waitFor({ timeout: 60_000 });
  await replay.getByRole('button', { name: 'Replay', exact: true }).first().click();
  await calls.first().waitFor({ state: 'detached', timeout: 10_000 });
  await calls.first().waitFor({ timeout: 60_000 });
  const ttft = await replay
    .locator('aside [data-slot="signoff-run-meter"]')
    .evaluate((el) => /TTFT\s*([\d.]+)(ms|s)/.exec(el.textContent ?? '')?.slice(1));
  const ttftMs = ttft && Number(ttft[0]) * (ttft[1] === 's' ? 1000 : 1);
  check(ttftMs >= 100, 'replay: the new run times its first token from its own request', `TTFT ${ttft?.join('')}`);
  await replay.close();

  // The gallery: the anchors launch posts link to, npm snippets that bring the styles, and the
  // header's theme switch, which re-themes the page and the frames, with no axe violations
  // (contrast included) and remembered on the next visit.
  const gallery = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await gallery.goto(`${BASE}/gallery`, { waitUntil: 'networkidle' });
  const anchors = ['agent-status', 'tool-call-timeline', 'approval-card', 'diff-review', 'run-meter', 'sources'];
  anchors.push('theming', 'agent-message', 'ag-ui');
  const missing = await gallery.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), anchors);
  check(missing.length === 0, 'gallery: every section anchor is there', missing.join(', '));
  const snippets = await gallery.locator('pre:visible').allInnerTexts();
  check(
    snippets.some((text) => text.includes("import 'signoff-ui/styles.css';")),
    'gallery: the npm snippets import the styles',
  );
  await gallery.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Light' }).click();
  const frame = await gallery.$eval('[data-shot="approval-card"]', (el) => getComputedStyle(el).backgroundColor);
  const page = await gallery.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(
    frame === 'rgb(255, 255, 255)' && page === 'rgb(255, 255, 255)',
    'gallery: the theme switch turns the page and the frames light',
    `frame ${frame}, page ${page}`,
  );
  await gallery.reload({ waitUntil: 'networkidle' });
  const remembered = await gallery.evaluate(() => document.documentElement.className);
  check(/\blight\b/.test(remembered), 'theme: the choice is remembered, and applied before paint', remembered);
  await gallery.waitForTimeout(800);
  const require = createRequire(join(import.meta.dirname, '../packages/signoff-ui/package.json'));
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
