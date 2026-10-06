import { applyPatch, structuredPatch } from 'diff';
import { describe, expect, it } from 'vitest';
import { applyHunks, inferLanguage, parseFileChange } from '../src/lib/diff';
import { ROUTE_NEW, ROUTE_OLD } from './fixtures';

describe('parseFileChange', () => {
  it('splits a change into hunks with line numbers', () => {
    const file = parseFileChange({ path: 'app/api/chat/route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW });
    expect(file.status).toBe('modified');
    expect(file.language).toBe('ts');
    expect(file.hunks).toHaveLength(3);
    expect(file.additions).toBe(11);
    expect(file.deletions).toBe(1);
    const first = file.hunks[0]!;
    expect(first.id).toBe('app/api/chat/route.ts:0');
    const added = first.lines.find((l) => l.type === 'add');
    expect(added).toMatchObject({ content: "import { ratelimit } from '@/lib/ratelimit';", newNumber: 4 });
  });

  it('pairs similar changed lines with word-level segments', () => {
    const file = parseFileChange({ path: 'a.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW });
    const del = file.hunks.flatMap((h) => h.lines).find((l) => l.type === 'del')!;
    const add = file.hunks.flatMap((h) => h.lines).find((l) => l.type === 'add' && l.content.includes('gpt-4.1-mini'))!;
    // Unchanged text is shared; only the model id differs.
    expect(
      del.segments
        ?.filter((s) => !s.changed)
        .map((s) => s.text)
        .join(''),
    ).toContain('model: openai(');
    expect(
      del.segments
        ?.filter((s) => s.changed)
        .map((s) => s.text)
        .join(''),
    ).toContain('4o');
    expect(
      add.segments
        ?.filter((s) => s.changed)
        .map((s) => s.text)
        .join(''),
    ).toContain('mini');
    // Segments reassemble the full line.
    expect(add.segments?.map((s) => s.text).join('')).toBe(add.content);
    expect(del.segments?.map((s) => s.text).join('')).toBe(del.content);
  });

  describe('word-level highlights on long lines', () => {
    /** A long single-line JSON object, as in a minified data file. */
    const json = (n: number, seed: number) => {
      let s = seed;
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        s = (s * 1103515245 + 12345) >>> 0;
        out.push(`"k${s % 5000}":${s % 97}`);
      }
      return `{${out.join(',')}}\n`;
    };
    const segmentsOf = (file: ReturnType<typeof parseFileChange>) =>
      file.hunks.flatMap((h) => h.lines).filter((l) => l.segments);

    it('skips them for rewritten long lines instead of freezing the page', () => {
      const start = performance.now();
      const file = parseFileChange({ path: 'data.json', oldContent: json(10_000, 1), newContent: json(10_000, 2) });
      expect(performance.now() - start).toBeLessThan(500);
      expect(file.hunks[0]!.lines.map((l) => l.type)).toEqual(['del', 'add']);
      expect(segmentsOf(file)).toEqual([]);
    });

    it('bounds the work on rewritten lines below the length cap too', () => {
      const lines = (seed: number) => [1, 2, 3, 4, 5].map((i) => json(900, seed * 10 + i)).join('');
      expect(lines(1).split('\n')[0]!.length).toBeLessThan(10_000);
      const start = performance.now();
      const file = parseFileChange({ path: 'data.json', oldContent: lines(1), newContent: lines(2) });
      expect(performance.now() - start).toBeLessThan(500);
      expect(file.hunks[0]!.deletions).toBe(5);
      expect(segmentsOf(file)).toEqual([]);
    });

    it('keeps them for a small edit in a long line', () => {
      const oldContent = json(400, 1);
      const key = /"(k\d+)"/.exec(oldContent)![1]!;
      const newContent = oldContent.replace(`"${key}"`, `"renamed_${key}"`);
      expect(oldContent.length).toBeGreaterThan(4_000);
      const file = parseFileChange({ path: 'data.json', oldContent, newContent });
      const [del, add] = segmentsOf(file);
      expect(del!.segments!.filter((s) => s.changed).map((s) => s.text)).toEqual([key]);
      expect(add!.segments!.filter((s) => s.changed).map((s) => s.text)).toEqual([`renamed_${key}`]);
    });
  });

  it('detects added and deleted files', () => {
    expect(parseFileChange({ path: 'new.ts', oldContent: '', newContent: 'a\n' }).status).toBe('added');
    expect(parseFileChange({ path: 'old.ts', oldContent: 'a\n', newContent: '' }).status).toBe('deleted');
    expect(parseFileChange({ path: 'b.ts', oldPath: 'a.ts', oldContent: 'a\n', newContent: 'a\n' }).status).toBe(
      'renamed',
    );
  });

  it('accepts a unified patch when contents are unavailable', () => {
    const patch = ['--- a/x.ts', '+++ b/x.ts', '@@ -1,2 +1,2 @@', ' keep', '-old', '+new', ''].join('\n');
    const file = parseFileChange({ path: 'x.ts', patch });
    expect(file.status).toBe('modified');
    expect(file.hunks).toHaveLength(1);
    expect(file.hunks[0]!.lines.map((l) => l.type)).toEqual(['context', 'del', 'add']);
  });

  it('reports renames given only a patch', () => {
    const body = ['--- a/old.ts', '+++ b/new.ts', '@@ -1,2 +1,2 @@', ' a', '-b', '+c', ''].join('\n');
    const git = ['diff --git a/old.ts b/new.ts', 'similarity index 90%', 'rename from old.ts', 'rename to new.ts'];
    expect(parseFileChange({ path: 'new.ts', oldPath: 'old.ts', patch: body }).status).toBe('renamed');
    expect(parseFileChange({ path: 'new.ts', patch: [...git, body].join('\n') }).status).toBe('renamed');
    expect(parseFileChange({ path: 'new.ts', oldPath: 'new.ts', patch: body }).status).toBe('modified');
    const added = ['--- /dev/null', '+++ b/new.ts', '@@ -0,0 +1 @@', '+a', ''].join('\n');
    expect(parseFileChange({ path: 'new.ts', oldPath: 'old.ts', patch: added }).status).toBe('added');
  });

  it('infers languages from extensions', () => {
    expect(inferLanguage('a/b.tsx')).toBe('tsx');
    expect(inferLanguage('README.md')).toBe('md');
    expect(inferLanguage('Makefile')).toBe('text');
  });
});

describe('applyHunks', () => {
  const cases: Array<[string, string, string]> = [
    ['route', ROUTE_OLD, ROUTE_NEW],
    ['new file', '', 'one\ntwo\n'],
    ['deleted file', 'one\ntwo\n', ''],
    ['no trailing newline', 'a\nb\nc', 'a\nB\nc'],
    ['adds trailing newline', 'a\nb', 'a\nb\n'],
    ['insertion at start', 'b\nc\n', 'a\nb\nc\n'],
    [
      'far apart edits',
      Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') + '\n',
      Array.from({ length: 40 }, (_, i) => (i === 2 || i === 35 ? `LINE ${i}` : `line ${i}`)).join('\n') + '\n',
    ],
  ];

  it.each(cases)('%s: accepting all yields the new content, rejecting all the old', (_name, oldContent, newContent) => {
    const file = parseFileChange({ path: 'f.ts', oldContent, newContent });
    expect(
      applyHunks(
        file,
        file.hunks.map((h) => h.id),
      ),
    ).toBe(newContent);
    expect(applyHunks(file, [])).toBe(oldContent);
  });

  it.each([0, 1, 3])('places pure insertions correctly with %i lines of context', (context) => {
    const oldContent = 'a\nb\nc\n';
    const newContent = 'a\nb\nX\nc\n';
    const file = parseFileChange({ path: 'f.ts', oldContent, newContent }, { context });
    expect(
      applyHunks(
        file,
        file.hunks.map((h) => h.id),
      ),
    ).toBe(newContent);
    expect(applyHunks(file, [])).toBe(oldContent);
  });

  it('applies a subset of hunks', () => {
    const oldContent = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') + '\n';
    const lines = oldContent.split('\n');
    lines[2] = 'LINE 2';
    lines[35] = 'LINE 35';
    const file = parseFileChange({ path: 'f.ts', oldContent, newContent: lines.join('\n') });
    expect(file.hunks).toHaveLength(2);
    const onlySecond = applyHunks(file, [file.hunks[1]!.id]);
    expect(onlySecond).toContain('line 2\n');
    expect(onlySecond).toContain('LINE 35\n');
  });
});

/** Deterministic PRNG (LCG), so failures reproduce. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const VOCAB = ['a', 'b', 'c', 'd', 'e', '', 'f g', 'const x = 1;'];

function randomFile(r: () => number, eol: string): string {
  const n = Math.floor(r() * 9);
  if (n === 0) return '';
  const lines = Array.from({ length: n }, () => VOCAB[Math.floor(r() * VOCAB.length)]!);
  return lines.join(eol) + (r() < 0.7 ? eol : '');
}

/** Delete, replace and insert random lines; sometimes flip the trailing newline. */
function mutate(r: () => number, text: string, eol: string): string {
  const pick = () => VOCAB[Math.floor(r() * VOCAB.length)]!;
  const hasEol = text.endsWith(eol);
  const lines = text === '' ? [] : (hasEol ? text.slice(0, -eol.length) : text).split(eol);
  const out: string[] = [];
  for (const line of lines) {
    const x = r();
    if (x < 0.15) continue;
    out.push(x < 0.3 ? pick() : line);
    if (r() < 0.15) out.push(pick());
  }
  if (r() < 0.2) out.unshift(pick());
  if (out.length === 0) return '';
  return out.join(eol) + ((r() < 0.5 ? hasEol : !hasEol) ? eol : '');
}

describe('applyHunks matches jsdiff applyPatch (property test)', () => {
  for (const context of [0, 1, 3]) {
    for (const eol of ['\n', '\r\n']) {
      it(`context ${context}, ${JSON.stringify(eol)} line endings, every subset of hunks`, () => {
        const r = rng(42 + context * 7 + eol.length);
        let checked = 0;
        for (let iter = 0; iter < 2000; iter++) {
          const oldContent = randomFile(r, eol);
          const newContent = mutate(r, oldContent, eol);
          const file = parseFileChange({ path: 'f.ts', oldContent, newContent }, { context });
          const patch = structuredPatch('f.ts', 'f.ts', oldContent, newContent, undefined, undefined, { context });
          const raw = patch.hunks;
          expect(file.hunks).toHaveLength(raw.length);
          const n = file.hunks.length;
          const subsets =
            n <= 4
              ? Array.from({ length: 1 << n }, (_, m) => [...Array(n).keys()].filter((k) => m & (1 << k)))
              : Array.from({ length: 8 }, () => [...Array(n).keys()].filter(() => r() < 0.5));
          for (const subset of subsets) {
            // The oracle: jsdiff applying the same subset of its own hunks to the original.
            const expected = applyPatch(oldContent, { ...patch, hunks: subset.map((k) => raw[k]!) });
            const actual = applyHunks(
              file,
              subset.map((k) => file.hunks[k]!.id),
            );
            expect({ oldContent, newContent, subset, result: actual }).toEqual({
              oldContent,
              newContent,
              subset,
              result: expected,
            });
            checked++;
          }
        }
        expect(checked).toBeGreaterThan(2000);
      });
    }
  }

  it('numbers every line after the source line it shows', () => {
    const r = rng(7);
    for (let iter = 0; iter < 2000; iter++) {
      for (const context of [0, 1, 3]) {
        const oldContent = randomFile(r, '\n');
        const newContent = mutate(r, oldContent, '\n');
        const file = parseFileChange({ path: 'f.txt', oldContent, newContent }, { context });
        const oldLines = oldContent.replace(/\n$/, '').split('\n');
        const newLines = newContent.replace(/\n$/, '').split('\n');
        for (const line of file.hunks.flatMap((h) => h.lines)) {
          if (line.oldNumber !== undefined) expect(oldLines[line.oldNumber - 1]).toBe(line.content);
          if (line.newNumber !== undefined) expect(newLines[line.newNumber - 1]).toBe(line.content);
        }
      }
    }
  });
});
