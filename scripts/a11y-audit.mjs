// Runs axe-core in real Chrome against the running playground, across the run's
// states (approval pending, diff review, done), the gallery and a phone viewport.
// Unlike the jsdom tests, this checks color contrast with real layout.
//
//   pnpm --filter playground start   # :3100
//   pnpm a11y
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const require = createRequire(join(import.meta.dirname, '../packages/agent-ui-kit/package.json'));
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;

async function audit(page, label) {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, { resultTypes: ['violations'] });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(' ')),
    }));
  });
  failures += violations.length;
  console.log(`${violations.length === 0 ? 'pass' : 'FAIL'}  ${label}`);
  for (const v of violations) console.log(`      ${v.id} (${v.impact}): ${v.nodes.slice(0, 3).join(', ')}`);
}

const pending = '[data-slot="approval-card"][data-status="pending"]';
// Let enter animations settle so contrast is measured at full opacity.
const settle = (page) => page.waitForTimeout(800);

const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
await page.goto(`${BASE}/?speed=4`, { waitUntil: 'networkidle' });
await page.waitForSelector(pending, { timeout: 60_000 });
await settle(page);
await audit(page, 'playground · approval pending');
await page.keyboard.press('y');
await page.waitForSelector('[data-slot="diff-submit"]', { timeout: 60_000 });
await settle(page);
await page.keyboard.press('a');
await page.keyboard.press('r');
await audit(page, 'playground · diff review');
await page.keyboard.press('Control+Enter');
await page.getByText('Run complete').waitFor({ timeout: 60_000 });
await settle(page);
await audit(page, 'playground · done');
await page.goto(`${BASE}/gallery`, { waitUntil: 'networkidle' });
await settle(page);
await audit(page, 'gallery (dark, light and custom themes)');
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/?speed=4`, { waitUntil: 'networkidle' });
await page.waitForSelector(pending, { timeout: 60_000 });
await settle(page);
await audit(page, 'playground · 390px viewport');
await browser.close();

if (failures > 0) {
  console.error(`\n${failures} violation type(s) found.`);
  process.exit(1);
}
console.log('\nNo axe violations.');
