// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The quickstart is examples/nextjs-minimal, which CI builds and runs in Chrome. The README shows
 * excerpts of it: each block that starts with `// app/... (excerpt)` is that file of the example,
 * in pieces separated by `// …` lines, each piece taken whole and in order, whatever its indent.
 * Getting started on the docs site shows the files in full. Both may use a real model where the
 * example uses the scripted one.
 */

const root = fileURLToPath(new URL('../../../', import.meta.url));
const example = join(root, 'examples/nextjs-minimal');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const quickstart = readme.slice(
  readme.indexOf('## Quickstart'),
  readme.indexOf('\n## ', readme.indexOf('## Quickstart') + 1),
);
const guide = readFileSync(join(root, 'examples/playground/content/docs/getting-started.md'), 'utf8');
const walkthrough = guide.slice(
  guide.indexOf('## Render a run'),
  guide.indexOf('\n## ', guide.indexOf('## Render a run') + 1),
);

const excerpts = [...quickstart.matchAll(/```tsx?\n\/\/ (app\/\S+) \(excerpt\)\n([\s\S]*?)```/g)].map(
  ([, path, code]) => ({ path: path!, code: code! }),
);
const files = [...walkthrough.matchAll(/```tsx? title="(app\/\S+)"\n([\s\S]*?)```/g)].map(([, path, code]) => ({
  path: path!,
  code: code!,
}));

/** The model is the one line that differs: `openai(...)` in the docs, the scripted model in the example. */
const withoutModel = (code: string) =>
  code
    .split('\n')
    .filter((line) => !/from '(@ai-sdk\/openai|@\/lib\/mock-model)'/.test(line))
    .map((line) => line.replace(/^(\s*)model: .*$/, '$1model,'))
    .join('\n');

const lines = (code: string) =>
  withoutModel(code)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const read = (path: string) => readFileSync(join(example, path), 'utf8');

const imports = (blocks: Array<{ code: string }>) => {
  const names = new Set(
    blocks.flatMap(({ code }) => [...code.matchAll(/from '((?:@[^/']+\/)?[^/'.@][^/']*)/g)].map(([, name]) => name!)),
  );
  names.delete('react');
  return [...names];
};

describe('README quickstart', () => {
  it('shows the route, then the page, of the runnable example', () => {
    expect(excerpts.map((block) => block.path)).toEqual(['app/api/chat/route.ts', 'app/agent-run.tsx']);
  });

  it.each(excerpts)('$path is an excerpt of the example', ({ path, code }) => {
    expect(existsSync(join(example, path))).toBe(true);
    const file = lines(read(path));
    let from = 0;
    for (const piece of code
      .split(/^\s*\/\/ …$/m)
      .map(lines)
      .filter((piece) => piece.length > 0)) {
      const at = file.findIndex((_, i) => i >= from && piece.every((line, j) => file[i + j] === line));
      expect(at, `not in ${path}, in this order:\n${piece.join('\n')}`).toBeGreaterThanOrEqual(0);
      from = at + piece.length;
    }
  });

  it('installs every package the excerpts import', () => {
    const install = /```bash\nnpm i (signoff-ui [^\n]+)\n```/.exec(quickstart)?.[1]?.split(' ') ?? [];
    expect(imports(excerpts).filter((name) => !install.includes(name))).toEqual([]);
  });
});

describe('Getting started', () => {
  it('shows the client, the page and the route of the runnable example', () => {
    expect(files.map((block) => block.path)).toEqual(['app/agent-run.tsx', 'app/page.tsx', 'app/api/chat/route.ts']);
  });

  it.each(files)('$path is the example file', ({ path, code }) => {
    expect(withoutModel(code)).toBe(withoutModel(read(path)));
  });

  it('installs every package the walkthrough imports', () => {
    const install = /```package-install\nnpm i (signoff-ui [^\n]+)\n```/.exec(walkthrough)?.[1]?.split(' ') ?? [];
    expect(imports(files).filter((name) => !install.includes(name))).toEqual([]);
  });
});
