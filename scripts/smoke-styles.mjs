// Checks dist/styles.css in Chrome inside the apps it is for: a plain app whose global reset is
// create-next-app's (`* { padding: 0; margin: 0 }`), and a Tailwind v3 app, whose PostCSS build
// must accept the stylesheet. Every element of a few rendered components must compute the same
// spacing, type, borders and colors as with the kit's stylesheet alone. Then theme.auto.css
// against the OS color scheme, and the app's font.
//
//   pnpm build:lib && pnpm smoke:styles
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss-v3';

const lib = join(import.meta.dirname, '../packages/agent-ui-kit');
const require = createRequire(join(lib, 'package.json'));
const { createElement: h } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const kit = await import(pathToFileURL(join(lib, 'dist/index.js')).href);
const styles = readFileSync(join(lib, 'dist/styles.css'), 'utf8');

const tool = (state, toolCallId, toolName, extra) => ({
  type: `tool-${toolName}`,
  toolCallId,
  state,
  input: { path: 'app/api/chat/route.ts', command: 'pnpm add @upstash/ratelimit' },
  ...extra,
});
const parts = [
  tool('output-available', 'a', 'read_file', { output: { ok: true } }),
  tool('output-error', 'b', 'read_file', { errorText: 'ENOENT' }),
  tool('approval-requested', 'c', 'run_command', { approval: { id: 'x' } }),
];
const markup = renderToStaticMarkup(
  h(
    'div',
    null,
    h(kit.AgentStatus, { state: 'awaiting-approval', detail: 'run_command' }),
    h(kit.AgentMessage, {
      message: { id: 'm', role: 'assistant', parts: [{ type: 'text', text: '**Done**, see [docs](#).' }, ...parts] },
      onToolApproval: () => {},
    }),
    h(kit.ApprovalCard, { toolName: 'run_command', input: { command: 'pnpm i' }, risk: 'high', description: 'Why' }),
    h(kit.RunMeter, { usage: { inputTokens: 1200, outputTokens: 300 }, variant: 'expanded' }),
  ),
);

// create-next-app --no-tailwind's globals.css
const reset = `* { box-sizing: border-box; padding: 0; margin: 0; }
a { color: inherit; text-decoration: none; }
body { font-family: Arial, Helvetica, sans-serif; }`;

// A Tailwind v3 app processes each imported stylesheet with its PostCSS plugin. Before styles.css
// dropped @layer, this threw "`@layer base` is used but no matching `@tailwind base` directive".
async function tailwind3(css, name) {
  try {
    const plugins = [tailwindcss({ content: [{ raw: markup, extension: 'html' }] })];
    return (await postcss(plugins).process(css, { from: undefined })).css;
  } catch (error) {
    throw new Error(`Tailwind v3 cannot build ${name}: ${error.reason ?? error.message}`, { cause: error });
  }
}
const tailwindApp = await tailwind3('@tailwind base;\n@tailwind components;\n@tailwind utilities;', 'its own CSS');
const stylesInTailwindApp = await tailwind3(styles, 'styles.css');

const fixtures = {
  'kit alone': [styles],
  'plain app with a global reset': [reset, styles],
  'Tailwind v3 app': [tailwindApp, stylesInTailwindApp],
};

const PROPERTIES = [
  'display',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'border-top-width',
  'border-left-width',
  'border-top-left-radius',
  'color',
  'background-color',
];

const browser = await chromium.launch({ channel: 'chrome' });
const computed = {};
let failed = false;
try {
  for (const [name, sheets] of Object.entries(fixtures)) {
    const page = await browser.newPage();
    // A fixed-width page, so that only the stylesheets differ between fixtures, not the layout.
    await page.setContent(
      `<!doctype html><html><head>${sheets.map((css) => `<style>${css}</style>`).join('')}</head>` +
        `<body style="margin: 0"><main style="width: 760px">${markup}</main></body></html>`,
    );
    computed[name] = await page.evaluate(
      (properties) =>
        [...document.querySelectorAll('[data-aui], [data-aui] *')].map((el) => {
          const style = getComputedStyle(el);
          return {
            element: `${el.tagName.toLowerCase()}${el.dataset.slot ? `[data-slot=${el.dataset.slot}]` : ''}`,
            values: Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)])),
          };
        }),
      PROPERTIES,
    );
    await page.close();
  }

  // theme.auto.css follows the OS unless the page picks a palette, and the app's font comes through.
  const auto = readFileSync(join(lib, 'dist/theme.auto.css'), 'utf8');
  const themes = [
    // [check, OS color scheme, class on <html>, stylesheets, expected --aui-bg (minified) and font-family]
    ['dark OS without theme.auto.css: light', 'dark', '', [styles], '#fff'],
    ['dark OS with theme.auto.css: dark', 'dark', '', [styles, auto], '#0d0f12'],
    ['light OS with theme.auto.css: light', 'light', '', [styles, auto], '#fff'],
    ['dark OS, .light on <html>: light', 'dark', 'light', [styles, auto], '#fff'],
    ['light OS, .dark on <html>: dark', 'light', 'dark', [styles, auto], '#0d0f12'],
    ['dark OS, a later :root override wins', 'dark', '', [styles, auto, ':root { --aui-bg: #123456 }'], '#123456'],
    ["the app's --font-sans", 'light', '', [':root { --font-sans: Georgia, serif }', styles], '#fff', 'Georgia, serif'],
  ];
  for (const [check, colorScheme, className, sheets, background, font] of themes) {
    const page = await browser.newPage({ colorScheme });
    await page.setContent(
      `<!doctype html><html class="${className}"><head>${sheets.map((css) => `<style>${css}</style>`).join('')}</head>` +
        `<body>${markup}</body></html>`,
    );
    const actual = await page.$eval('[data-slot=agent-status]', (el) => [
      getComputedStyle(el).getPropertyValue('--aui-bg').trim(),
      getComputedStyle(el).fontFamily,
    ]);
    const ok = actual[0] === background && (font === undefined || actual[1] === font);
    failed ||= !ok;
    console.log(`${ok ? 'pass' : 'FAIL'}  ${check}${ok ? '' : `: --aui-bg ${actual[0]}, font ${actual[1]}`}`);
    await page.close();
  }
} finally {
  await browser.close();
}

const baseline = computed['kit alone'];
const card = baseline.find((el) => el.element === 'section[data-slot=approval-card]');
if (!card || card.values['border-top-width'] === '0px') throw new Error('The approval card is not styled at all');
for (const [name, elements] of Object.entries(computed)) {
  const differences = elements.flatMap((el, i) =>
    PROPERTIES.filter((property) => el.values[property] !== baseline[i]?.values[property]).map(
      (property) => `${el.element} ${property}: ${el.values[property]} (alone: ${baseline[i]?.values[property]})`,
    ),
  );
  failed ||= differences.length > 0;
  console.log(`${differences.length === 0 ? 'pass' : 'FAIL'}  ${name}: ${elements.length} elements`);
  for (const difference of differences.slice(0, 10)) console.log(`      ${difference}`);
}
if (failed) process.exit(1);
