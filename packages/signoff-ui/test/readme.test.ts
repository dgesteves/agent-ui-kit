// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The README quickstart is examples/nextjs-minimal, which CI builds and runs in Chrome. Each README
 * block that starts with a `// app/...` path comment must be that file of the example, except that
 * the README's route uses a real model where the example's uses the scripted one.
 */

const root = fileURLToPath(new URL('../../../', import.meta.url));
const example = join(root, 'examples/nextjs-minimal');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const quickstart = readme.slice(readme.indexOf('## Quickstart'), readme.indexOf('#### Server Components'));

const blocks = [...quickstart.matchAll(/```tsx?\n\/\/ (app\/\S+)\n([\s\S]*?)```/g)].map(([, path, code]) => ({
  path: path!,
  code: code!,
}));

/** The model is the one line that differs: `openai(...)` in the README, the scripted model in the example. */
const withoutModel = (code: string) =>
  code
    .split('\n')
    .filter((line) => !/from '(@ai-sdk\/openai|@\/lib\/mock-model)'/.test(line))
    .map((line) => line.replace(/^(\s*)model: .*$/, '$1model,'))
    .join('\n');

describe('README quickstart', () => {
  it('shows the client, the page and the route of the runnable example', () => {
    expect(blocks.map((block) => block.path)).toEqual(['app/agent-run.tsx', 'app/page.tsx', 'app/api/chat/route.ts']);
  });

  it.each(blocks)('$path matches the example', ({ path, code }) => {
    expect(existsSync(join(example, path))).toBe(true);
    expect(withoutModel(code)).toBe(withoutModel(readFileSync(join(example, path), 'utf8')));
  });

  it('installs every package the quickstart imports', () => {
    const install = /```bash\npnpm add (signoff-ui [^\n]+)\n```/.exec(quickstart)?.[1]?.split(' ') ?? [];
    const imported = new Set(
      blocks.flatMap(({ code }) => [...code.matchAll(/from '((?:@[^/']+\/)?[^/'.@][^/']*)/g)].map(([, name]) => name!)),
    );
    imported.delete('react');
    expect([...imported].filter((name) => !install.includes(name))).toEqual([]);
  });
});
