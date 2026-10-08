// Captures the README media from a running playground.
//
//   pnpm --filter playground build && pnpm --filter playground start   # serves :3100
//   pnpm media                                                          # needs Chrome and ffmpeg
//
// Outputs to docs/media/: hero.png, review.png, inspect.png, mobile.png,
// run.gif + run.mp4 (a full run driven by the keyboard), components/*.png and *-light.png.
// `og` crops hero.png into the playground's Open Graph image, and needs no playground.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs/media');
const tmp = join(root, '.media-tmp');
const only = process.argv.slice(2);
const want = (name) => only.length === 0 || only.includes(name);
mkdirSync(join(out, 'components'), { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });

/** Show pressed keys in a corner pill, so recordings make keyboard use visible. */
const KEY_HUD = () => {
  const labels = { Enter: '↵', Meta: '⌘', Control: 'Ctrl', Shift: '⇧', ArrowDown: '↓', ArrowUp: '↑' };
  let hud;
  let timer;
  addEventListener(
    'keydown',
    (e) => {
      if (!hud) {
        hud = document.createElement('div');
        hud.setAttribute('aria-hidden', 'true');
        hud.style.cssText =
          'position:fixed;left:24px;bottom:24px;z-index:9999;display:flex;gap:6px;align-items:center;padding:8px 12px;border-radius:12px;background:rgba(13,15,18,.92);border:1px solid #353c47;box-shadow:0 10px 30px rgba(0,0,0,.5);font:600 15px/1 ui-monospace,monospace;color:#e8eaed;transition:opacity .2s';
        document.body.append(hud);
      }
      const parts = [];
      if (e.metaKey && e.key !== 'Meta') parts.push('⌘');
      if (e.ctrlKey && e.key !== 'Control') parts.push('Ctrl');
      parts.push(labels[e.key] ?? e.key.toUpperCase());
      hud.innerHTML = parts
        .map(
          (k) =>
            `<kbd style="min-width:28px;text-align:center;padding:6px 8px;border-radius:7px;border:1px solid #475060;border-bottom-width:3px;background:#1e232a">${k}</kbd>`,
        )
        .join('');
      hud.style.opacity = '1';
      clearTimeout(timer);
      timer = setTimeout(() => (hud.style.opacity = '0'), 1100);
    },
    true,
  );
};

async function newPage({ width = 1440, height = 900, scale = 2, hud = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
  if (hud) await page.addInitScript(KEY_HUD);
  return page;
}

const approvalPending = '[data-slot="approval-card"][data-status="pending"]';
const reviewReady = '[data-slot="diff-review"] [data-slot="diff-submit"]';

/** Grow the viewport so everything down to `selector` fits, then shoot from the top. */
async function shootTo(page, selector, file, { min = 900, max = 1400, pad = 40 } = {}) {
  // Fit the target and the sidebar, whichever ends lower.
  const bottom = await page.evaluate(
    (sel) =>
      Math.max(
        ...[sel, 'aside'].map((s) => (document.querySelector(s)?.getBoundingClientRect().bottom ?? 0) + scrollY),
      ),
    selector,
  );
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: Math.round(Math.min(max, Math.max(min, bottom + pad))) });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, file) });
  console.log('wrote', `docs/media/${file}`);
}

if (want('hero') || want('review')) {
  const page = await newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector(approvalPending, { timeout: 90_000 });
  await page.waitForTimeout(900);
  await page.mouse.move(0, 0);
  await shootTo(page, approvalPending, 'hero.png', { max: 1320, pad: 14 });

  if (want('review')) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.focus(approvalPending);
    await page.keyboard.press('y');
    await page.waitForSelector(reviewReady, { timeout: 90_000 });
    await page.waitForTimeout(700);
    for (const key of ['a', 'a', 'a', 'r']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(350);
    }
    await page.evaluate(() => {
      const el = document.querySelector('[data-slot="diff-review"]');
      scrollTo(0, el.getBoundingClientRect().top + scrollY - 140);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, 'review.png') });
    console.log('wrote docs/media/review.png');
  }
  await page.context().close();
}

if (want('og')) {
  // The top of the hero at 1200×630, the size link previews use.
  const page = await newPage({ width: 1200, height: 630, scale: 1 });
  const hero = readFileSync(join(out, 'hero.png')).toString('base64');
  await page.setContent(
    `<body style="margin:0;background:#0d0f12"><img src="data:image/png;base64,${hero}" style="display:block;width:1200px"></body>`,
  );
  await page.screenshot({ path: join(root, 'examples/playground/app/opengraph-image.png') });
  console.log('wrote examples/playground/app/opengraph-image.png');
  await page.context().close();
}

if (want('inspect')) {
  const page = await newPage();
  await page.goto(`${BASE}/?inspect=1&speed=4`, { waitUntil: 'networkidle' });
  await page.waitForSelector(approvalPending, { timeout: 90_000 });
  await page.waitForTimeout(900);
  await shootTo(page, approvalPending, 'inspect.png', { max: 1320, pad: 14 });
  await page.context().close();
}

if (want('mobile')) {
  const page = await newPage({ width: 390, height: 844, scale: 3 });
  await page.goto(`${BASE}/?speed=4`, { waitUntil: 'networkidle' });
  await page.waitForSelector(approvalPending, { timeout: 90_000 });
  await page.waitForTimeout(900);
  await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'end' }), approvalPending);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'mobile.png') });
  console.log('wrote docs/media/mobile.png');
  await page.context().close();
}

if (want('components')) {
  // Each gallery section in both palettes: <id>.png (dark) and <id>-light.png, which the README
  // shows through <picture> by the reader's color scheme. The AG-UI demo plays a run; no still.
  for (const theme of ['dark', 'light']) {
    const page = await newPage({ width: 1100, height: 900 });
    await page.goto(`${BASE}/gallery${theme === 'light' ? '?theme=light' : ''}`, { waitUntil: 'networkidle' });
    // Tall sections scroll under the sticky header; take it out of the way for element shots. The
    // frames' rounded corners show the page behind them: white for the light shots.
    await page.addStyleTag({
      content: `header { position: static !important; }${theme === 'light' ? ' html, body { background: #fff !important; }' : ''}`,
    });
    await page.waitForTimeout(800);
    const ids = await page.$$eval('[data-shot]', (els) => els.map((e) => e.getAttribute('data-shot')));
    for (const id of ids.filter((id) => id !== 'ag-ui')) {
      const file = `${id}${theme === 'light' ? '-light' : ''}.png`;
      await page.locator(`[data-shot="${id}"]`).screenshot({ path: join(out, 'components', file) });
      console.log(`wrote docs/media/components/${file}`);
    }
    await page.context().close();
  }
}

if (want('gif')) {
  // Record with the CDP screencast (frames only when the page repaints), then
  // rebuild real timing with ffmpeg's concat demuxer.
  const page = await newPage({ width: 1280, height: 800, scale: 1, hud: true });
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const frames = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await page.goto(`${BASE}/?speed=2`, { waitUntil: 'domcontentloaded' });
  // Start once the agent is responding, so the first frame (shown when GitHub pauses
  // animations for reduced-motion users) is the run rather than an empty page.
  await page.waitForSelector('[data-slot="agent-message"]', { timeout: 30_000 });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 });
  await page.waitForSelector(approvalPending, { timeout: 90_000 });
  await page.waitForTimeout(1600);
  await page.keyboard.press('y');
  await page.waitForSelector(reviewReady, { timeout: 90_000 });
  await page.waitForTimeout(1300);
  for (const [key, wait] of [
    ['a', 750],
    ['a', 750],
    ['a', 750],
    ['r', 1100],
  ]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(wait);
  }
  await page.keyboard.press('Control+Enter');
  await page.getByText('Run complete').waitFor({ timeout: 90_000 });
  await page.waitForTimeout(2800);
  await cdp.send('Page.stopScreencast');
  await page.context().close();

  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    writeFileSync(join(tmp, name), Buffer.from(f.data, 'base64'));
    const next = frames[i + 1]?.t ?? f.t + 2;
    lines.push(`file '${name}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  lines.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  writeFileSync(join(tmp, 'frames.txt'), lines.join('\n'));
  const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: tmp });
  ff([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    'frames.txt',
    '-vf',
    'fps=30,format=yuv420p',
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    join(out, 'run.mp4'),
  ]);
  ff([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    'frames.txt',
    '-vf',
    'fps=12,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    '-loop',
    '0',
    join(out, 'run.gif'),
  ]);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote docs/media/run.gif and run.mp4 from ${frames.length} frames`);
}

await browser.close();
