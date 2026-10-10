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
  /**
   * A binary file: shown as "Binary file, not shown" and decided as a whole. Detected when omitted:
   * contents with a NUL character in their first 8,000, or a patch that says `Binary files … differ`.
   */
  binary?: boolean | undefined;
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
  /** The last line of its file, with no newline after it (jsdiff's "No newline at end of file"). */
  noNewline?: true | undefined;
}

export interface DiffHunk {
  /** Stable id: `${fileId}:${index}`, e.g. `app/route.ts:0`. */
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
  /** The path, unless another id was given (`DiffReview` suffixes repeated paths: `a.ts#2`). */
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
  /** A binary file: no hunks, decided as a whole. */
  binary?: true | undefined;
  /**
   * `'replace'` when the diff went over `maxEditLength`: the changed region, from the first
   * changed line to the last, is one hunk that replaces it, with no word-level highlights.
   */
  fallback?: 'replace' | undefined;
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

function toDiffLines(hunk: StructuredPatchHunk, words: boolean): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldNo = hunk.oldLines === 0 ? hunk.oldStart + 1 : hunk.oldStart;
  let newNo = hunk.newLines === 0 ? hunk.newStart + 1 : hunk.newStart;
  for (const raw of hunk.lines) {
    const marker = raw[0];
    const content = raw.slice(1);
    if (marker === '\\') {
      // "\ No newline at end of file": the line before it ends its file.
      const last = lines.at(-1);
      if (last) last.noNewline = true;
      continue;
    }
    if (marker === '+') lines.push({ type: 'add', content, newNumber: newNo++ });
    else if (marker === '-') lines.push({ type: 'del', content, oldNumber: oldNo++ });
    else lines.push({ type: 'context', content, oldNumber: oldNo++, newNumber: newNo++ });
  }
  if (words) pairWordSegments(lines);
  return lines;
}

/**
 * jsdiff reads the clock on every call, for a `timeout` option the kit does not use (its limits are
 * deterministic). Reading the clock makes a render impure, and Next.js `cacheComponents` fails the
 * build on it, in Server and Client Components alike. Without a timeout the clock decides nothing,
 * so jsdiff gets a constant one for the length of its synchronous call.
 */
function withConstantClock<T>(fn: () => T): T {
  const now = Date.now;
  Date.now = () => 0;
  try {
    return fn();
  } finally {
    Date.now = now;
  }
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
        const changes = withConstantClock(() =>
          diffWordsWithSpace(del.content, add.content, { maxEditLength: WORD_DIFF_MAX_EDITS }),
        );
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

/**
 * The most lines added plus lines removed a file's diff may take before it is shown as one hunk
 * that replaces the changed region. Diffing costs about the square of this number: 2,000 is about
 * 0.2 s on a laptop, in a worker for large files, while 10,000 (a 5,000-line rewrite) was 2.7 s.
 */
export const DEFAULT_MAX_EDIT_LENGTH = 2_000;

export interface ParseFileChangeOptions {
  /** Lines of context around each change. Default 3. */
  context?: number | undefined;
  /** Id for the file and prefix of its hunk ids. Default: the path. */
  id?: string | undefined;
  /**
   * Past this many lines added plus lines removed, the changed region (from the first changed line
   * to the last) becomes one hunk that replaces it, and `fallback` is `'replace'`. Default 2,000.
   */
  maxEditLength?: number | undefined;
}

interface Lines {
  lines: string[];
  /** Whether the last line ends with a newline. */
  eol: boolean;
}

/** Whether line `i` of `a` equals line `j` of `b`, its line ending included, as jsdiff compares lines. */
function sameLine(a: Lines, i: number, b: Lines, j: number) {
  if (a.lines[i] !== b.lines[j]) return false;
  const aEnds = i < a.lines.length - 1 || a.eol;
  const bEnds = j < b.lines.length - 1 || b.eol;
  return aEnds === bEnds;
}

function joinLines(source: Lines, from: number, to: number) {
  if (to <= from) return '';
  const end = to === source.lines.length ? (source.eol ? '\n' : '') : '\n';
  return source.lines.slice(from, to).join('\n') + end;
}

type ContentDiff = { hunks: StructuredPatchHunk[]; fallback?: 'replace' | undefined };

/**
 * Hunks between two contents. The common first and last lines are set aside first (bar the context
 * the hunks show), so a large file with a small edit diffs only the region that changed. Past
 * `maxEditLength` the region becomes one replacing hunk; past `budget`, smaller than that, the
 * result is `undefined`, for the caller to finish elsewhere (DiffReview: in a worker).
 */
function diffContents(
  oldContent: string,
  newContent: string,
  context: number,
  maxEditLength: number,
  budget: number,
): ContentDiff | undefined {
  const a = splitLines(oldContent);
  const b = splitLines(newContent);
  let prefix = 0;
  const shortest = Math.min(a.lines.length, b.lines.length);
  while (prefix < shortest && sameLine(a, prefix, b, prefix)) prefix++;
  let suffix = 0;
  while (suffix < shortest - prefix && sameLine(a, a.lines.length - 1 - suffix, b, b.lines.length - 1 - suffix))
    suffix++;
  const oldMiddle = a.lines.length - prefix - suffix;
  const newMiddle = b.lines.length - prefix - suffix;
  if (oldMiddle === 0 && newMiddle === 0) return { hunks: [] };

  // Keep the context the hunks show; everything before or after it is the same on both sides.
  const before = Math.min(context, prefix);
  const after = Math.min(context, suffix);
  const from = prefix - before;
  const oldTo = a.lines.length - suffix + after;
  const newTo = b.lines.length - suffix + after;
  // Only inserted or only removed lines: one cheap pass, whatever their number.
  const oneSided = oldMiddle === 0 || newMiddle === 0;
  const limit = Math.min(maxEditLength, budget);
  const oldText = joinLines(a, from, oldTo);
  const newText = joinLines(b, from, newTo);
  const patch = withConstantClock(() =>
    oneSided
      ? structuredPatch('', '', oldText, newText, undefined, undefined, { context })
      : structuredPatch('', '', oldText, newText, undefined, undefined, { context, maxEditLength: limit }),
  );
  if (patch) {
    for (const hunk of patch.hunks) {
      hunk.oldStart += from;
      hunk.newStart += from;
    }
    return { hunks: patch.hunks };
  }
  if (budget < maxEditLength) return undefined;

  // Over the limit: the changed region, replaced. A side's last line gets jsdiff's marker when its
  // file ends without a newline, so the hunk reads as structuredPatch's would.
  const NO_NEWLINE = '\\ No newline at end of file';
  const run = (source: Lines, start: number, end: number, sign: string) => {
    const out = source.lines.slice(start, end).map((line) => sign + line);
    if (end === source.lines.length && end > start && !source.eol) out.push(NO_NEWLINE);
    return out;
  };
  const lines = [
    ...run(a, from, prefix, ' '),
    ...run(a, prefix, a.lines.length - suffix, '-'),
    ...run(b, prefix, b.lines.length - suffix, '+'),
    ...run(a, a.lines.length - suffix, oldTo, ' '),
  ];
  const hunk: StructuredPatchHunk = {
    oldStart: from + 1,
    oldLines: oldTo - from,
    newStart: from + 1,
    newLines: newTo - from,
    lines,
  };
  return { hunks: [hunk], fallback: 'replace' };
}

/**
 * Turn a `FileChange` into hunks with line numbers and word-level segments. Contents are diffed;
 * past `maxEditLength` the changed region is one replacing hunk (`fallback: 'replace'`).
 */
export function parseFileChange(change: FileChange, options: ParseFileChangeOptions = {}): ParsedFileDiff {
  return parseWithin(change, options, Infinity)!;
}

/**
 * `parseFileChange`, unless diffing the contents would take more than `budget` edits: then
 * `undefined`. Deterministic, so a server render and the hydrating client agree on which files
 * render at once and which wait for the worker.
 * @internal
 */
export function parseWithin(
  change: FileChange,
  options: ParseFileChangeOptions,
  budget: number,
): ParsedFileDiff | undefined {
  const id = options.id ?? change.path;
  const context = options.context ?? 3;
  const oldContent = change.oldContent ?? (change.patch ? undefined : '');
  const newContent = change.newContent ?? (change.patch ? undefined : '');
  const patched =
    change.patch && (oldContent === undefined || newContent === undefined) ? parsePatch(change.patch)[0] : undefined;
  const binary =
    change.binary ??
    (isBinaryText(oldContent) ||
      isBinaryText(newContent) ||
      !!patched?.isBinary ||
      (!!change.patch && /^GIT binary patch$/m.test(change.patch)));
  let hunks: StructuredPatchHunk[];
  let fallback: ContentDiff['fallback'];
  if (binary) {
    hunks = [];
  } else if (oldContent !== undefined && newContent !== undefined) {
    const diffed = diffContents(
      oldContent,
      newContent,
      context,
      options.maxEditLength ?? DEFAULT_MAX_EDIT_LENGTH,
      budget,
    );
    if (!diffed) return undefined;
    hunks = diffed.hunks;
    fallback = diffed.fallback;
  } else {
    hunks = patched?.hunks ?? [];
  }

  const parsed: DiffHunk[] = hunks.map((h, index) => {
    const lines = toDiffLines(h, !fallback);
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

  const renamed = !!change.oldPath && change.oldPath !== change.path;
  let status: FileStatus = 'modified';
  if (renamed) status = 'renamed';
  else if (change.oldContent === '' || (change.oldContent === undefined && !change.patch)) status = 'added';
  else if (change.newContent === '' || (change.newContent === undefined && !change.patch)) status = 'deleted';
  if (change.patch && change.oldContent === undefined && change.newContent === undefined) {
    status =
      patched?.isCreate || /^--- \/dev\/null/m.test(change.patch)
        ? 'added'
        : patched?.isDelete || /^\+\+\+ \/dev\/null/m.test(change.patch)
          ? 'deleted'
          : renamed || patched?.isRename || /^rename from /m.test(change.patch)
            ? 'renamed'
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
    ...(fallback ? { fallback } : {}),
    ...(binary ? { binary: true as const } : {}),
  };
}

/** Git's test: a NUL character in the first 8,000 characters. */
function isBinaryText(text: string | undefined) {
  return !!text && text.slice(0, 8_000).includes('\0');
}

function splitLines(text: string): Lines {
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
