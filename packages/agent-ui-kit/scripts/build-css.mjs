// Builds the stylesheets shipped in dist/:
//   theme.css           plain CSS variables (light on :root, dark on .dark)
//   tailwind.css        for Tailwind v4 apps: tokens + @theme mapping + @source for the bundle
//   styles.css          precompiled standalone stylesheet for apps without Tailwind v4, with no @layer
//   styles.layered.css  the same stylesheet in cascade layers, as Tailwind emits it
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src/styles');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

copyFileSync(join(src, 'theme.css'), join(dist, 'theme.css'));

const tokens = readFileSync(join(src, 'tokens.css'), 'utf8');
writeFileSync(
  join(dist, 'tailwind.css'),
  `/* @dgesteves/agent-ui-kit for Tailwind CSS v4. Import after "tailwindcss". */\n@import './theme.css';\n\n${tokens}\n/* Let Tailwind see the class names used by the components. */\n@source './**/*.js';\n`,
);

execFileSync('tailwindcss', ['-i', join(src, 'standalone.css'), '-o', join(dist, 'styles.layered.css'), '--minify'], {
  stdio: 'inherit',
  cwd: root,
});

/*
 * Confine the stylesheet to the kit's own elements. Tailwind writes its theme variables on :root,
 * its @property fallbacks on every element, and utilities as global classes; dropped into an app
 * that has its own Tailwind theme or its own `.border` or `.p-4`, those would restyle the app.
 * Utilities get `:where([data-aui], [data-aui] *)`, which adds no specificity.
 */
const KIT = selectorParser().astSync(':where([data-aui],[data-aui] *)').first.first;

const scopeSelector = selectorParser((selectors) => {
  selectors.each((selector) => {
    // The last compound selector is the element the rule styles; a pseudo-element must stay last.
    let insertAt;
    for (let i = selector.nodes.length - 1; i >= 0; i--) {
      const node = selector.nodes[i];
      if (node.type === 'combinator') break;
      if (node.type === 'pseudo' && /^::|^:(before|after|first-line|first-letter)$/.test(node.value)) insertAt = node;
    }
    if (insertAt) selector.insertBefore(insertAt, KIT.clone());
    else selector.append(KIT.clone());
  });
});

function scope(css) {
  const tree = postcss.parse(css);
  tree.walkAtRules('layer', (layer) => {
    if (!layer.nodes) return;
    layer.walkRules((rule) => {
      if (rule.parent.type === 'atrule' && rule.parent.name === 'keyframes') return;
      if (layer.params === 'theme') {
        if (rule.selector !== ':root,:host') throw new Error(`theme layer: unexpected selector ${rule.selector}`);
        rule.selector = ':where([data-aui])';
      } else if (layer.params === 'base') {
        if (!rule.selector.includes('[data-aui]')) throw new Error(`base layer: unscoped selector ${rule.selector}`);
      } else {
        rule.selector = scopeSelector.processSync(rule.selector);
      }
    });
  });
  return tree.toString();
}

/*
 * styles.css has no @layer. Tailwind v3 rejects `@layer base` in a file without `@tailwind base`,
 * and a layered rule loses to every unlayered one, so a plain `* { padding: 0 }` reset emptied the
 * approval card. Unlayered, the utilities win on specificity and the reset keeps zero specificity.
 */
function unlayer(css) {
  const tree = postcss.parse(css);
  tree.walkAtRules('layer', (layer) => {
    if (layer.nodes) layer.replaceWith(layer.nodes);
    else layer.remove();
  });
  return tree.toString();
}

const layered = scope(readFileSync(join(dist, 'styles.layered.css'), 'utf8'));
writeFileSync(join(dist, 'styles.layered.css'), layered);
writeFileSync(join(dist, 'styles.css'), unlayer(layered));
console.log('css: wrote dist/theme.css, tailwind.css, styles.css, styles.layered.css');
