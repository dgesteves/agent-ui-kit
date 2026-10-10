import { applyPatch, parsePatch } from 'diff';
import { describe, expect, it } from 'vitest';
import { applyHunks, parseFileChange } from '../src/lib/diff';
import {
  computeReviewResult,
  contextGaps,
  gapLines,
  hunkRange,
  linesRange,
  reviewItems,
  reviewResumeEntry,
  reviewToolOutput,
  toPatch,
  type DiffReviewComment,
} from '../src/lib/review';
import { ROUTE_NEW, ROUTE_OLD } from './fixtures';

const route = () => parseFileChange({ path: 'app/route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW });

/** Deterministic PRNG (LCG), so failures reproduce. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
const VOCAB = ['a', 'b', 'c', 'd', '', 'f g', 'const x = 1;'];
function randomFile(r: () => number) {
  const n = Math.floor(r() * 30);
  if (n === 0) return '';
  return Array.from({ length: n }, () => VOCAB[Math.floor(r() * VOCAB.length)]!).join('\n') + (r() < 0.7 ? '\n' : '');
}
function mutate(r: () => number, text: string) {
  const eol = text.endsWith('\n');
  const lines = text === '' ? [] : (eol ? text.slice(0, -1) : text).split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const x = r();
    if (x < 0.12) continue;
    out.push(x < 0.25 ? VOCAB[Math.floor(r() * VOCAB.length)]! : line);
    if (r() < 0.12) out.push(VOCAB[Math.floor(r() * VOCAB.length)]!);
  }
  if (out.length === 0) return '';
  return out.join('\n') + ((r() < 0.5 ? eol : !eol) ? '\n' : '');
}

describe('reviewItems', () => {
  it('is the hunks of a changed file', () => {
    const file = route();
    expect(reviewItems(file).map((i) => i.id)).toEqual(file.hunks.map((h) => h.id));
  });

  it('is the file itself when it has no hunks but changed: binary, renamed, or empty', () => {
    const binary = parseFileChange({ path: 'logo.png', oldContent: 'a\u0000', newContent: 'b\u0000' });
    expect(binary.binary).toBe(true);
    expect(reviewItems(binary)).toEqual([{ id: 'logo.png:file', file: binary, hunk: undefined }]);
    const renamed = parseFileChange({ path: 'b.ts', oldPath: 'a.ts', oldContent: 'x\n', newContent: 'x\n' });
    expect(reviewItems(renamed).map((i) => i.id)).toEqual(['b.ts:file']);
    const empty = parseFileChange({ path: 'new.ts', oldContent: '', newContent: '' });
    expect(empty.status).toBe('added');
    expect(reviewItems(empty).map((i) => i.id)).toEqual(['new.ts:file']);
  });

  it('is nothing for a file that did not change', () => {
    expect(reviewItems(parseFileChange({ path: 'a.ts', oldContent: 'x\n', newContent: 'x\n' }))).toEqual([]);
  });
});

describe('binary files', () => {
  it('are detected from a NUL character, a binary patch, or the flag, and never diffed', () => {
    expect(parseFileChange({ path: 'a', oldContent: 'text', newContent: 'te\u0000xt' })).toMatchObject({
      binary: true,
      hunks: [],
    });
    const gitBinary = [
      'diff --git a/a.png b/a.png',
      'index 1..2 100644',
      'Binary files a/a.png and b/a.png differ',
      '',
    ];
    expect(parseFileChange({ path: 'a.png', patch: gitBinary.join('\n') })).toMatchObject({
      binary: true,
      status: 'modified',
    });
    const literal = ['diff --git a/a.png b/a.png', 'GIT binary patch', 'literal 10', 'zcmV?d00001', ''];
    expect(parseFileChange({ path: 'a.png', patch: literal.join('\n') }).binary).toBe(true);
    expect(parseFileChange({ path: 'a.bin', oldContent: 'a', newContent: 'b', binary: true }).hunks).toEqual([]);
    expect(parseFileChange({ path: 'a.txt', oldContent: 'a\u0000', newContent: 'b', binary: false }).binary).toBe(
      undefined,
    );
  });

  it('take the proposed contents when accepted, the original otherwise', () => {
    const file = parseFileChange({ path: 'a.png', oldContent: 'old\u0000', newContent: 'new\u0000' });
    const accept = computeReviewResult([file], { 'a.png:file': 'accepted' });
    expect(accept.files[0]).toMatchObject({ content: 'new\u0000', decision: 'accepted', binary: true });
    expect(computeReviewResult([file], {}).files[0]).toMatchObject({ content: 'old\u0000', decision: 'pending' });
  });

  it('read their git status from a patch', () => {
    const created = [
      'diff --git a/n.ts b/n.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/n.ts',
      '@@ -0,0 +1 @@',
      '+a',
      '',
    ];
    expect(parseFileChange({ path: 'n.ts', patch: created.join('\n') }).status).toBe('added');
    const gone = [
      'diff --git a/n.ts b/n.ts',
      'deleted file mode 100644',
      '--- a/n.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-a',
      '',
    ];
    expect(parseFileChange({ path: 'n.ts', patch: gone.join('\n') }).status).toBe('deleted');
  });
});

describe('line ranges', () => {
  it('number lines in the proposed file, or the original for removed lines only', () => {
    const file = route();
    const hunk = file.hunks[2]!; // the model id: one line removed, one added
    const del = hunk.lines.findIndex((l) => l.type === 'del');
    expect(linesRange(hunk, del, del)).toEqual({
      side: 'old',
      startLine: hunk.lines[del]!.oldNumber,
      endLine: hunk.lines[del]!.oldNumber,
    });
    expect(linesRange(hunk, del, del + 1)).toEqual({
      side: 'new',
      startLine: hunk.lines[del + 1]!.newNumber,
      endLine: hunk.lines[del + 1]!.newNumber,
    });
    // Backwards is the same range.
    expect(linesRange(hunk, del + 1, 0)).toEqual(linesRange(hunk, 0, del + 1));
  });

  it("give a hunk's changed lines for a comment on the hunk", () => {
    const hunk = route().hunks[1]!;
    const added = hunk.lines.filter((l) => l.type === 'add');
    expect(hunkRange(hunk)).toEqual({ side: 'new', startLine: added[0]!.newNumber, endLine: added.at(-1)!.newNumber });
  });
});

describe('contextGaps', () => {
  it('cover every unchanged line outside the hunks, numbered in both files', () => {
    const r = rng(3);
    for (let iter = 0; iter < 500; iter++) {
      const oldContent = randomFile(r);
      const newContent = mutate(r, oldContent);
      for (const context of [0, 1, 3]) {
        const file = parseFileChange({ path: 'f', oldContent, newContent }, { context });
        if (file.hunks.length === 0) continue;
        const oldLines = oldContent.replace(/\n$/, '').split('\n');
        const newLines = newContent.replace(/\n$/, '').split('\n');
        // The gaps' lines and the hunks' lines together are each file, line by line.
        const seenOld = new Set<number>();
        const seenNew = new Set<number>();
        for (const gap of contextGaps(file)) {
          for (const line of gapLines(file, gap, gap.oldStart, gap.oldEnd)) {
            expect(line.content).toBe(oldLines[line.oldNumber! - 1]);
            expect(line.content).toBe(newLines[line.newNumber! - 1]);
            seenOld.add(line.oldNumber!);
            seenNew.add(line.newNumber!);
          }
        }
        for (const line of file.hunks.flatMap((h) => h.lines)) {
          if (line.oldNumber) seenOld.add(line.oldNumber);
          if (line.newNumber) seenNew.add(line.newNumber);
        }
        expect(seenOld.size).toBe(oldContent === '' ? 0 : oldLines.length);
        expect(seenNew.size).toBe(newContent === '' ? 0 : newLines.length);
      }
    }
  });

  it('are none without both contents', () => {
    const patch = ['--- a/x', '+++ b/x', '@@ -3 +3 @@', '-a', '+b', ''].join('\n');
    expect(contextGaps(parseFileChange({ path: 'x', patch }))).toEqual([]);
  });
});

describe('computeReviewResult', () => {
  it("says how each file came out, and keeps the rejected hunks' lines", () => {
    const file = route();
    const [h0, h1, h2] = file.hunks;
    const result = computeReviewResult(
      [file],
      { [h0!.id]: 'accepted', [h2!.id]: 'rejected' },
      { viewed: { 'app/route.ts': true } },
    );
    expect(result.files[0]).toMatchObject({ decision: 'partial', viewed: true, status: 'modified', pending: [h1!.id] });
    expect(result.rejectedHunks).toEqual([
      {
        id: h2!.id,
        path: 'app/route.ts',
        header: h2!.header,
        diff: expect.stringContaining("-    model: openai('gpt-4o'),"),
      },
    ]);
    expect(computeReviewResult([file], {}).files[0]!.decision).toBe('pending');
    const all = Object.fromEntries(file.hunks.map((h) => [h.id, 'rejected' as const]));
    expect(computeReviewResult([file], all).files[0]!.decision).toBe('rejected');
    const unchanged = parseFileChange({ path: 'a.ts', oldContent: 'x\n', newContent: 'x\n' });
    expect(computeReviewResult([unchanged], {}).files[0]).toMatchObject({ decision: 'unchanged', content: 'x\n' });
  });

  it('gives every comment with the lines it is on', () => {
    const file = route();
    const hunk = file.hunks[1]!;
    const comments: DiffReviewComment[] = [
      {
        id: '1',
        fileId: 'app/route.ts',
        path: 'app/route.ts',
        target: 'hunk',
        hunkId: hunk.id,
        ...hunkRange(hunk),
        text: 'Use 503',
      },
      { id: '2', fileId: 'app/route.ts', path: 'app/route.ts', target: 'file', text: 'Split this file' },
      {
        id: '3',
        fileId: 'app/route.ts',
        path: 'app/route.ts',
        target: 'lines',
        hunkId: hunk.id,
        side: 'new',
        startLine: 999,
        endLine: 999,
        text: 'Lines no longer in the diff',
      },
    ];
    const result = computeReviewResult([file], {}, { comments });
    expect(result.comments[0]!.excerpt).toContain('+    return new Response(');
    expect(result.comments[1]).toEqual(comments[1]);
    // Kept, without an excerpt: they are still the reviewer's words.
    expect(result.comments[2]).toEqual(comments[2]);
  });

  it('marks a renamed file with its old path, and keeps it unchanged until accepted', () => {
    const file = parseFileChange({ path: 'b.ts', oldPath: 'a.ts', oldContent: 'x\n', newContent: 'x\n' });
    expect(computeReviewResult([file], { 'b.ts:file': 'rejected' }).files[0]).toMatchObject({
      path: 'b.ts',
      oldPath: 'a.ts',
      status: 'renamed',
      decision: 'rejected',
      content: 'x\n',
    });
  });
});

describe('toPatch', () => {
  it('applies with jsdiff to the files applyHunks gives, for any accepted hunks', () => {
    const r = rng(11);
    let checked = 0;
    for (let iter = 0; iter < 1500; iter++) {
      const oldContent = randomFile(r);
      const newContent = mutate(r, oldContent);
      const file = parseFileChange({ path: 'src/f.ts', oldContent, newContent }, { context: Math.floor(r() * 4) });
      if (file.hunks.length === 0) continue;
      const decisions = Object.fromEntries(
        file.hunks.map((h) => [h.id, r() < 0.5 ? ('accepted' as const) : ('rejected' as const)]),
      );
      const patch = toPatch([file], decisions);
      const accepted = file.hunks.filter((h) => decisions[h.id] === 'accepted').map((h) => h.id);
      if (accepted.length === 0) {
        expect(patch).toBe('');
        continue;
      }
      expect({ oldContent, newContent, patch, result: applyPatch(oldContent, patch) }).toEqual({
        oldContent,
        newContent,
        patch,
        result: applyHunks(file, accepted),
      });
      checked++;
    }
    expect(checked).toBeGreaterThan(800);
  });

  it('writes git headers for new, deleted, renamed and binary files', () => {
    const added = parseFileChange({ path: 'n.ts', oldContent: '', newContent: 'a\n' });
    const deleted = parseFileChange({ path: 'd.ts', oldContent: 'a\n', newContent: '' });
    const renamed = parseFileChange({ path: 'new.ts', oldPath: 'old.ts', oldContent: 'a\nb\n', newContent: 'a\nB\n' });
    const binary = parseFileChange({ path: 'i.png', oldContent: '1\u0000', newContent: '2\u0000' });
    const decisions = {
      'n.ts:0': 'accepted',
      'd.ts:0': 'accepted',
      'new.ts:0': 'accepted',
      'i.png:file': 'accepted',
    } as const;
    const patch = toPatch([added, deleted, renamed, binary], decisions);
    expect(patch).toContain(
      'diff --git a/n.ts b/n.ts\nnew file mode 100644\n--- /dev/null\n+++ b/n.ts\n@@ -0,0 +1,1 @@\n+a\n',
    );
    expect(patch).toContain('diff --git a/d.ts b/d.ts\ndeleted file mode 100644\n--- a/d.ts\n+++ /dev/null\n');
    expect(patch).toContain(
      'diff --git a/old.ts b/new.ts\nrename from old.ts\nrename to new.ts\n--- a/old.ts\n+++ b/new.ts\n',
    );
    expect(patch).toContain('diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n');
    // jsdiff reads it back: four files, with their kinds.
    const parsed = parsePatch(patch);
    expect(
      parsed.map((p) => [p.isCreate ?? false, p.isDelete ?? false, p.isRename ?? false, p.isBinary ?? false]),
    ).toEqual([
      [true, false, false, false],
      [false, true, false, false],
      [false, false, true, false],
      [false, false, false, true],
    ]);
  });

  it('keeps a missing final newline', () => {
    const file = parseFileChange({ path: 'a', oldContent: 'x\ny', newContent: 'x\nz' });
    const patch = toPatch([file], { 'a:0': 'accepted' });
    expect(patch).toContain('-y\n\\ No newline at end of file\n+z\n\\ No newline at end of file\n');
    expect(applyPatch('x\ny', patch)).toBe('x\nz');
  });

  it('keeps it in a hunk that fell back to replacing the region too', () => {
    const oldContent = Array.from({ length: 30 }, (_, i) => `a${i}`).join('\n');
    const newContent = Array.from({ length: 30 }, (_, i) => `b${i}`).join('\n');
    const file = parseFileChange({ path: 'a', oldContent, newContent }, { maxEditLength: 10 });
    expect(file.fallback).toBe('replace');
    expect(applyPatch(oldContent, toPatch([file], { 'a:0': 'accepted' }))).toBe(newContent);
  });
});

describe('reviewToolOutput and reviewResumeEntry', () => {
  const file = route();
  const [h0, h1, h2] = file.hunks;
  const comment: DiffReviewComment = {
    id: '1',
    fileId: 'app/route.ts',
    path: 'app/route.ts',
    target: 'lines',
    hunkId: h1!.id,
    side: 'new',
    startLine: h1!.newStart + 3,
    endLine: h1!.newStart + 3,
    text: 'Return 503 when Redis is down.',
  };
  const result = computeReviewResult([file], { [h0!.id]: 'accepted', [h2!.id]: 'rejected' }, { comments: [comment] });

  it('summarizes the review in a sentence and lists decisions, rejected hunks and comments', () => {
    const output = reviewToolOutput(result);
    expect(output.summary).toBe(
      'Applied 1 of 3 changes in 1 file, rejected 1, left 1 undecided. The reviewer left 1 comment.',
    );
    expect(output.files).toEqual([
      { path: 'app/route.ts', status: 'modified', decision: 'partial', content: applyHunks(file, [h0!.id]) },
    ]);
    expect(output.rejectedHunks).toEqual([{ path: 'app/route.ts', header: h2!.header, diff: expect.any(String) }]);
    expect(output.comments).toEqual([
      {
        path: 'app/route.ts',
        side: 'new',
        startLine: comment.startLine,
        endLine: comment.endLine,
        text: comment.text,
        excerpt: expect.any(String),
      },
    ]);
    // JSON as it is, so it is an AI SDK tool output.
    expect(JSON.parse(JSON.stringify(output))).toEqual(output);
  });

  it('sends a patch instead of contents when asked', () => {
    const patch = toPatch([file], { [h0!.id]: 'accepted' });
    const output = reviewToolOutput(result, { contents: false, patch });
    expect(output.files[0]).not.toHaveProperty('content');
    expect(output.patch).toBe(patch);
  });

  it('answers an AG-UI interrupt with the same payload', () => {
    expect(reviewResumeEntry('int-1', result)).toEqual({
      interruptId: 'int-1',
      status: 'resolved',
      payload: reviewToolOutput(result),
    });
  });

  it('says when nothing was decided', () => {
    expect(reviewToolOutput(computeReviewResult([file], {})).summary).toBe('Applied 0 of 3 changes, left 3 undecided.');
  });
});
