// Verifies what the build ships beyond the modules' directives:
//   - styles.css has no @layer (Tailwind v3 rejects it, and layered rules lose to any host reset);
//   - styles.css styles only the kit's elements: apart from the --aui-* tokens on :root and the
//     theme classes, every rule is scoped to [data-aui], so it cannot restyle the host app or
//     shadow its Tailwind theme.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const problems = [];

const THEME_SELECTORS = new Set([':root', '.light', '[data-theme=light]', '.dark', '[data-theme=dark]']);
const css = readFileSync(join(dist, 'styles.css'), 'utf8');
const tree = postcss.parse(css);
tree.walkAtRules('layer', () => problems.push('styles.css: contains @layer'));
tree.walkRules((rule) => {
  if (rule.parent.type === 'atrule' && rule.parent.name === 'keyframes') return;
  if (rule.selectors.every((selector) => selector.includes('[data-aui]'))) return;
  const tokensOnly = rule.nodes.every((node) => node.type === 'decl' && node.prop.startsWith('--aui-'));
  if (rule.selectors.every((selector) => THEME_SELECTORS.has(selector)) && tokensOnly) return;
  problems.push(`styles.css: \`${rule.selector}\` is not scoped to [data-aui]`);
});
if (!/:where\(\[data-aui\]\) \*[^{]*\{[^}]*padding:0/.test(css))
  problems.push('styles.css: the zero-specificity :where([data-aui]) reset is missing');

if (problems.length > 0) {
  console.error(`dist/ check failed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('dist: styles.css is unlayered and scoped to [data-aui]');
