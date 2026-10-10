import { structuredPatch } from 'diff';
import { describe, expect, it } from 'vitest';
import { applyHunks, DEFAULT_MAX_EDIT_LENGTH, parseFileChange, parseWithin } from '../src/lib/diff';

const lines = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => `export const ${prefix}${i} = compute(${i});`);
const text = (rows: string[]) => rows.join('\n') + '\n';
const changedLines = (oldContent: string, newContent: string) =>
  structuredPatch('', '', oldContent, newContent, undefined, undefined, { context: 3 })
    .hunks.flatMap((h) => h.lines)
    .filter((l) => l[0] === '+' || l[0] === '-').length;

describe('maxEditLength', () => {
  it('shows a file that changed past the limit as one hunk replacing the changed region', () => {
    const oldContent = text(lines(800, 'a'));
    const newContent = text(lines(800, 'b'));
    const file = parseFileChange({ path: 'a.ts', oldContent, newContent }, { maxEditLength: 1_000 });
    expect(file.fallback).toBe('replace');
    expect(file.hunks).toHaveLength(1);
    expect(file.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 800, newStart: 1, newLines: 800 });
    expect(file).toMatchObject({ additions: 800, deletions: 800 });
    // No word-level highlights: pairing lines of an unrelated rewrite is noise.
    expect(file.hunks[0]!.lines.some((l) => l.segments)).toBe(false);
    // The review still applies: accepted is the new file, rejected the old one.
    expect(applyHunks(file, [file.hunks[0]!.id])).toBe(newContent);
    expect(applyHunks(file, [])).toBe(oldContent);
  });

  it('keeps the unchanged lines around the region out of the replacing hunk, bar its context', () => {
    const head = lines(500, 'h');
    const tail = lines(500, 't');
    const oldContent = text([...head, ...lines(700, 'a'), ...tail]);
    const newContent = text([...head, ...lines(600, 'b'), ...tail]);
    const file = parseFileChange({ path: 'a.ts', oldContent, newContent }, { maxEditLength: 1_000 });
    expect(file.fallback).toBe('replace');
    const [hunk] = file.hunks;
    expect(hunk).toMatchObject({ oldStart: 498, oldLines: 706, newStart: 498, newLines: 606 });
    expect(hunk!.lines.slice(0, 3).map((l) => [l.type, l.oldNumber, l.newNumber])).toEqual([
      ['context', 498, 498],
      ['context', 499, 499],
      ['context', 500, 500],
    ]);
    expect(hunk!.lines.at(-1)).toMatchObject({ type: 'context', oldNumber: 1203, newNumber: 1103 });
    expect(applyHunks(file, [hunk!.id])).toBe(newContent);
  });

  it('diffs normally within the limit, with the default at 2,000', () => {
    expect(DEFAULT_MAX_EDIT_LENGTH).toBe(2_000);
    const oldContent = text(lines(800, 'a'));
    const newContent = text(lines(800, 'b'));
    const file = parseFileChange({ path: 'a.ts', oldContent, newContent });
    expect(file.fallback).toBeUndefined();
    expect(file.additions + file.deletions).toBe(1_600);
    // Similar line pairs keep their word-level highlights.
    expect(file.hunks[0]!.lines.some((l) => l.segments)).toBe(true);
  });

  it('never falls back for lines only added or only removed, however many', () => {
    const big = text(lines(5_000, 'n'));
    for (const [oldContent, newContent] of [
      ['', big],
      [big, ''],
      ['top\nbottom\n', `top\n${big}bottom\n`],
    ]) {
      const start = performance.now();
      const file = parseFileChange({ path: 'a.ts', oldContent, newContent }, { maxEditLength: 10 });
      expect(performance.now() - start).toBeLessThan(500);
      expect(file.fallback).toBeUndefined();
      expect(file.additions + file.deletions).toBe(5_000);
      expect(
        applyHunks(
          file,
          file.hunks.map((h) => h.id),
        ),
      ).toBe(newContent);
    }
  });

  it('counts only the changed region against the limit, so an edit in a huge file stays a real diff', () => {
    const rows = lines(20_000, 'a');
    const edited = [...rows];
    edited[10_000] = 'export const changed = 1;';
    const file = parseFileChange(
      { path: 'a.ts', oldContent: text(rows), newContent: text(edited) },
      { maxEditLength: 4 },
    );
    expect(file.fallback).toBeUndefined();
    expect(file.hunks).toHaveLength(1);
    expect(file.hunks[0]).toMatchObject({ oldStart: 9_998, oldLines: 7, newStart: 9_998, newLines: 7 });
  });

  it('changes as few lines as a diff of the whole files', () => {
    const rows = lines(300, 'a');
    const edited = rows.map((l, i) => (i % 7 === 0 ? l.replace('compute', 'measure') : l));
    edited.splice(150, 0, 'inserted();');
    const [oldContent, newContent] = [text(rows), text(edited).replace(/\n$/, '')];
    const file = parseFileChange({ path: 'a.ts', oldContent, newContent });
    expect(file.additions + file.deletions).toBe(changedLines(oldContent, newContent));
    expect(
      applyHunks(
        file,
        file.hunks.map((h) => h.id),
      ),
    ).toBe(newContent);
  });
});

describe('parseWithin', () => {
  const oldContent = text(lines(400, 'a'));
  const newContent = text(lines(400, 'b'));

  it('returns nothing when the diff would take more edits than the budget', () => {
    expect(parseWithin({ path: 'a.ts', oldContent, newContent }, {}, 300)).toBeUndefined();
  });

  it('returns the same result as parseFileChange within it', () => {
    const local = text(lines(400, 'a').map((l, i) => (i === 200 ? 'changed();' : l)));
    expect(parseWithin({ path: 'a.ts', oldContent, newContent: local }, {}, 300)).toEqual(
      parseFileChange({ path: 'a.ts', oldContent, newContent: local }),
    );
  });

  it('falls back within the budget when the limit is below it', () => {
    const file = parseWithin({ path: 'a.ts', oldContent, newContent }, { maxEditLength: 100 }, 300);
    expect(file?.fallback).toBe('replace');
  });

  it('always parses a patch, which needs no diffing', () => {
    const patch = ['--- a/x.ts', '+++ b/x.ts', '@@ -1 +1 @@', '-a', '+b', ''].join('\n');
    expect(parseWithin({ path: 'x.ts', patch }, {}, 0)?.hunks).toHaveLength(1);
  });
});
