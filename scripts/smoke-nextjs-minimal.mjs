// Runs the README quickstart (examples/nextjs-minimal) end to end in Chrome: a tool call, a failed
// tool, a diff review whose result goes back to the agent, an approval, the resumed run with
// sources, the run meter, and a second turn timed on its own. Fails on any page error, including
// hydration mismatches.
//
//   pnpm build:lib && pnpm --filter nextjs-minimal build
//   pnpm smoke:nextjs   # starts the built example on :3210, or tests BASE_URL if set
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const PORT = 3210;
const BASE = process.env.BASE_URL ?? `http://localhost:${PORT}`;

let server;
if (!process.env.BASE_URL) {
  server = spawn('pnpm', ['exec', 'next', 'start', '--port', String(PORT)], {
    cwd: join(import.meta.dirname, '../examples/nextjs-minimal'),
    stdio: 'inherit',
    detached: true,
  });
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      if (attempt > 60) throw new Error(`The example did not start on ${BASE}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** "352ms", "4.62s" or "1m 05s" (formatDuration) in milliseconds. */
function parseDuration(text) {
  const match = /^(?:(\d+)m )?([\d.]+)(ms|s)$/.exec(text.trim());
  if (!match) throw new Error(`Not a duration: ${text}`);
  const [, minutes = '0', value, unit] = match;
  return Number(minutes) * 60_000 + Number(value) * (unit === 's' ? 1000 : 1);
}

/** The run meter's time to first token and active time, from the sentence it gives screen readers. */
async function runTotal(page) {
  const summary = await page.locator('[data-slot="signoff-run-meter"] .sr-only').innerText();
  const ttft = /time to first token ([^,]+)/.exec(summary)?.[1];
  const total = /total ([^,]+)$/.exec(summary)?.[1];
  if (!total) throw new Error(`The run meter shows no active time: ${summary}`);
  return { ttft: ttft && parseDuration(ttft), total: parseDuration(total) };
}

const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: 'Message the agent' }).fill('Add rate limiting to the chat route');
  await page.getByRole('button', { name: 'Send' }).click();

  // The proposed edit: two files, reviewed in the page, and the run waits for it.
  const review = page.locator('[data-slot="signoff-diff-review"]');
  await review.waitFor({ timeout: 30_000 });
  // The failed read shows its real error, not the AI SDK's default "An error occurred.".
  await page.getByText("ENOENT: no such file or directory, open 'middleware.ts'", { exact: true }).waitFor();
  await page.locator('[data-slot="signoff-agent-status"][data-state="awaiting-approval"]').waitFor();
  const files = await review.locator('[data-slot="signoff-diff-file"]').count();
  if (files !== 2) throw new Error(`The review shows ${files} files, not 2`);
  await review.getByRole('button', { name: 'Accept all' }).click();
  await review.locator('[data-slot="signoff-diff-submit"]').click();

  // The agent read the review's result, and asks before installing.
  const pending = page.locator('[data-slot="signoff-approval-card"][data-status="pending"]');
  await pending.waitFor({ timeout: 30_000 });
  await page.getByText(/hunks you accepted are applied/).waitFor();
  await page.locator('[data-slot="signoff-agent-status"][data-state="awaiting-approval"]').waitFor();

  await pending.getByRole('button', { name: /^Approve/ }).click();
  await page.getByText('sliding window limiter').waitFor({ timeout: 30_000 });
  await page.locator('[data-slot="signoff-agent-status"][data-state="done"]').waitFor();
  await page.getByRole('list', { name: 'Sources' }).waitFor();
  const meter = await page.locator('[data-slot="signoff-run-meter"]').innerText();
  // 4.2k + 5.1k + 5.9k + 6.4k: one run across the review and the approval, summed with addUsage.
  if (!/21\.6k/.test(meter)) throw new Error(`The run meter does not show the run's 21.6k input tokens:\n${meter}`);
  console.log('pass  quickstart: tool calls, a failed tool, review, approval, resumed run, sources, run meter');

  // A second turn is timed on its own: its active time is not added to the first turn's.
  const first = await runTotal(page);
  await page.getByRole('textbox', { name: 'Message the agent' }).fill('Thanks. Anything else?');
  await page.getByRole('button', { name: 'Send' }).click();
  const done = page.locator('[data-slot="signoff-agent-status"][data-state="done"]');
  await done.waitFor({ state: 'detached' });
  await done.waitFor({ timeout: 30_000 });
  const second = await runTotal(page);
  if (!(second.total < first.total))
    throw new Error(`The second turn's active time adds up the first's: ${first.total}ms, then ${second.total}ms`);
  if (second.ttft === undefined) throw new Error('The second turn has no time to first token');
  console.log(
    `pass  second turn timed on its own: ${first.total}ms then ${second.total}ms active, TTFT ${second.ttft}ms`,
  );

  await page.goto(`${BASE}/static`, { waitUntil: 'networkidle' });
  await page.locator('[data-slot="signoff-diff-review"]').waitFor();
  console.log('pass  prerendered page (cacheComponents)');

  if (errors.length > 0) throw new Error(`Page errors:\n  ${errors.join('\n  ')}`);
} finally {
  await browser.close();
  if (server) process.kill(-server.pid);
}
