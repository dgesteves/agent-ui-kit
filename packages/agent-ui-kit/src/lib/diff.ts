import { diffWordsWithSpace, parsePatch, structuredPatch, type StructuredPatchHunk } from 'diff';

/** A file edit proposed by an agent. Provide either full contents or a unified patch. */
export interface FileChange {
  path: string;
  /** Previous path, for renames. */
  oldPath?: string | undefined;
  /** Original file contents. Omit (or pass '') for new files. */
  oldContent?: string | undefined;
  /** Proposed file contents. Omit (or pass '') for deletions. */
  newContent?: string | undefined;
  /** A unified diff for this file, used when contents are not available. */
  patch?: string | undefined;
  /** Language id for highlighting, inferred from the extension when omitted. */
  language?: string | undefined;
}

export type DiffLineType = 'context' | 'add' | 'del';

export interface DiffSegment {
  text: string;
  /** True when this segment is the part of the line that changed. */
  changed: boolean;
}

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldNumber?: number | undefined;
  newNumber?: number | undefined;
  /** Word-level segments, present on add/del lines that pair with a counterpart. */
  segments?: DiffSegment[] | undefined;
}

export interface DiffHunk {
  /** Stable id: `${fileId}:${index}`. */
  id: string;
  index: number;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

export type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed';

export interface ParsedFileDiff {
  id: string;
  path: string;
  oldPath?: string | undefined;
  status: FileStatus;
  language: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  /** Original contents, when known. Needed to compute the reviewed result. */
  oldContent?: string | undefined;
  newContent?: string | undefined;
}

const EXT_LANG: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  mts: 'ts',
  cts: 'ts',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  css: 'css',
  md: 'md',
  mdx: 'md',
  sh: 'sh',
  bash: 'sh',
  yml: 'yaml',
  yaml: 'yaml',
  py: 'py',
};

export function inferLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? 'text';
}

function toDiffLines(hunk: StructuredPatchHunk): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldNo = hunk.oldLines === 0 ? hunk.oldStart + 1 : hunk.oldStart;
  let newNo = hunk.newLines === 0 ? hunk.newStart + 1 : hunk.newStart;
  for (const raw of hunk.lines) {
    const marker = raw[0];
    const content = raw.slice(1);
    if (marker === '\\') continue; // "\ No newline at end of file"
    if (marker === '+') lines.push({ type: 'add', content, newNumber: newNo++ });
    else if (marker === '-') lines.push({ type: 'del', content, oldNumber: oldNo++ });
    else lines.push({ type: 'context', content, oldNumber: oldNo++, newNumber: newNo++ });
  }
  pairWordSegments(lines);
  return lines;
}

/*
 * Word-level diffing is quadratic in the worst case: two rewritten 46k-character lines took 13 s.
 * Lines past these limits get no word highlights. Both are deterministic (unlike a timeout), so the
 * server and the client always agree. A line edited in more than 100 places is mostly new anyway.
 */
const WORD_DIFF_MAX_LINE = 10_000;
const WORD_DIFF_MAX_EDITS = 100;

/**
 * For each run of deletions immediately followed by the same number of additions,
 * compute word-level segments so the UI can highlight what changed inside a line.
 */
function pairWordSegments(lines: DiffLine[]) {
  let i = 0;
  while (i < lines.length) {
    if (lines[i]?.type !== 'del') {
      i++;
      continue;
    }
    let delEnd = i;
    while (lines[delEnd]?.type === 'del') delEnd++;
    let addEnd = delEnd;
    while (lines[addEnd]?.type === 'add') addEnd++;
    const dels = delEnd - i;
    const adds = addEnd - delEnd;
    if (dels > 0 && dels === adds) {
      for (let k = 0; k < dels; k++) {
        const del = lines[i + k]!;
        const add = lines[delEnd + k]!;
        if (Math.max(del.content.length, add.content.length) > WORD_DIFF_MAX_LINE) continue;
        const changes = diffWordsWithSpace(del.content, add.content, { maxEditLength: WORD_DIFF_MAX_EDITS });
        if (!changes) continue;
        const unchanged = changes.filter((c) => !c.added && !c.removed).reduce((n, c) => n + c.value.length, 0);
        // Only highlight when the lines are actually similar; otherwise it is just noise.
        if (unchanged / Math.max(del.content.length, add.content.length, 1) < 0.4) continue;
        del.segments = changes.filter((c) => !c.added).map((c) => ({ text: c.value, changed: !!c.removed }));
        add.segments = changes.filter((c) => !c.removed).map((c) => ({ text: c.value, changed: !!c.added }));
      }
    }
    i = Math.max(addEnd, i + 1);
  }
}

function hunkHeader(h: StructuredPatchHunk) {
  return `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
}

/** Turn a `FileChange` into hunks with line numbers and word-level segments. */
export function parseFileChange(change: FileChange, options: { context?: number } = {}): ParsedFileDiff {
  const id = change.path;
  const oldContent = change.oldContent ?? (change.patch ? undefined : '');
  const newContent = change.newContent ?? (change.patch ? undefined : '');
  let hunks: StructuredPatchHunk[];
  if (oldContent !== undefined && newContent !== undefined) {
    hunks = structuredPatch(change.oldPath ?? change.path, change.path, oldContent, newContent, undefined, undefined, {
      context: options.context ?? 3,
    }).hunks;
  } else if (change.patch) {
    hunks = parsePatch(change.patch)[0]?.hunks ?? [];
  } else {
    hunks = [];
  }

  const parsed: DiffHunk[] = hunks.map((h, index) => {
    const lines = toDiffLines(h);
    return {
      id: `${id}:${index}`,
      index,
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
      header: hunkHeader(h),
      lines,
      additions: lines.filter((l) => l.type === 'add').length,
      deletions: lines.filter((l) => l.type === 'del').length,
    };
  });

  let status: FileStatus = 'modified';
  if (change.oldPath && change.oldPath !== change.path) status = 'renamed';
  else if (change.oldContent === '' || (change.oldContent === undefined && !change.patch)) status = 'added';
  else if (change.newContent === '' || (change.newContent === undefined && !change.patch)) status = 'deleted';
  if (change.patch && change.oldContent === undefined && change.newContent === undefined) {
    status = /^--- \/dev\/null/m.test(change.patch)
      ? 'added'
      : /^\+\+\+ \/dev\/null/m.test(change.patch)
        ? 'deleted'
        : 'modified';
  }

  return {
    id,
    path: change.path,
    oldPath: change.oldPath,
    status,
    language: change.language ?? inferLanguage(change.path),
    hunks: parsed,
    additions: parsed.reduce((n, h) => n + h.additions, 0),
    deletions: parsed.reduce((n, h) => n + h.deletions, 0),
    oldContent,
    newContent,
  };
}

function splitLines(text: string): { lines: string[]; eol: boolean } {
  if (text === '') return { lines: [], eol: false };
  const eol = text.endsWith('\n');
  const lines = (eol ? text.slice(0, -1) : text).split('\n');
  return { lines, eol };
}

/**
 * Apply only the accepted hunks to the original contents.
 * Accepting every hunk yields `newContent`; rejecting every hunk yields `oldContent`.
 */
export function applyHunks(
  file: Pick<ParsedFileDiff, 'hunks' | 'oldContent' | 'newContent'>,
  accepted: ReadonlySet<string> | readonly string[],
): string {
  const acceptedSet = accepted instanceof Set ? accepted : new Set(accepted as readonly string[]);
  const old = splitLines(file.oldContent ?? '');
  const next = splitLines(file.newContent ?? '');
  const out: string[] = [];
  let cursor = 0;
  let eol = old.eol;
  const hunks = [...file.hunks].sort((a, b) => a.oldStart - b.oldStart);
  for (const hunk of hunks) {
    // jsdiff (structuredPatch and parsePatch alike) reports a pure insertion's `oldStart` as the
    // 1-based line it goes before, so every hunk starts at index `oldStart - 1`.
    const start = Math.max(0, hunk.oldStart - 1);
    out.push(...old.lines.slice(cursor, start));
    const take = acceptedSet.has(hunk.id);
    for (const line of hunk.lines) {
      if (line.type === 'context' || (take ? line.type === 'add' : line.type === 'del')) out.push(line.content);
    }
    cursor = start + hunk.oldLines;
    if (cursor >= old.lines.length && take) eol = next.eol;
  }
  out.push(...old.lines.slice(cursor));
  if (out.length === 0) return '';
  return out.join('\n') + (eol ? '\n' : '');
}

export type HunkDecision = 'pending' | 'accepted' | 'rejected';

export interface DiffReviewFileResult {
  path: string;
  /** File contents with only accepted hunks applied. `undefined` for patch-only input. */
  content: string | undefined;
  accepted: string[];
  rejected: string[];
  pending: string[];
}

export interface DiffReviewResult {
  files: DiffReviewFileResult[];
  accepted: number;
  rejected: number;
  pending: number;
}

/** Compute the review result for a set of parsed files and decisions. */
export function computeReviewResult(
  files: readonly ParsedFileDiff[],
  decisions: Readonly<Record<string, HunkDecision>>,
): DiffReviewResult {
  const out: DiffReviewFileResult[] = files.map((file) => {
    const pick = (d: HunkDecision) => file.hunks.filter((h) => (decisions[h.id] ?? 'pending') === d).map((h) => h.id);
    const accepted = pick('accepted');
    return {
      path: file.path,
      content: file.oldContent !== undefined && file.newContent !== undefined ? applyHunks(file, accepted) : undefined,
      accepted,
      rejected: pick('rejected'),
      pending: pick('pending'),
    };
  });
  return {
    files: out,
    accepted: out.reduce((n, f) => n + f.accepted.length, 0),
    rejected: out.reduce((n, f) => n + f.rejected.length, 0),
    pending: out.reduce((n, f) => n + f.pending.length, 0),
  };
}
