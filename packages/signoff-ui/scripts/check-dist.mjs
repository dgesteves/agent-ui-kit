// Verifies what the build ships beyond the modules' directives:
//   - every sourceMappingURL in dist/ points to a file that is shipped;
//   - styles.css has no @layer (Tailwind v3 rejects it, and layered rules lose to any host reset);
//   - styles.css styles only the kit's elements: apart from the --signoff-* tokens on :root and the
//     theme classes, every rule is scoped to [data-signoff], so it cannot restyle the host app or
//     shadow its Tailwind theme and fonts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

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
  if (rule.selectors.every((selector) => selector.includes('[data-signoff]'))) return;
  const tokensOnly = rule.nodes.every((node) => node.type === 'decl' && node.prop.startsWith('--signoff-'));
  if (rule.selectors.every((selector) => THEME_SELECTORS.has(selector)) && tokensOnly) return;
  problems.push(`styles.css: \`${rule.selector}\` is not scoped to [data-signoff]`);
});
tree.walkDecls(/^--font-(sans|mono)$/, (decl) =>
  problems.push(`styles.css: sets ${decl.prop}, which would hide the app's font from --signoff-font-*`),
);
if (!/:where\(\[data-signoff\]\) \*[^{]*\{[^}]*padding:0/.test(css))
  problems.push('styles.css: the zero-specificity :where([data-signoff]) reset is missing');

if (problems.length > 0) {
  console.error(`dist/ check failed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('dist: source maps resolve; styles.css is unlayered and scoped to [data-signoff]');
