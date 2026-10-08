// Runs the README quickstart (examples/nextjs-minimal) end to end in Chrome: a tool call, a failed
// tool, an approval, the resumed run with sources, and the run meter. Fails on any page error,
// including hydration mismatches.
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

const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: 'Message the agent' }).fill('Add rate limiting to the chat route');
  await page.getByRole('button', { name: 'Send' }).click();

  const pending = page.locator('[data-slot="approval-card"][data-status="pending"]');
  await pending.waitFor({ timeout: 30_000 });
  // The failed read shows its real error, not the AI SDK's default "An error occurred.".
  await page.getByText("ENOENT: no such file or directory, open 'middleware.ts'", { exact: true }).waitFor();
  await page.locator('[data-slot="agent-status"][data-state="awaiting-approval"]').waitFor();

  await pending.getByRole('button', { name: /^Approve/ }).click();
  await page.getByText('sliding window limiter').waitFor({ timeout: 30_000 });
  await page.locator('[data-slot="agent-status"][data-state="done"]').waitFor();
  await page.getByRole('list', { name: 'Sources' }).waitFor();
  const meter = await page.locator('[data-slot="run-meter"]').innerText();
  if (!/15\.7k/.test(meter)) throw new Error(`The run meter does not show the run's 15.7k input tokens:\n${meter}`);
  console.log('pass  quickstart: tool calls, a failed tool, approval, resumed run, sources, run meter');

  await page.goto(`${BASE}/static`, { waitUntil: 'networkidle' });
  await page.locator('[data-slot="diff-review"]').waitFor();
  console.log('pass  prerendered page (cacheComponents)');

  if (errors.length > 0) throw new Error(`Page errors:\n  ${errors.join('\n  ')}`);
} finally {
  await browser.close();
  if (server) process.kill(-server.pid);
}
