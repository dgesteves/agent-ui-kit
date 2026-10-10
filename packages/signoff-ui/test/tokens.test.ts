// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Rgba = [number, number, number, number];

/** Parse the color tokens (hex, or translucent `rgb(r g b / a)`) of one theme block out of theme.css. */
function tokens(selector: string): Record<string, Rgba> {
  const css = readFileSync(fileURLToPath(new URL('../src/styles/theme.css', import.meta.url)), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const start = css.indexOf(selector);
  const block = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, Rgba> = {};
  for (const [, name, value] of block.matchAll(/--signoff-([\w-]+):\s*([^;]+);/g)) {
    const hex = /^#([0-9a-f]{6})$/i.exec(value!.trim());
    const rgb = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(value!.trim());
    if (hex) out[name!] = [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)).concat(1) as Rgba;
    else if (rgb) out[name!] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4])];
  }
  return out;
}

/** Paint translucent layers, bottom to top, over an opaque base. */
function paint(base: Rgba, ...layers: Rgba[]): Rgba {
  return layers.reduce<Rgba>(
    (under, [r, g, b, a]) => [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a), 1],
    base,
  );
}

function luminance([r, g, b]: Rgba) {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
}

function contrast(a: Rgba, b: Rgba) {
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
  // Code blocks and JSON views sit on either.
  ...['code-keyword', 'code-string', 'code-number', 'code-comment', 'code-punctuation'].flatMap(
    (fg): Array<[string, string]> => [
      [fg, 'bg'],
      [fg, 'surface'],
    ],
  ),
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

const CODE = ['code-keyword', 'code-string', 'code-number', 'code-comment', 'code-punctuation'];
/**
 * DiffReview paints translucent line backgrounds on --signoff-surface, and word highlights on top of
 * those. Lines carry line numbers, the +/− sign and syntax-colored code; highlights carry code.
 */
const DIFF_PAIRS: Array<[string, string[]]> = [
  ...['fg', 'fg-subtle', 'accent-fg', ...CODE].map((fg): [string, string[]] => [fg, ['add-bg']]),
  ...['fg', 'fg-subtle', 'hot-fg', ...CODE].map((fg): [string, string[]] => [fg, ['del-bg']]),
  ...['fg', ...CODE].map((fg): [string, string[]] => [fg, ['add-bg', 'add-strong']]),
  ...['fg', ...CODE].map((fg): [string, string[]] => [fg, ['del-bg', 'del-strong']]),
];

/**
 * Text on a tinted fill, e.g. `bg-signoff-accent/15 text-signoff-accent-fg` in a badge: every class string
 * in the components that sets both, found by scanning the source so new badges are covered too.
 */
function tintedTextPairs() {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const pairs = new Map<string, { fg: string; tint: string; alpha: number }>();
  for (const file of readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.tsx'))) {
    for (const [classes] of readFileSync(src + file, 'utf8').matchAll(/'[^'\n]*'|"[^"\n]*"/g)) {
      const fill = /(?<![\w:[-])bg-signoff-([a-z-]+)\/(\d+|\[[\d.]+\])/.exec(classes);
      const text = /(?<![\w:[-])text-signoff-([a-z-]+)/.exec(classes);
      if (!fill || !text) continue;
      const alpha = fill[2]!.startsWith('[') ? Number(fill[2]!.slice(1, -1)) : Number(fill[2]) / 100;
      pairs.set(`${text[1]} on ${fill[1]}/${alpha}`, { fg: text[1]!, tint: fill[1]!, alpha });
    }
  }
  return [...pairs].map(([name, pair]) => ({ name, ...pair }));
}

it('parses distinct light and dark palettes', () => {
  expect(tokens(':root').bg).toEqual([255, 255, 255, 1]);
  expect(tokens('.dark').bg).toEqual([13, 15, 18, 1]);
  expect(tokens(':root')['del-bg']?.[3]).toBeLessThan(1);
});

it('finds the tinted badges in the components', () => {
  expect(tintedTextPairs().map((p) => p.name)).toEqual(
    expect.arrayContaining(['accent-fg on accent/0.15', 'hot-fg on hot/0.15', 'accent-fg on accent/0.12']),
  );
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
  it.each(DIFF_PAIRS)('%s on diff background %j meets 4.5:1', (fg, layers) => {
    const background = paint(t.surface!, ...layers.map((layer) => t[layer]!));
    expect(contrast(t[fg]!, background)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(tintedTextPairs())('$name meets 4.5:1 on surface and bg', ({ fg, tint, alpha }) => {
    const [r, g, b] = t[tint]!;
    for (const base of ['surface', 'bg']) {
      const background = paint(t[base]!, [r, g, b, alpha]);
      expect({ base, ratio: contrast(t[fg]!, background) >= 4.5 }).toEqual({ base, ratio: true });
    }
  });
});
