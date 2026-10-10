// Verifies what the build ships beyond the modules' directives:
//   - every sourceMappingURL in dist/ points to a file that is shipped;
//   - styles.css has no @layer (Tailwind v3 rejects it, and layered rules lose to any host reset);
//   - styles.css styles only the kit's elements, and leaves the app's theme alone:
//     - apart from the --signoff-* tokens on :root and the theme classes, every rule is scoped with
//       KIT (scripts/kit-scope.mjs), which matches the kit's elements and none of the app's, also
//       the app's content inside a component (renderTool, renderData, renderOutput);
//     - it declares only the kit's --signoff-* tokens and Tailwind's per-element --tw-* properties,
//       never a theme variable such as --spacing, --text-sm or --font-sans;
//     - it reads only those, Radix's measured --radix-* sizes, and in the tokens' defaults the
//       app's --font-sans and --font-mono (then Geist's) on purpose;
//     - its keyframes are all named signoff-*, so none replaces one of the app's.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { KIT } from './kit-scope.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const problems = [];

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );

for (const file of files(dist)) {
  const map = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(readFileSync(file, 'utf8'))?.[1];
  if (map && !existsSync(join(dirname(file), map)))
    problems.push(`${relative(root, file)}: points to ${map}, which is not shipped`);
}

const THEME_SELECTORS = new Set([':root', '.light', '[data-theme=light]', '.dark', '[data-theme=dark]']);
const css = readFileSync(join(dist, 'styles.css'), 'utf8');
const tree = postcss.parse(css);
tree.walkAtRules('layer', () => problems.push('styles.css: contains @layer'));
tree.walkRules((rule) => {
  if (rule.parent.type === 'atrule' && rule.parent.name === 'keyframes') return;
  // The root rule of the reset: line-height and tab-size on the components' roots.
  if (rule.selector === ':where([data-signoff])') return;
  if (rule.selectors.every((selector) => selector.includes(KIT))) return;
  const tokensOnly = rule.nodes.every((node) => node.type === 'decl' && node.prop.startsWith('--signoff-'));
  if (rule.selectors.every((selector) => THEME_SELECTORS.has(selector)) && tokensOnly) return;
  problems.push(`styles.css: \`${rule.selector.slice(0, 120)}\` is not scoped to the kit's elements`);
});
tree.walkDecls(/^--/, (decl) => {
  if (!/^--(signoff|tw)-/.test(decl.prop))
    problems.push(`styles.css: sets ${decl.prop}, a variable of the app's theme`);
});
const FONT_DEFAULTS = /^--(font-sans|font-mono|font-geist-sans|font-geist-mono)$/;
tree.walkDecls((decl) => {
  for (const [, name] of decl.value.matchAll(/var\((--[\w-]+)/g)) {
    if (/^--(signoff|tw|radix)-/.test(name)) continue;
    if (FONT_DEFAULTS.test(name) && /^--signoff-font-(sans|mono)$/.test(decl.prop)) continue;
    problems.push(`styles.css: ${decl.prop} reads ${name}, a variable of the app's theme`);
  }
});
tree.walkAtRules('keyframes', (rule) => {
  if (!rule.params.startsWith('signoff-')) problems.push(`styles.css: @keyframes ${rule.params} is not signoff-*`);
});
tree.walkAtRules('property', (rule) => {
  if (!rule.params.startsWith('--tw-')) problems.push(`styles.css: registers ${rule.params}`);
});
let reset = false;
tree.walkRules((rule) => {
  if (rule.selectors.includes(`*${KIT}`) && rule.some((node) => node.prop === 'padding' && node.value === '0'))
    reset = true;
});
if (!reset) problems.push("styles.css: the zero-specificity reset of the kit's elements is missing");

if (problems.length > 0) {
  console.error(`dist/ check failed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(
  "dist: source maps resolve; styles.css is unlayered, scoped to the kit's elements and sets none of the app's theme",
);
