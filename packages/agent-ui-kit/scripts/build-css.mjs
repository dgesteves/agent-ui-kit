// Builds the three stylesheets shipped in dist/:
//   theme.css     plain CSS variables (light on :root, dark on .dark)
//   tailwind.css  for Tailwind v4 apps: tokens + @theme mapping + @source for the bundle
//   styles.css    precompiled standalone stylesheet for apps without Tailwind
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src/styles');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

copyFileSync(join(src, 'theme.css'), join(dist, 'theme.css'));

const tokens = readFileSync(join(src, 'tokens.css'), 'utf8');
writeFileSync(
  join(dist, 'tailwind.css'),
  `/* @dgesteves/agent-ui-kit for Tailwind CSS v4. Import after "tailwindcss". */\n@import './theme.css';\n\n${tokens}\n/* Let Tailwind see the class names used by the components. */\n@source './index.js';\n`,
);

execFileSync('tailwindcss', ['-i', join(src, 'standalone.css'), '-o', join(dist, 'styles.css'), '--minify'], {
  stdio: 'inherit',
  cwd: root,
});
console.log('css: wrote dist/theme.css, dist/tailwind.css, dist/styles.css');
