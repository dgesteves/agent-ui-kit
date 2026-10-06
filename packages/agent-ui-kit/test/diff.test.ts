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
