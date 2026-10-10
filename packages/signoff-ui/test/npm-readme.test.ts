// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * npm publishes the repository's README (scripts/npm-readme.mjs writes it into the package
 * while it is packed): the same sections as on GitHub, the demo video swapped for an image,
 * and every link and image absolute, since npm resolves relative ones against this folder.
 */

const pkg = fileURLToPath(new URL('../', import.meta.url));
const rootReadme = readFileSync(join(pkg, '../../README.md'), 'utf8');

describe('the README on npm', () => {
  // `npm pack` takes about 4 s here, more under coverage or on a busy runner: past Vitest's 5 s default.
  it('is the repository README, with absolute links and no video', { timeout: 60_000 }, () => {
    expect(rootReadme).toMatch(/^https:\/\/github\.com\/user-attachments\/assets\/[\da-f-]{36}$/m);

    const dir = mkdtempSync(join(tmpdir(), 'npm-readme-'));
    try {
      const packed = JSON.parse(
        execFileSync('npm', ['pack', '--json', '--pack-destination', dir], { cwd: pkg, encoding: 'utf8' }),
      ) as { filename: string }[];
      const filename = packed[0]?.filename;
      expect(filename).toBeTypeOf('string');
      execFileSync('tar', ['-xzf', join(dir, String(filename)), '-C', dir, 'package/README.md']);
      const npmReadme = readFileSync(join(dir, 'package/README.md'), 'utf8');

      const headings = (md: string) => md.match(/^#{2,3} .+$/gm);
      expect(headings(npmReadme)).toEqual(headings(rootReadme));
      expect(npmReadme).not.toContain('github.com/user-attachments');
      expect(npmReadme).not.toContain('npm-readme:');
      expect(npmReadme).toContain(
        'src="https://raw.githubusercontent.com/dgesteves/signoff-ui/main/docs/media/demo.webp"',
      );
      const urls = [...npmReadme.matchAll(/\]\(([^)\s]+)|\b(?:src|href)="([^"]+)"/g)].map((m) => m[1] ?? m[2] ?? '');
      expect(urls.filter((url) => !/^(https?:|mailto:|#)/.test(url))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // postpack removed the generated README again.
    expect(existsSync(join(pkg, 'README.md'))).toBe(false);
  });
});
