// Verifies that every built module carries the same 'use client' directive as
// its source module, and that the entry points do not. A missing directive
// breaks components in React Server Components; an extra one turns the pure
// helpers into client references that Server Components cannot call.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = join(root, 'dist');

const directive = (code) => /^\s*(['"])use client\1;?/.test(code);

function modules(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'styles' ? [] : modules(path);
    return /\.tsx?$/.test(entry.name) ? [relative(src, path)] : [];
  });
}

const problems = [];
let clientModules = 0;
for (const file of modules(src)) {
  const out = join(dist, file.replace(/\.tsx?$/, '.js'));
  if (!existsSync(out)) {
    problems.push(`${file}: no built module at ${relative(root, out)}`);
    continue;
  }
  const expected = directive(readFileSync(join(src, file), 'utf8'));
  const actual = directive(readFileSync(out, 'utf8'));
  if (expected) clientModules++;
  if (expected !== actual) problems.push(`${file}: 'use client' ${expected ? 'missing from' : 'added to'} the build`);
}
for (const entry of ['index.js', 'core.js', 'ag-ui.js']) {
  if (directive(readFileSync(join(dist, entry), 'utf8')))
    problems.push(`${entry}: entry points must not be client modules`);
}

if (problems.length > 0) {
  console.error(`'use client' directives do not match the source:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`directives: ${clientModules} client modules, entries and helpers are server-safe`);
