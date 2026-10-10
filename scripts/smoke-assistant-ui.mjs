// Builds examples/assistant-ui against the packed package, as an app installs it from npm, and
// drives it in Chrome: assistant-ui's local runtime with a scripted model (no API key), a
// review_changes call reviewed in DiffReview whose result goes back to the model, a run_command call
// approved on the approval card, the resumed run, and in a second turn the session rule from that
// approval answering the same command without asking. axe checks the page with the review and with
// the card waiting. Fails on any page error or axe violation.
//
//   pnpm build:lib && pnpm smoke:assistant-ui
//
// The tarball comes from `npm pack`, unpacked into a copy of the example. Every other package is
// linked from the workspace's install, so the build needs no network.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { chromium } from 'playwright-core';

const root = join(import.meta.dirname, '..');
const lib = join(root, 'packages/signoff-ui');
const example = join(root, 'examples/assistant-ui');
const work = mkdtempSync(join(tmpdir(), 'signoff-assistant-ui-'));
const app = join(work, 'app');

let server;
let browser;
try {
  // The package as npm would install it: only what `files` and `exports` publish.
  const [{ filename }] = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--pack-destination', work], { cwd: lib, encoding: 'utf8' }),
  );
  const installed = join(app, 'node_modules/signoff-ui');
  mkdirSync(installed, { recursive: true });
  execFileSync('tar', ['-xzf', join(work, filename), '-C', installed, '--strip-components=1']);

  for (const file of ['index.html', 'vite.config.ts', 'package.json', 'src'])
    cpSync(join(example, file), join(app, file), { recursive: true });
  const link = (name, from) => {
    const target = join(app, 'node_modules', name);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(realpathSync(join(from, 'node_modules', name)), target);
  };
  const manifest = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const own = manifest(example);
  for (const name of Object.keys({ ...own.dependencies, ...own.devDependencies }))
    if (name !== 'signoff-ui') link(name, example);
  for (const name of Object.keys(manifest(installed).dependencies)) link(name, lib);

  const vite = join(realpathSync(join(example, 'node_modules/vite')), 'bin/vite.js');
  execFileSync(process.execPath, [vite, 'build', '--logLevel', 'warn'], { cwd: app, stdio: 'inherit' });
  if (!existsSync(join(app, 'dist/index.html'))) throw new Error('The example did not build');
  console.log(`pass  built examples/assistant-ui from ${filename}`);

  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const dist = join(app, 'dist');
  server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const file = join(dist, path === '/' ? 'index.html' : path);
    if (!file.startsWith(dist) || !existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, done));
  const base = `http://localhost:${server.address().port}`;

  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await page.goto(base);

  const axeSource = readFileSync(createRequire(join(lib, 'package.json')).resolve('axe-core/axe.min.js'), 'utf8');
  const audit = async (label) => {
    // Off any button the last click left the pointer on, and past enter animations: contrast as at rest.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(800);
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
      const { violations } = await window.axe.run(document, { resultTypes: ['violations'] });
      return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    });
    if (violations.length) throw new Error(`axe, ${label}:\n  ${violations.join('\n  ')}`);
  };

  const send = async (text) => {
    await page.getByRole('textbox', { name: 'Message the agent' }).fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
  };
  const turn = (n) => page.locator('.message.assistant').nth(n);
  const review = async (message, audits = false) => {
    const diff = message.locator('[data-slot="signoff-diff-review"]');
    await diff.waitFor();
    if (audits) await audit('the review');
    const files = await diff.locator('[data-slot="signoff-diff-file"]').count();
    if (files !== 2) throw new Error(`The review shows ${files} files, not 2`);
    await diff.getByRole('button', { name: 'Accept all' }).click();
    await diff.locator('[data-slot="signoff-diff-submit"]').click();
    // The review went back as the call's result: the model read it, and the review is read-only now.
    await message.getByText(/Applied 2 of 2 changes in 2 files/).waitFor();
    if (await diff.locator('[data-slot="signoff-diff-submit"]').count())
      throw new Error('The review still offers to apply once it was submitted');
  };

  // Turn 1: review the edit, then approve the install for this session on the approval card.
  await send('Add rate limiting to the chat route');
  await review(turn(0), true);
  const card = turn(0).locator('[data-slot="signoff-approval-card"]');
  await card.and(page.locator('[data-status="pending"]')).waitFor();
  await audit('the approval card');
  const command = await card.innerText();
  if (!command.includes('pnpm add @upstash/ratelimit @upstash/redis') || !/high/i.test(command))
    throw new Error(`The approval card does not show the command and its risk:\n${command}`);
  await card.getByRole('button', { name: 'For this session' }).click();
  await turn(0).getByText('Installed @upstash/ratelimit').waitFor();
  await card.and(page.locator('[data-status="approved"]')).waitFor();
  console.log('pass  review in DiffReview, result back to the model, approval card, resumed run; axe clean');

  // Turn 2: the same command again. The session rule answers it; nobody is asked.
  await send('Do the same for the completion route');
  await review(turn(1));
  await turn(1).getByText('Installed @upstash/ratelimit').waitFor();
  const ruled = turn(1).locator('[data-slot="signoff-approval-card"]');
  await ruled.and(page.locator('[data-status="approved"]')).waitFor();
  const decided = await ruled.innerText();
  if (!/rule/i.test(decided)) throw new Error(`The second approval does not say a rule decided it:\n${decided}`);
  console.log('pass  the session rule approved the same command in the next turn, without asking');

  if (errors.length > 0) throw new Error(`Page errors:\n  ${errors.join('\n  ')}`);
} finally {
  await browser?.close();
  server?.close();
  rmSync(work, { recursive: true, force: true });
}
