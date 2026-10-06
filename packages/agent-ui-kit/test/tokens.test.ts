// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Parse the hex tokens of one theme block out of theme.css. */
function tokens(selector: string): Record<string, string> {
  const css = readFileSync(fileURLToPath(new URL('../src/styles/theme.css', import.meta.url)), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const start = css.indexOf(selector);
  const block = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--aui-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const TEXT_PAIRS: Array<[string, string]> = [
  ['fg', 'bg'],
  ['fg', 'surface'],
  ['fg', 'surface-2'],
  ['fg-muted', 'bg'],
  ['fg-muted', 'surface'],
  ['fg-muted', 'surface-2'],
  ['fg-subtle', 'surface'],
  ['fg-subtle', 'surface-2'],
  ['accent-fg', 'surface'],
  ['hot-fg', 'surface'],
  ['warn-fg', 'surface'],
  ['on-accent', 'accent'],
  ['on-hot', 'hot'],
  ['code-keyword', 'bg'],
  ['code-string', 'bg'],
  ['code-number', 'bg'],
  ['code-comment', 'bg'],
  ['code-punctuation', 'bg'],
];
// Non-text UI (icons, focus ring, chart marks) needs 3:1 (WCAG 1.4.11).
const UI_PAIRS: Array<[string, string]> = [
  ['accent', 'surface'],
  ['hot', 'surface'],
  ['ring', 'surface'],
  ['ring', 'bg'],
  ['chart-input', 'surface'],
  ['chart-output', 'surface'],
];

it('parses distinct light and dark palettes', () => {
  expect(tokens(':root').bg).toBe('#ffffff');
  expect(tokens('.dark').bg).toBe('#0d0f12');
});

describe.each([
  ['light', ':root'],
  ['dark', '.dark'],
])('%s theme contrast', (_name, selector) => {
  const t = tokens(selector);
  it.each(TEXT_PAIRS)('%s on %s meets WCAG AA for text (4.5:1)', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(UI_PAIRS)('%s on %s meets 3:1 for UI components', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });
});
