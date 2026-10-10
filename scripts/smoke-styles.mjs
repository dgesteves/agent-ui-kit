// Checks dist/styles.css in Chrome inside the apps it is for: a plain app whose global reset is
// create-next-app's (`* { padding: 0; margin: 0 }`), and a Tailwind v3 app, whose PostCSS build
// must accept the stylesheet. Every element of a few rendered components must compute the same
// spacing, type, borders and colors as with the kit's stylesheet alone. Then theme.auto.css
// against the OS color scheme, the app's font, the app's own content inside the components (a
// Tailwind v4 app with its own theme, and a plain app), and a timeline in a narrow column.
//
//   pnpm build:lib && pnpm smoke:styles
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss-v3';
import { KIT, LEVELS, ROOT, SLOT } from '../packages/signoff-ui/scripts/kit-scope.mjs';

const lib = join(import.meta.dirname, '../packages/signoff-ui');
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
        [...document.querySelectorAll('[data-signoff], [data-signoff] *')].map((el) => {
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
    // [check, OS color scheme, class on <html>, stylesheets, expected --signoff-bg (minified) and font-family]
    ['dark OS without theme.auto.css: light', 'dark', '', [styles], '#fff'],
    ['dark OS with theme.auto.css: dark', 'dark', '', [styles, auto], '#0d0f12'],
    ['light OS with theme.auto.css: light', 'light', '', [styles, auto], '#fff'],
    ['dark OS, .light on <html>: light', 'dark', 'light', [styles, auto], '#fff'],
    ['light OS, .dark on <html>: dark', 'light', 'dark', [styles, auto], '#0d0f12'],
    ['dark OS, a later :root override wins', 'dark', '', [styles, auto, ':root { --signoff-bg: #123456 }'], '#123456'],
    ["the app's --font-sans", 'light', '', [':root { --font-sans: Georgia, serif }', styles], '#fff', 'Georgia, serif'],
  ];
  for (const [check, colorScheme, className, sheets, background, font] of themes) {
    const page = await browser.newPage({ colorScheme });
    await page.setContent(
      `<!doctype html><html class="${className}"><head>${sheets.map((css) => `<style>${css}</style>`).join('')}</head>` +
        `<body>${markup}</body></html>`,
    );
    const actual = await page.$eval('[data-slot=signoff-agent-status]', (el) => [
      getComputedStyle(el).getPropertyValue('--signoff-bg').trim(),
      getComputedStyle(el).fontFamily,
    ]);
    const ok = actual[0] === background && (font === undefined || actual[1] === font);
    failed ||= !ok;
    console.log(`${ok ? 'pass' : 'FAIL'}  ${check}${ok ? '' : `: --signoff-bg ${actual[0]}, font ${actual[1]}`}`);
    await page.close();
  }

  // Which elements the stylesheet may style: a component's root and its elements, never the app's
  // content in a slot, and again the elements of a component rendered in a slot, LEVELS deep.
  {
    const page = await browser.newPage();
    const levels = LEVELS + 1;
    const nest = (depth) =>
      depth > levels
        ? ''
        : `<div ${ROOT.slice(1, -1)} data-expect="kit"><span data-expect="kit"></span>` +
          `<div ${SLOT.slice(1, -1)} data-expect="kit"><p data-expect="app"><b data-expect="app"></b></p>` +
          `<div data-expect="app">${nest(depth + 1)}</div></div></div>`;
    await page.setContent(`<!doctype html><html><body><p data-expect="app"></p>${nest(0)}</body></html>`);
    const wrong = await page.evaluate(
      ({ kit, levels }) =>
        [...document.querySelectorAll('[data-expect]')].flatMap((el) => {
          const depth = [...document.querySelectorAll('[data-signoff]')].filter((root) => root.contains(el)).length;
          // Past LEVELS components in slots, a component is not styled; the app never is.
          const expected = el.dataset.expect === 'kit' && depth <= levels;
          return el.matches(kit) === expected ? [] : [`${el.tagName.toLowerCase()} at depth ${depth}`];
        }),
      { kit: KIT, levels },
    );
    const ok = wrong.length === 0;
    failed ||= !ok;
    console.log(
      `${ok ? 'pass' : 'FAIL'}  the kit's elements, ${LEVELS} components deep in slots${ok ? '' : `: ${wrong.join(', ')}`}`,
    );
    await page.close();
  }

  // The app's content inside a component is the app's: a Tailwind v4 app whose theme doubles the
  // spacing (`--spacing: .5rem`) and changes text-sm and rounded-lg renders its own markup in
  // renderData, renderTool, an approval card's preview and a timeline's renderOutput, two
  // components deep. That markup keeps the app's values; before, styles.css set --spacing on every
  // component and its own `.p-4` won, so the app's p-4 read 16px instead of 32px. The components
  // in those slots, and the kit's own elements, compute what they compute with styles.css alone.
  {
    const { compile } = require('tailwindcss');
    const twDir = join(dirname(require.resolve('tailwindcss')), '..');
    const load = async (id, base) => {
      const path = id === 'tailwindcss' ? join(twDir, 'index.css') : join(base, id);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    };
    const theme = '@theme { --spacing: 0.5rem; --text-sm: 1.0625rem; --radius-lg: 2px; }';
    const app = (await compile(`@import 'tailwindcss';\n${theme}`, { base: twDir, loadStylesheet: load })).build([
      'p-4',
      'text-sm',
      'rounded-lg',
      'border',
    ]);
    const mine = (name) =>
      h('div', { 'data-app': name, className: 'p-4 text-sm rounded-lg border' }, h('p', null, name));
    const card = (props) =>
      h(kit.ApprovalCard, { toolName: 'run_command', input: { command: 'pnpm i' }, risk: 'high', ...props });
    const read = tool('output-available', 'r', 'read_file', { output: { ok: true } });
    const timeline = () =>
      h(kit.ToolCallTimeline, {
        parts: [read],
        defaultExpanded: ['r'],
        tools: {
          read_file: {
            renderOutput: () =>
              h('div', null, mine('renderOutput'), h(kit.JsonView, { value: { a: 1 }, label: 'Nested' })),
          },
        },
      });
    const nested = renderToStaticMarkup(
      h(kit.AgentMessage, {
        message: {
          id: 'n',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Before the slots.' },
            { type: 'data-note', id: 'd', data: {} },
            tool('input-available', 't', 'review_changes'),
          ],
        },
        renderData: () => mine('renderData'),
        renderTool: () =>
          h(
            'div',
            null,
            mine('renderTool'),
            card({ preview: mine('preview'), 'data-ref': 'card' }),
            h('div', { 'data-ref': 'timeline' }, timeline()),
          ),
      }),
    );
    // The same components on their own, in the same app and with styles.css alone.
    const alone = renderToStaticMarkup(
      h(
        'div',
        null,
        card({ preview: mine('preview'), 'data-ref': 'card' }),
        h('div', { 'data-ref': 'timeline' }, timeline()),
      ),
    );
    const measure = async (sheets, body) => {
      const page = await browser.newPage();
      await page.setContent(
        `<!doctype html><html><head>${sheets.map((css) => `<style>${css}</style>`).join('')}</head>` +
          `<body style="margin: 0"><main style="width: 760px">${body}</main></body></html>`,
      );
      const result = await page.evaluate((properties) => {
        const values = (el) =>
          Object.fromEntries(properties.map((property) => [property, getComputedStyle(el).getPropertyValue(property)]));
        return {
          app: Object.fromEntries(
            [...document.querySelectorAll('[data-app]')].map((el) => [el.dataset.app, values(el)]),
          ),
          refs: Object.fromEntries(
            [...document.querySelectorAll('[data-ref]')].map((el) => [
              el.dataset.ref,
              [...el.querySelectorAll('*')].filter((x) => !x.closest('[data-app]')).map(values),
            ]),
          ),
        };
      }, PROPERTIES);
      await page.close();
      return result;
    };
    // The kit takes the app's --font-sans and --font-mono on purpose. The same fonts on every page,
    // so that text, and the layout around it, measures the same with and without the app's theme.
    const fonts = ':root { --font-sans: Arial, sans-serif; --font-mono: "Courier New", monospace; }';
    const inApp = await measure([app, styles, fonts], nested);
    const aloneInApp = await measure([app, styles, fonts], alone);
    const aloneKit = await measure([styles, fonts], alone);
    const expected = {
      'padding-top': '32px',
      'font-size': '17px',
      'border-top-left-radius': '2px',
      'margin-top': '0px',
    };
    const problems = [];
    for (const name of ['renderData', 'renderTool', 'preview', 'renderOutput']) {
      const actual = inApp.app[name];
      if (!actual) problems.push(`${name}: not rendered`);
      else
        for (const [property, value] of Object.entries(expected))
          if (actual[property] !== value) problems.push(`${name} ${property}: ${actual[property]}, expected ${value}`);
    }
    const compare = (label, a, b) => {
      for (const ref of Object.keys(b.refs)) {
        const left = a.refs[ref] ?? [];
        const right = b.refs[ref];
        if (left.length !== right.length)
          problems.push(`${label} ${ref}: ${left.length} elements, expected ${right.length}`);
        right.forEach((values, i) => {
          for (const property of PROPERTIES)
            if (left[i]?.[property] !== values[property])
              problems.push(
                `${label} ${ref} element ${i} ${property}: ${left[i]?.[property]} (expected ${values[property]})`,
              );
        });
      }
    };
    compare('in a slot', inApp, aloneInApp);
    compare('in the app', aloneInApp, aloneKit);
    const ok = problems.length === 0;
    failed ||= !ok;
    console.log(
      `${ok ? 'pass' : 'FAIL'}  the app's content in slots keeps the app's theme (--spacing: .5rem: p-4 is 32px)`,
    );
    for (const problem of problems.slice(0, 10)) console.log(`      ${problem}`);
  }

  // A plain app's content in a slot keeps the browser's defaults: the kit's reset is not applied.
  {
    const page = await browser.newPage();
    const body = renderToStaticMarkup(
      h(kit.AgentMessage, {
        message: { id: 'p', role: 'assistant', parts: [{ type: 'data-note', id: 'd', data: {} }] },
        renderData: () =>
          h('div', null, h('p', { id: 'para' }, 'A paragraph'), h('ul', { id: 'list' }, h('li', null, 'An item'))),
      }),
    );
    await page.setContent(`<!doctype html><html><head><style>${styles}</style></head><body>${body}</body></html>`);
    const [margin, list] = await page.evaluate(() => [
      getComputedStyle(document.getElementById('para')).marginTop,
      getComputedStyle(document.getElementById('list')).listStyleType,
    ]);
    const ok = margin === '16px' && list === 'disc';
    failed ||= !ok;
    console.log(
      `${ok ? 'pass' : 'FAIL'}  a plain app's <p> and <ul> in a slot keep their margins and bullets${ok ? '' : `: ${margin}, ${list}`}`,
    );
    await page.close();
  }

  // A timeline in a narrow column (a sidebar, a phone-width panel) stays inside it: long labels
  // truncate, and the waterfall bar waits for a wide enough timeline, not a wide enough screen.
  const narrow = renderToStaticMarkup(
    h(kit.ToolCallTimeline, {
      parts: [
        tool('approval-requested', 'n1', 'run_shell_command_in_repository', { approval: { id: 'y' } }),
        tool('output-error', 'n2', 'read_file', { errorText: 'ENOENT' }),
      ],
    }),
  );
  for (const width of [240, 320]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(
      `<!doctype html><html><head><style>${styles}</style></head>` +
        `<body style="margin: 0"><div id="column" style="width: ${width}px">${narrow}</div></body></html>`,
    );
    const overflow = await page.$eval('#column', (column) => {
      const right = column.getBoundingClientRect().right;
      return [...column.querySelectorAll('*')]
        .filter((el) => el.getBoundingClientRect().right > right + 0.5)
        .map((el) => el.dataset.slot ?? el.tagName.toLowerCase());
    });
    const ok = overflow.length === 0;
    failed ||= !ok;
    console.log(
      `${ok ? 'pass' : 'FAIL'}  a timeline in a ${width}px column${ok ? '' : `: ${overflow.join(', ')} overflow`}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}

const baseline = computed['kit alone'];
const card = baseline.find((el) => el.element === 'section[data-slot=signoff-approval-card]');
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
